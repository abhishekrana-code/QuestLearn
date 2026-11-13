package com.questlearn.service;

import com.questlearn.dto.CohortDto;
import com.questlearn.dto.CohortJoinResponse;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Cohort;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Course;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Role;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.EnrollmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;

/**
 * Cohorts: the class behind a course.
 *
 * <p>A join code is the only thing a student needs. Typing it does two things at
 * once - puts them on the class list and enrolls them in the course - because
 * otherwise "I joined the class but the course is not on my dashboard" would be
 * a support ticket every term.</p>
 */
@Service
@RequiredArgsConstructor
public class CohortService {

    /** No 0/O/1/I: a code gets read aloud in a classroom and typed on a phone. */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int CODE_LENGTH = 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final CohortRepository cohortRepository;
    private final CohortMembershipRepository membershipRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final CourseService courseService;

    @Transactional(readOnly = true)
    public List<CohortDto> list(Long courseId, AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanManage(course, principal);
        return cohortRepository.findByCourseIdOrderByNameAsc(courseId).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public CohortDto create(Long courseId, String name, AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        String cleaned = name == null ? "" : name.trim();
        if (cleaned.isEmpty()) {
            throw ApiException.badRequest("Give the class a name");
        }
        if (cleaned.length() > 120) {
            throw ApiException.badRequest("Keep the name under 120 characters");
        }

        Cohort cohort = cohortRepository.save(Cohort.builder()
                .courseId(courseId)
                .name(cleaned)
                .joinCode(nextJoinCode())
                .build());
        return toDto(cohort);
    }

    /**
     * Deleting a class removes its list only. Members stay enrolled in the course
     * and keep every node they cleared, because a term being tidied up must never
     * cost a student their work.
     */
    @Transactional
    public void delete(Long cohortId, AppUserPrincipal principal) {
        Cohort cohort = cohortRepository.findById(cohortId)
                .orElseThrow(() -> ApiException.notFound("Class not found"));
        Course course = courseService.loadCourse(cohort.getCourseId());
        courseService.assertCanManage(course, principal);
        cohortRepository.delete(cohort);
    }

    @Transactional
    public CohortJoinResponse join(String code, AppUserPrincipal principal) {
        if (principal.role() != Role.STUDENT) {
            throw ApiException.forbidden("Only students join a class");
        }
        String cleaned = code == null ? "" : code.trim().replace(" ", "");
        if (cleaned.isEmpty()) {
            throw ApiException.badRequest("Enter the class code");
        }

        Cohort cohort = cohortRepository.findByJoinCodeIgnoreCase(cleaned)
                .orElseThrow(() -> ApiException.notFound("No class matches that code"));
        Course course = courseService.loadCourse(cohort.getCourseId());
        // A code for an unpublished or archived course must not become a back door.
        courseService.assertCanView(course, principal);

        boolean alreadyMember = membershipRepository
                .existsByCohortIdAndUserId(cohort.getId(), principal.id());
        if (!alreadyMember) {
            membershipRepository.save(CohortMembership.builder()
                    .cohortId(cohort.getId())
                    .userId(principal.id())
                    .build());
        }
        if (!enrollmentRepository.existsByUserIdAndCourseId(principal.id(), course.getId())) {
            enrollmentRepository.save(Enrollment.builder()
                    .userId(principal.id())
                    .courseId(course.getId())
                    .build());
        }

        return new CohortJoinResponse(
                cohort.getId(),
                cohort.getName(),
                course.getId(),
                course.getTitle(),
                alreadyMember);
    }

    private CohortDto toDto(Cohort cohort) {
        return new CohortDto(
                cohort.getId(),
                cohort.getCourseId(),
                cohort.getName(),
                cohort.getJoinCode(),
                membershipRepository.countByCohortId(cohort.getId()),
                cohort.getCreatedAt());
    }

    private String nextJoinCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder code = new StringBuilder(CODE_LENGTH);
            for (int index = 0; index < CODE_LENGTH; index++) {
                code.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
            }
            String candidate = code.toString();
            if (!cohortRepository.existsByJoinCode(candidate)) {
                return candidate;
            }
        }
        throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                "Could not allocate a class code");
    }
}
