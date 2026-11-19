package com.questlearn.service;

import com.questlearn.dto.AnnouncementDto;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CreateAnnouncementRequest;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Announcement;
import com.questlearn.model.AnnouncementRead;
import com.questlearn.model.Cohort;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Course;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.AnnouncementReadRepository;
import com.questlearn.repository.AnnouncementRepository;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * A teacher's notes to a class, and the reading of them.
 *
 * <p>Reading is limited to the two audiences the note is written for: whoever runs
 * the course (its instructor, or an admin) sees every note with the class it was
 * addressed to; a learner must be enrolled and sees the course-wide notes plus the
 * ones for their own classes. A learner enrolled in the course but not in 10B never
 * learns what 10B was told.</p>
 *
 * <p>Read state is per reader and follows the same boundary: a note the caller
 * cannot read cannot be marked read either, because both go through the same
 * visibility check.</p>
 */
@Service
@RequiredArgsConstructor
public class AnnouncementService {

    private final AnnouncementRepository announcementRepository;
    private final AnnouncementReadRepository announcementReadRepository;
    private final CohortRepository cohortRepository;
    private final CohortMembershipRepository membershipRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final UserRepository userRepository;
    private final CourseService courseService;

    @Transactional(readOnly = true)
    public List<AnnouncementDto> list(Long courseId, AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        List<Cohort> cohorts = cohortRepository.findByCourseIdOrderByNameAsc(courseId);
        List<Announcement> visible = visibleAnnouncements(course, cohorts, principal);
        return toDtos(visible, cohorts, readIdsOf(principal, visible));
    }

    /**
     * The notes this caller may read: everything for whoever runs the course, the
     * course-wide notes and their own classes' notes for an enrolled learner. The
     * page and the read marker both come through here, so their audiences agree.
     */
    private List<Announcement> visibleAnnouncements(Course course, List<Cohort> cohorts,
                                                    AppUserPrincipal principal) {
        List<Announcement> announcements =
                announcementRepository.findByCourseIdOrderByCreatedAtDescIdDesc(course.getId());

        if (courseService.canManage(course, principal)) {
            return announcements;
        }
        if (principal.role() != Role.STUDENT) {
            throw ApiException.forbidden(
                    "Only the course instructor, an admin, or an enrolled learner can read these");
        }
        if (!enrollmentRepository.existsByUserIdAndCourseId(principal.id(), course.getId())) {
            throw ApiException.forbidden("Join the course to read its announcements");
        }
        // An archived term is unpublished too, but "not published yet" would imply it
        // is coming back. To a learner it is not.
        if (course.getArchivedAt() != null) {
            throw ApiException.forbidden("This course is no longer available");
        }
        if (!course.isPublished()) {
            throw ApiException.forbidden("This course is not published yet");
        }

        Set<Long> myClasses = classIdsOf(principal, cohorts);
        return announcements.stream()
                .filter(announcement -> announcement.getCohortId() == null
                        || myClasses.contains(announcement.getCohortId()))
                .toList();
    }

    @Transactional
    public AnnouncementDto create(Long courseId, CreateAnnouncementRequest request,
                                  AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        String body = request.body() == null ? "" : request.body().trim();
        if (body.isEmpty()) {
            throw ApiException.badRequest("Write the announcement before posting it");
        }
        // The 2000-character cap is the request DTO's @Size; trimming can only shrink it.

        Long cohortId = request.cohortId();
        String cohortName = null;
        if (cohortId != null) {
            Cohort cohort = cohortRepository.findById(cohortId)
                    .orElseThrow(() -> ApiException.notFound("Class not found"));
            if (!cohort.getCourseId().equals(courseId)) {
                throw ApiException.notFound("That class is not part of this course");
            }
            cohortName = cohort.getName();
        }

        Announcement saved = announcementRepository.save(Announcement.builder()
                .courseId(courseId)
                .cohortId(cohortId)
                .authorId(principal.id())
                .body(body)
                .build());
        // Its author has not read it back off the page, so the flag starts false.
        return toDto(saved, cohortName, authorName(saved.getAuthorId()), false);
    }

    /**
     * Records that the caller has read one note.
     *
     * <p>The note must be one the caller's page would show, so a learner cannot mark
     * a note outside their courses or their class read by guessing its id. Marking
     * twice is not an error and does not move the original timestamp.</p>
     */
    @Transactional
    public void markRead(Long announcementId, AppUserPrincipal principal) {
        Announcement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> ApiException.notFound("Announcement not found"));

        Course course = courseService.loadCourse(announcement.getCourseId());
        List<Cohort> cohorts = cohortRepository.findByCourseIdOrderByNameAsc(course.getId());
        boolean visible = visibleAnnouncements(course, cohorts, principal).stream()
                .anyMatch(candidate -> candidate.getId().equals(announcementId));
        if (!visible) {
            throw ApiException.forbidden("That announcement is not in your notices");
        }

        if (announcementReadRepository.existsByAnnouncementIdAndUserId(announcementId, principal.id())) {
            return;
        }
        announcementReadRepository.save(AnnouncementRead.builder()
                .announcementId(announcementId)
                .userId(principal.id())
                .build());
    }

    /**
     * Removing a note is the same permission as writing it: the course's instructor
     * or an admin. A learner who has read it keeps nothing to delete.
     */
    @Transactional
    public void delete(Long announcementId, AppUserPrincipal principal) {
        Announcement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> ApiException.notFound("Announcement not found"));
        Course course = courseService.loadCourse(announcement.getCourseId());
        courseService.assertCanManage(course, principal);
        announcementRepository.delete(announcement);
    }

    /** The classes of this course the learner belongs to; empty for a staff reader. */
    private Set<Long> classIdsOf(AppUserPrincipal principal, List<Cohort> cohorts) {
        if (cohorts.isEmpty()) {
            return Set.of();
        }
        List<Long> cohortIds = cohorts.stream().map(Cohort::getId).toList();
        return membershipRepository.findByUserIdAndCohortIdIn(principal.id(), cohortIds)
                .stream()
                .map(CohortMembership::getCohortId)
                .collect(Collectors.toSet());
    }

    /** The caller's read rows among this page of notes. */
    private Set<Long> readIdsOf(AppUserPrincipal principal, List<Announcement> announcements) {
        List<Long> ids = announcements.stream().map(Announcement::getId).toList();
        if (ids.isEmpty()) {
            return Set.of();
        }
        return announcementReadRepository.findByUserIdAndAnnouncementIdIn(principal.id(), ids)
                .stream()
                .map(AnnouncementRead::getAnnouncementId)
                .collect(Collectors.toSet());
    }

    private List<AnnouncementDto> toDtos(List<Announcement> announcements, List<Cohort> cohorts,
                                         Set<Long> readIds) {
        if (announcements.isEmpty()) {
            return List.of();
        }
        Map<Long, String> cohortNames = cohorts.stream()
                .collect(Collectors.toMap(Cohort::getId, Cohort::getName));
        Set<Long> authorIds = announcements.stream()
                .map(Announcement::getAuthorId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> authorNames = authorIds.isEmpty()
                ? Map.of()
                : userRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));
        return announcements.stream()
                .map(announcement -> toDto(
                        announcement,
                        announcement.getCohortId() == null
                                ? null
                                : cohortNames.get(announcement.getCohortId()),
                        announcement.getAuthorId() == null
                                ? null
                                : authorNames.get(announcement.getAuthorId()),
                        readIds.contains(announcement.getId())))
                .toList();
    }

    private AnnouncementDto toDto(Announcement announcement, String cohortName, String authorName,
                                  boolean read) {
        return new AnnouncementDto(
                announcement.getId(),
                announcement.getCourseId(),
                announcement.getCohortId(),
                cohortName,
                authorName,
                announcement.getBody(),
                announcement.getCreatedAt(),
                read);
    }

    private String authorName(Long authorId) {
        if (authorId == null) {
            return null;
        }
        return userRepository.findById(authorId).map(User::getName).orElse(null);
    }
}
