package com.questlearn.service;

import com.questlearn.dto.AnnouncementDto;
import com.questlearn.dto.AnnouncementFeedItemDto;
import com.questlearn.dto.AnnouncementFeedPage;
import com.questlearn.dto.AnnouncementReceiptRowDto;
import com.questlearn.dto.AnnouncementReceiptSummaryDto;
import com.questlearn.dto.AnnouncementReceiptsDto;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CreateAnnouncementRequest;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Announcement;
import com.questlearn.model.AnnouncementRead;
import com.questlearn.model.Cohort;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Course;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.AnnouncementReadRepository;
import com.questlearn.repository.AnnouncementRepository;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
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
 *
 * <p>The cross-course feed answers the learner's own question ("what arrived?") in
 * one request, and the receipts answer the instructor's ("did it land?"). Both read
 * the same audience definition, so a note cannot be visible to someone who is not
 * counted as a recipient.</p>
 */
@Service
@RequiredArgsConstructor
public class AnnouncementService {

    /** A page of notices or receipt rows; clamped so one request cannot ask for everything. */
    private static final int MAX_PAGE_SIZE = 50;
    private static final int DEFAULT_PAGE_SIZE = 20;

    private final AnnouncementRepository announcementRepository;
    private final AnnouncementReadRepository announcementReadRepository;
    private final AnnouncementReadRecorder announcementReadRecorder;
    private final CohortRepository cohortRepository;
    private final CohortMembershipRepository membershipRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final UserRepository userRepository;
    private final CourseRepository courseRepository;
    private final CourseService courseService;

    // ------------------------------------------------------------ course page

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
        assertLearnerCanReadCourse(course, principal);

        Set<Long> myClasses = classIdsOf(principal, cohorts);
        return announcements.stream()
                .filter(announcement -> announcement.getCohortId() == null
                        || myClasses.contains(announcement.getCohortId()))
                .toList();
    }

    /**
     * The four conditions a learner's read depends on, shared by the list and the
     * single-note check. The class boundary is applied separately because the list
     * filters a page while a single note only needs the one membership answer.
     */
    private void assertLearnerCanReadCourse(Course course, AppUserPrincipal principal) {
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
    }

    /**
     * The same rule for one note, without loading the rest of the course first.
     *
     * <p>{@link #visibleAnnouncements} filters a page; a read marker only needs to
     * know whether this one note is inside the caller's audience, which is a class
     * membership question rather than a scan of every note the course ever had.</p>
     */
    private void assertCanReadOne(Announcement announcement, Course course,
                                  AppUserPrincipal principal) {
        if (courseService.canManage(course, principal)) {
            return;
        }
        assertLearnerCanReadCourse(course, principal);
        if (announcement.getCohortId() != null
                && !membershipRepository.existsByCohortIdAndUserId(
                        announcement.getCohortId(), principal.id())) {
            throw ApiException.forbidden("That announcement is not in your notices");
        }
    }

    // --------------------------------------------------------------- writing

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
        // The author has just written it, so it is not waiting for them. The row is
        // written here rather than through the recorder because the announcement is
        // not committed yet: a second transaction could not reference it.
        announcementReadRepository.save(AnnouncementRead.builder()
                .announcementId(saved.getId())
                .userId(principal.id())
                .build());
        return toDto(saved, cohortName, authorName(saved.getAuthorId()), true);
    }

    /**
     * Records that the caller has read one note.
     *
     * <p>The note must be one the caller's page would show, so a learner cannot mark
     * a note outside their courses or their class read by guessing its id.</p>
     *
     * <p>Marking twice is not an error, and the unique pair on the table decides it
     * rather than a lookup beforehand: two tabs racing each other both end up with
     * one row, a 204 each, and the first read time stands. The insert is its own
     * transaction for that reason; a duplicate caught inside this one would already
     * have marked it rollback-only.</p>
     */
    @Transactional
    public void markRead(Long announcementId, AppUserPrincipal principal) {
        Announcement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> ApiException.notFound("Announcement not found"));

        Course course = courseService.loadCourse(announcement.getCourseId());
        assertCanReadOne(announcement, course, principal);

        try {
            announcementReadRecorder.record(announcementId, principal.id());
        } catch (DataIntegrityViolationException duplicate) {
            // The pair already has a row, which is this same call succeeding
            // somewhere else. Any other integrity failure is not a success.
            if (!announcementReadRepository.existsByAnnouncementIdAndUserId(announcementId, principal.id())) {
                throw duplicate;
            }
        }
    }

    /**
     * Marks every note in the caller's feed read, and nothing outside it.
     *
     * <p>It returns how many notes were still unread, which is the number the page
     * had on screen. Each insert commits on its own so one note racing another tab
     * cannot roll back the rest; a note deleted between the read and the insert is
     * simply no longer visible, so skipping it is the same outcome as marking it.</p>
     */
    @Transactional
    public int markAllRead(AppUserPrincipal principal) {
        FeedScope scope = feedScope(principal);
        if (scope.announcements().isEmpty()) {
            return 0;
        }
        Set<Long> readIds = readIdsOf(principal, scope.announcements());
        List<Long> unread = scope.announcements().stream()
                .map(Announcement::getId)
                .filter(id -> !readIds.contains(id))
                .toList();

        for (Long announcementId : unread) {
            try {
                announcementReadRecorder.record(announcementId, principal.id());
            } catch (DataIntegrityViolationException duplicate) {
                // Another tab wrote this row first, or the note went away mid-flight.
                // Either way there is nothing left for this call to do.
            }
        }
        return unread.size();
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

    // ------------------------------------------------------------ learner feed

    /**
     * Every note across the learner's courses, newest first, one query per concern.
     *
     * <p>Filtering to unread and to one course happens after the audience is
     * resolved, because the audience is what makes the list correct: a class note
     * must never appear because its course matched. Paging is applied to the
     * resolved list, which is bounded by the notes in the courses a learner is
     * actually enrolled on.</p>
     *
     * @param courseId   optional narrowing to one course, ignored when the learner
     *                   cannot see it so a probe learns nothing from the answer
     * @param unreadOnly when true, only notes without a read row are returned
     */
    @Transactional(readOnly = true)
    public AnnouncementFeedPage feed(AppUserPrincipal principal, int page, int size,
                                     Long courseId, boolean unreadOnly) {
        FeedScope scope = feedScope(principal);
        Set<Long> readIds = readIdsOf(principal, scope.announcements());
        long unreadCount = scope.announcements().stream()
                .filter(note -> !readIds.contains(note.getId()))
                .count();

        List<Announcement> notes = scope.announcements().stream()
                .filter(note -> courseId == null || courseId.equals(note.getCourseId()))
                .filter(note -> !unreadOnly || !readIds.contains(note.getId()))
                .toList();

        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        int totalPages = notes.isEmpty() ? 0 : (notes.size() + safeSize - 1) / safeSize;
        int from = Math.min(safePage * safeSize, notes.size());
        int to = Math.min(from + safeSize, notes.size());

        return new AnnouncementFeedPage(
                toFeedDtos(notes.subList(from, to), scope, readIds),
                unreadCount,
                notes.size(),
                safePage,
                safeSize,
                totalPages);
    }

    /** The number the nav badge shows, without downloading a page of notes. */
    @Transactional(readOnly = true)
    public long unreadCount(AppUserPrincipal principal) {
        FeedScope scope = feedScope(principal);
        if (scope.announcements().isEmpty()) {
            return 0;
        }
        Set<Long> readIds = readIdsOf(principal, scope.announcements());
        return scope.announcements().stream()
                .filter(note -> !readIds.contains(note.getId()))
                .count();
    }

    /**
     * Everything the learner could be shown, resolved in a fixed number of queries.
     *
     * <p>An archived or unpublished course drops out instead of failing the whole
     * feed: one finished term must not take the learner's remaining notices with it.
     * Staff have no feed of their own; their view is the studio panel.</p>
     */
    private FeedScope feedScope(AppUserPrincipal principal) {
        if (principal.role() != Role.STUDENT) {
            throw ApiException.forbidden("Only a learner has a notices feed");
        }
        Set<Long> enrolledIds = enrollmentRepository
                .findByUserIdOrderByEnrolledAtDesc(principal.id()).stream()
                .map(Enrollment::getCourseId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (enrolledIds.isEmpty()) {
            return FeedScope.empty();
        }

        Map<Long, Course> courses = courseRepository.findAllById(enrolledIds).stream()
                .filter(Course::isPublished)
                .filter(course -> course.getArchivedAt() == null)
                .collect(Collectors.toMap(Course::getId, Function.identity()));
        if (courses.isEmpty()) {
            return FeedScope.empty();
        }

        List<Cohort> cohorts = cohortRepository.findByCourseIdInOrderByNameAsc(courses.keySet());
        Map<Long, String> cohortNames = cohorts.stream()
                .collect(Collectors.toMap(Cohort::getId, Cohort::getName));
        Set<Long> myClasses = cohorts.isEmpty()
                ? Set.of()
                : membershipRepository.findByUserIdAndCohortIdIn(
                        principal.id(), cohorts.stream().map(Cohort::getId).toList())
                .stream()
                .map(CohortMembership::getCohortId)
                .collect(Collectors.toSet());

        List<Announcement> visible = announcementRepository
                .findByCourseIdInOrderByCreatedAtDescIdDesc(courses.keySet()).stream()
                .filter(note -> note.getCohortId() == null || myClasses.contains(note.getCohortId()))
                .toList();

        return new FeedScope(visible, courses, cohortNames);
    }

    private List<AnnouncementFeedItemDto> toFeedDtos(List<Announcement> announcements,
                                                     FeedScope scope, Set<Long> readIds) {
        if (announcements.isEmpty()) {
            return List.of();
        }
        Map<Long, String> authorNames = authorNamesOf(announcements);
        return announcements.stream()
                .map(note -> {
                    Course course = scope.courses().get(note.getCourseId());
                    return new AnnouncementFeedItemDto(
                            note.getId(),
                            note.getCourseId(),
                            course == null ? null : course.getTitle(),
                            course == null ? null : course.getEmoji(),
                            note.getCohortId(),
                            note.getCohortId() == null
                                    ? null
                                    : scope.cohortNames().get(note.getCohortId()),
                            note.getAuthorId() == null
                                    ? null
                                    : authorNames.get(note.getAuthorId()),
                            note.getBody(),
                            note.getCreatedAt(),
                            readIds.contains(note.getId()));
                })
                .toList();
    }

    /** The resolved feed: the notes plus the names needed to label them. */
    private record FeedScope(List<Announcement> announcements, Map<Long, Course> courses,
                             Map<Long, String> cohortNames) {

        static FeedScope empty() {
            return new FeedScope(List.of(), Map.of(), Map.of());
        }
    }

    // --------------------------------------------------------------- receipts

    /**
     * Read counts for every note in one course, for the studio's list.
     *
     * <p>Recipients are the current audience: every enrolled learner for a
     * course-wide note, the class list for a class note. Reads are intersected with
     * that audience, so an author's own read row or a reader from another class
     * cannot push the percentage past 100.</p>
     */
    @Transactional(readOnly = true)
    public List<AnnouncementReceiptSummaryDto> receiptSummaries(Long courseId,
                                                               AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        List<Announcement> announcements =
                announcementRepository.findByCourseIdOrderByCreatedAtDescIdDesc(courseId);
        if (announcements.isEmpty()) {
            return List.of();
        }

        Audience audience = audienceOf(courseId, announcements);
        Map<Long, Long> readCounts = readCountsOf(announcements, audience);

        return announcements.stream()
                .map(note -> new AnnouncementReceiptSummaryDto(
                        note.getId(),
                        audience.usersFor(note).size(),
                        readCounts.getOrDefault(note.getId(), 0L),
                        percent(readCounts.getOrDefault(note.getId(), 0L),
                                audience.usersFor(note).size())))
                .toList();
    }

    /**
     * Who has and has not read one note, paged.
     *
     * <p>The counts cover the whole audience; only the rows are paged. Names are
     * enough for a teacher to chase a learner, so no address is exposed here.</p>
     */
    @Transactional(readOnly = true)
    public AnnouncementReceiptsDto receipts(Long announcementId, String status, int page, int size,
                                            AppUserPrincipal principal) {
        Announcement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> ApiException.notFound("Announcement not found"));
        Course course = courseService.loadCourse(announcement.getCourseId());
        courseService.assertCanManage(course, principal);

        String wanted = status == null ? "unread" : status.trim().toLowerCase(Locale.ROOT);
        if (!wanted.equals("unread") && !wanted.equals("read") && !wanted.equals("all")) {
            throw ApiException.badRequest("Status must be unread, read or all");
        }

        Audience audience = audienceOf(course.getId(), List.of(announcement));
        Set<Long> recipients = audience.usersFor(announcement);
        Map<Long, AnnouncementRead> reads = recipients.isEmpty()
                ? Map.of()
                : announcementReadRepository
                .findByAnnouncementIdAndUserIdIn(announcementId, recipients).stream()
                .collect(Collectors.toMap(AnnouncementRead::getUserId, Function.identity()));

        Map<Long, String> names = recipients.isEmpty()
                ? Map.of()
                : userRepository.findAllById(recipients).stream()
                .collect(Collectors.toMap(User::getId, User::getName));

        List<AnnouncementReceiptRowDto> matching = recipients.stream()
                .filter(userId -> switch (wanted) {
                    case "read" -> reads.containsKey(userId);
                    case "unread" -> !reads.containsKey(userId);
                    default -> true;
                })
                .map(userId -> new AnnouncementReceiptRowDto(
                        userId,
                        names.getOrDefault(userId, "Removed account"),
                        reads.containsKey(userId) ? reads.get(userId).getReadAt() : null))
                .sorted(Comparator.comparing(AnnouncementReceiptRowDto::name,
                        String.CASE_INSENSITIVE_ORDER))
                .toList();

        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        int totalPages = matching.isEmpty() ? 0 : (matching.size() + safeSize - 1) / safeSize;
        int from = Math.min(safePage * safeSize, matching.size());
        int to = Math.min(from + safeSize, matching.size());

        return new AnnouncementReceiptsDto(
                announcementId,
                recipients.size(),
                reads.size(),
                percent(reads.size(), recipients.size()),
                matching.subList(from, to),
                safePage,
                safeSize,
                totalPages);
    }

    /**
     * The audience of a page of notes, resolved once per course and per class.
     *
     * <p>A course-wide note addresses every enrolled learner; a class note addresses
     * the class list, which is also who the visibility rule lets read it.</p>
     */
    private Audience audienceOf(Long courseId, List<Announcement> announcements) {
        Set<Long> everyone = enrollmentRepository.findByCourseIdOrderByEnrolledAtAsc(courseId)
                .stream()
                .map(Enrollment::getUserId)
                .collect(Collectors.toSet());
        Map<Long, Set<Long>> byCohort = new HashMap<>();
        for (Long cohortId : announcements.stream()
                .map(Announcement::getCohortId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet())) {
            byCohort.put(cohortId, membershipRepository
                    .findByCohortIdOrderByJoinedAtAsc(cohortId).stream()
                    .map(CohortMembership::getUserId)
                    .collect(Collectors.toSet()));
        }
        return new Audience(everyone, byCohort);
    }

    private record Audience(Set<Long> everyone, Map<Long, Set<Long>> byCohort) {

        Set<Long> usersFor(Announcement announcement) {
            return announcement.getCohortId() == null
                    ? everyone
                    : byCohort.getOrDefault(announcement.getCohortId(), Set.of());
        }
    }

    /** One read-table query for the page, then a count per note inside its audience. */
    private Map<Long, Long> readCountsOf(List<Announcement> announcements, Audience audience) {
        Map<Long, Announcement> byId = announcements.stream()
                .collect(Collectors.toMap(Announcement::getId, Function.identity()));
        List<Long> ids = announcements.stream().map(Announcement::getId).toList();

        Map<Long, Long> counts = new HashMap<>();
        for (AnnouncementRead row : announcementReadRepository.findByAnnouncementIdIn(ids)) {
            Announcement note = byId.get(row.getAnnouncementId());
            if (note != null && audience.usersFor(note).contains(row.getUserId())) {
                counts.merge(note.getId(), 1L, Long::sum);
            }
        }
        return counts;
    }

    private static int percent(long read, long recipients) {
        if (recipients <= 0) {
            return 0;
        }
        return (int) Math.round(100.0 * read / recipients);
    }

    // ---------------------------------------------------------------- mapping

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
        Collection<Long> ids = announcements.stream().map(Announcement::getId).toList();
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
        Map<Long, String> authorNames = authorNamesOf(announcements);
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

    private Map<Long, String> authorNamesOf(List<Announcement> announcements) {
        Set<Long> authorIds = announcements.stream()
                .map(Announcement::getAuthorId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (authorIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));
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
