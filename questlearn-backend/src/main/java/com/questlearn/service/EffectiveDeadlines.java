package com.questlearn.service;

import com.questlearn.model.Cohort;
import com.questlearn.model.CohortDeadline;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Module;
import com.questlearn.repository.CohortDeadlineRepository;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * One answer to "when is this due for this learner".
 *
 * <p>A class override beats the node's course-wide date. When a learner belongs to
 * two classes of the same course and both override the same node, the earlier date
 * wins: the stricter rule applies, so no class can quietly extend a deadline that
 * another class already set. The dashboard, the skill tree, the node briefing and
 * the reminder digest all read the date from here, so they cannot disagree.</p>
 */
@Component
@RequiredArgsConstructor
public class EffectiveDeadlines {

    private final CohortRepository cohortRepository;
    private final CohortMembershipRepository membershipRepository;
    private final CohortDeadlineRepository deadlineRepository;

    /**
     * @return module id to the learner's class due date; empty when they belong to
     *         no class with an override
     */
    public Map<Long, Instant> overridesFor(Long userId, Collection<Long> courseIds) {
        if (userId == null || courseIds == null || courseIds.isEmpty()) {
            return Map.of();
        }
        List<Cohort> cohorts = cohortRepository.findByCourseIdIn(courseIds);
        if (cohorts.isEmpty()) {
            return Map.of();
        }
        Set<Long> courseCohortIds = cohorts.stream()
                .map(Cohort::getId)
                .collect(Collectors.toSet());
        Set<Long> myCohortIds = membershipRepository
                .findByUserIdAndCohortIdIn(userId, courseCohortIds).stream()
                .map(CohortMembership::getCohortId)
                .collect(Collectors.toSet());
        if (myCohortIds.isEmpty()) {
            return Map.of();
        }

        Map<Long, Instant> earliest = new HashMap<>();
        for (CohortDeadline row : deadlineRepository.findByCohortIdIn(myCohortIds)) {
            earliest.merge(row.getModuleId(), row.getDueAt(),
                    (left, right) -> left.isBefore(right) ? left : right);
        }
        return earliest;
    }

    /** The learner's date for a node: a class override, otherwise the course date. */
    public Instant dueAt(Module module, Map<Long, Instant> overrides) {
        Instant override = overrides.get(module.getId());
        return override != null ? override : module.getDueAt();
    }
}
