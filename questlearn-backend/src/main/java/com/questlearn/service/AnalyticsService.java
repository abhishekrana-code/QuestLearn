package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseAnalyticsDto;
import com.questlearn.dto.NodeFunnelDto;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Cohort;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Course;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.ModuleAttempt;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Where learners stop.
 *
 * <p>The roster shows one learner at a time, which answers a different question. This
 * walks the whole course: for each node, who reached it, who tried it, who cleared it,
 * and how long the clearing took. A node with a large gap between reached and cleared
 * is the one worth teaching again.</p>
 *
 * <p>Counts are honest about what the product records. "Reached" means a progress row
 * exists and is not locked, "started" means at least one quiz attempt, and "cleared"
 * means the progress row says COMPLETED. A learner who opens a node and closes it
 * counts as reached and not started, which is the distinction a teacher wants.</p>
 */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final CourseService courseService;
    private final EnrollmentRepository enrollmentRepository;
    private final CohortRepository cohortRepository;
    private final CohortMembershipRepository membershipRepository;
    private final ModuleRepository moduleRepository;
    private final UserModuleProgressRepository progressRepository;
    private final ModuleAttemptRepository attemptRepository;

    @Transactional(readOnly = true)
    public CourseAnalyticsDto course(Long courseId, Long cohortId, AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        String cohortName = null;
        List<Long> learnerIds;
        if (cohortId != null) {
            Cohort cohort = cohortRepository.findById(cohortId)
                    .filter(found -> found.getCourseId().equals(courseId))
                    .orElseThrow(() -> ApiException.notFound("That class does not belong to this course"));
            cohortName = cohort.getName();
            learnerIds = membershipRepository.findByCohortIdOrderByJoinedAtAsc(cohortId).stream()
                    .map(CohortMembership::getUserId)
                    .distinct()
                    .toList();
        } else {
            learnerIds = enrollmentRepository.findByCourseIdOrderByEnrolledAtAsc(courseId).stream()
                    .map(Enrollment::getUserId)
                    .distinct()
                    .toList();
        }

        List<Module> modules = moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        if (learnerIds.isEmpty() || modules.isEmpty()) {
            return new CourseAnalyticsDto(courseId, course.getTitle(), cohortId, cohortName,
                    learnerIds.size(), 0, 0, List.of(), null);
        }

        List<UserModuleProgress> rows =
                progressRepository.findByModuleCourseIdAndUserIdIn(courseId, learnerIds);
        List<ModuleAttempt> attempts =
                attemptRepository.findByModuleCourseIdAndUserIdInOrderByCreatedAtAsc(courseId, learnerIds);

        // First attempt per learner and node, and the attempt count per node.
        Map<String, Instant> firstAttempt = new HashMap<>();
        Map<Long, Long> attemptCounts = new HashMap<>();
        for (ModuleAttempt attempt : attempts) {
            Long moduleId = attempt.getModule().getId();
            attemptCounts.merge(moduleId, 1L, Long::sum);
            firstAttempt.putIfAbsent(key(attempt.getUser().getId(), moduleId), attempt.getCreatedAt());
        }

        Map<Long, List<UserModuleProgress>> rowsByModule = rows.stream()
                .collect(Collectors.groupingBy(row -> row.getModule().getId()));

        List<NodeFunnelDto> funnels = new ArrayList<>(modules.size());
        for (Module module : modules) {
            List<UserModuleProgress> moduleRows =
                    rowsByModule.getOrDefault(module.getId(), List.of());
            int reached = 0;
            int started = 0;
            int cleared = 0;
            List<Double> hoursToClear = new ArrayList<>();
            for (UserModuleProgress row : moduleRows) {
                boolean hasRow = row.getStatus() != ProgressStatus.LOCKED;
                Instant first = firstAttempt.get(key(row.getUser().getId(), module.getId()));
                if (hasRow) {
                    reached++;
                }
                if (row.getAttempts() > 0 || first != null) {
                    started++;
                }
                if (row.getStatus() == ProgressStatus.COMPLETED) {
                    cleared++;
                    if (first != null && row.getCompletedAt() != null) {
                        hoursToClear.add(Duration.between(first, row.getCompletedAt()).toMinutes() / 60.0);
                    }
                }
            }
            funnels.add(new NodeFunnelDto(module.getId(), module.getTitle(), module.getOrderIndex(),
                    reached, started, cleared, attemptCounts.getOrDefault(module.getId(), 0L),
                    median(hoursToClear)));
        }

        Set<Long> began = new HashSet<>();
        rows.stream()
                .filter(row -> row.getStatus() != ProgressStatus.LOCKED || row.getAttempts() > 0)
                .forEach(row -> began.add(row.getUser().getId()));

        Set<Long> finished = new HashSet<>(learnerIds);
        for (Module module : modules) {
            List<UserModuleProgress> moduleRows = rowsByModule.getOrDefault(module.getId(), List.of());
            Set<Long> clearedHere = moduleRows.stream()
                    .filter(row -> row.getStatus() == ProgressStatus.COMPLETED)
                    .map(row -> row.getUser().getId())
                    .collect(Collectors.toSet());
            finished.retainAll(clearedHere);
        }

        // The node with the most learners who arrived and did not finish it.
        NodeFunnelDto dropOff = funnels.stream()
                .filter(funnel -> funnel.reached() - funnel.cleared() > 0)
                .max(Comparator
                        .comparingInt((NodeFunnelDto funnel) -> funnel.reached() - funnel.cleared())
                        .thenComparing(funnel -> funnel.orderIndex() == null ? 0 : -funnel.orderIndex()))
                .orElse(null);

        return new CourseAnalyticsDto(courseId, course.getTitle(), cohortId, cohortName,
                learnerIds.size(), began.size(), finished.size(), funnels, dropOff);
    }

    private static String key(Long userId, Long moduleId) {
        return userId + ":" + moduleId;
    }

    /** Midpoint median; null when there is nothing to average, never a fake zero. */
    static Double median(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        List<Double> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        double result = sorted.size() % 2 == 1
                ? sorted.get(middle)
                : (sorted.get(middle - 1) + sorted.get(middle)) / 2.0;
        return Math.round(result * 10.0) / 10.0;
    }
}
