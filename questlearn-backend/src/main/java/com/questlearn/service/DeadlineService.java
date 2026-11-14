package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.DeadlineDto;
import com.questlearn.dto.DeadlineOverviewDto;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Cohort;
import com.questlearn.model.CohortDeadline;
import com.questlearn.model.Course;
import com.questlearn.model.DeadlineState;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CohortDeadlineRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Deadlines are advisory, not gates.
 *
 * <p>A dated node stays playable after its due date; the product records that a
 * completion was late. That is the least destructive default for a real class:
 * a mail outage or a sick student never becomes an access-control incident, and
 * the teacher still sees who was late on the roster and the digest.</p>
 */
@Service
@RequiredArgsConstructor
public class DeadlineService {

    private final ModuleRepository moduleRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final UserModuleProgressRepository progressRepository;
    private final UserRepository userRepository;
    private final CourseService courseService;
    private final DeadlineStateResolver stateResolver;
    private final AuditService auditService;
    private final EffectiveDeadlines effectiveDeadlines;
    private final CohortRepository cohortRepository;
    private final CohortDeadlineRepository cohortDeadlineRepository;

    @Transactional
    public DeadlineDto setDeadline(Long courseId, Long moduleId, Instant dueAt,
                                   AppUserPrincipal principal) {
        Module module = moduleRepository.findByIdAndCourseId(moduleId, courseId)
                .orElseThrow(() -> ApiException.notFound("That node is not part of this course"));
        courseService.assertCanManage(module.getCourse(), principal);

        module.setDueAt(dueAt);
        moduleRepository.save(module);
        auditService.record(principal, "module.deadline_set", module.getTitle(),
                "Course " + courseId + "; due " + dueAt);
        return toDto(module, module.getDueAt(), null, null);
    }

    @Transactional
    public DeadlineDto clearDeadline(Long courseId, Long moduleId, AppUserPrincipal principal) {
        Module module = moduleRepository.findByIdAndCourseId(moduleId, courseId)
                .orElseThrow(() -> ApiException.notFound("That node is not part of this course"));
        courseService.assertCanManage(module.getCourse(), principal);

        module.setDueAt(null);
        moduleRepository.save(module);
        auditService.record(principal, "module.deadline_cleared", module.getTitle(),
                "Course " + courseId);
        return toDto(module, module.getDueAt(), null, null);
    }

    /**
     * One class writes the test on a different day. The override applies only to
     * that class's members and leaves the node's own date untouched.
     */
    @Transactional
    public DeadlineDto setCohortDeadline(Long courseId, Long cohortId, Long moduleId,
                                         Instant dueAt, AppUserPrincipal principal) {
        Module module = requireModule(courseId, moduleId, principal);
        Cohort cohort = requireCohort(courseId, cohortId);

        CohortDeadline row = cohortDeadlineRepository
                .findByCohortIdAndModuleId(cohortId, moduleId)
                .orElseGet(() -> CohortDeadline.builder()
                        .cohortId(cohortId)
                        .moduleId(moduleId)
                        .build());
        row.setDueAt(dueAt);
        cohortDeadlineRepository.save(row);

        auditService.record(principal, "cohort.deadline_set", module.getTitle(),
                "Class " + cohort.getName() + "; course " + courseId + "; due " + dueAt);
        return toDto(module, dueAt, null, null);
    }

    @Transactional
    public void clearCohortDeadline(Long courseId, Long cohortId, Long moduleId,
                                    AppUserPrincipal principal) {
        Module module = requireModule(courseId, moduleId, principal);
        Cohort cohort = requireCohort(courseId, cohortId);

        cohortDeadlineRepository.findByCohortIdAndModuleId(cohortId, moduleId)
                .ifPresent(cohortDeadlineRepository::delete);
        auditService.record(principal, "cohort.deadline_cleared", module.getTitle(),
                "Class " + cohort.getName() + "; course " + courseId);
    }

    /** The class's overrides, for the studio. Falls back to nothing, never to the node date. */
    @Transactional(readOnly = true)
    public List<DeadlineDto> cohortOverrides(Long courseId, Long cohortId,
                                             AppUserPrincipal principal) {
        requireCohort(courseId, cohortId);
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        return cohortDeadlineRepository.findByCohortIdOrderByDueAtAsc(cohortId).stream()
                .map(row -> moduleRepository.findById(row.getModuleId())
                        .map(module -> toDto(module, row.getDueAt(), null, null))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private Module requireModule(Long courseId, Long moduleId, AppUserPrincipal principal) {
        Module module = moduleRepository.findByIdAndCourseId(moduleId, courseId)
                .orElseThrow(() -> ApiException.notFound("That node is not part of this course"));
        courseService.assertCanManage(module.getCourse(), principal);
        return module;
    }

    private Cohort requireCohort(Long courseId, Long cohortId) {
        Cohort cohort = cohortRepository.findById(cohortId)
                .orElseThrow(() -> ApiException.notFound("That class does not exist"));
        if (!courseId.equals(cohort.getCourseId())) {
            throw ApiException.notFound("That class does not belong to this course");
        }
        return cohort;
    }

    /**
     * The learner's dated nodes across every course they joined, soonest first.
     *
     * <p>Completed work stays in the list (the panel can show it quietly) but is
     * sorted after the work that still needs attention. A course that was
     * unpublished or archived drops out, exactly as it does everywhere else.</p>
     */
    @Transactional(readOnly = true)
    public DeadlineOverviewDto overview(AppUserPrincipal principal) {
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));
        if (principal.role() != Role.STUDENT) {
            return new DeadlineOverviewDto(List.of(), user.isNotifyDeadlines());
        }

        List<Enrollment> enrollments = enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(user.getId());
        if (enrollments.isEmpty()) {
            return new DeadlineOverviewDto(List.of(), user.isNotifyDeadlines());
        }
        Set<Long> courseIds = enrollments.stream()
                .map(Enrollment::getCourseId)
                .collect(Collectors.toSet());

        // A class override can date a node that has no course-wide date, so the
        // candidate set is every node in the learner's courses, not only dated ones.
        Map<Long, Instant> overrides = effectiveDeadlines.overridesFor(user.getId(), courseIds);
        List<Module> modules = moduleRepository.findByCourseIdIn(courseIds).stream()
                .filter(module -> module.getCourse().isPublished())
                .filter(module -> module.getCourse().getArchivedAt() == null)
                .filter(module -> effectiveDeadlines.dueAt(module, overrides) != null)
                .sorted(Comparator
                        .comparing((Module module) -> effectiveDeadlines.dueAt(module, overrides))
                        .thenComparing(Module::getTitle, String.CASE_INSENSITIVE_ORDER))
                .toList();
        if (modules.isEmpty()) {
            return new DeadlineOverviewDto(List.of(), user.isNotifyDeadlines());
        }

        Map<Long, UserModuleProgress> progress = new HashMap<>();
        progressRepository.findByUserId(user.getId())
                .forEach(row -> progress.put(row.getModule().getId(), row));

        Instant now = Instant.now();
        List<DeadlineDto> deadlines = new ArrayList<>(modules.size());
        for (Module module : modules) {
            UserModuleProgress row = progress.get(module.getId());
            deadlines.add(toDto(module, effectiveDeadlines.dueAt(module, overrides),
                    row == null ? null : row.getCompletedAt(), now));
        }

        deadlines.sort(Comparator
                .comparingInt((DeadlineDto deadline) -> openRank(deadline.state()))
                .thenComparing(DeadlineDto::dueAt)
                .thenComparing(DeadlineDto::moduleTitle, String.CASE_INSENSITIVE_ORDER));

        return new DeadlineOverviewDto(deadlines, user.isNotifyDeadlines());
    }

    /** Unfinished work first, then finished work, each by date. */
    private static int openRank(DeadlineState state) {
        return state == DeadlineState.COMPLETED || state == DeadlineState.COMPLETED_LATE ? 1 : 0;
    }

    private DeadlineDto toDto(Module module, Instant dueAt, Instant completedAt, Instant now) {
        Course course = module.getCourse();
        DeadlineState state = now == null
                ? null
                : stateResolver.resolve(dueAt, completedAt, now);
        return new DeadlineDto(
                module.getId(),
                module.getTitle(),
                course.getId(),
                course.getTitle(),
                course.getEmoji(),
                dueAt,
                module.getXpReward(),
                state,
                completedAt);
    }
}
