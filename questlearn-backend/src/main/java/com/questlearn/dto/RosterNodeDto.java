package com.questlearn.dto;

import java.time.Instant;

/**
 * One node as a single learner has it. A learner with no progress row yet is
 * reported as LOCKED with zero score, which is what they see on their own tree.
 */
public record RosterNodeDto(
        Long moduleId,
        String title,
        String status,
        int score,
        int attempts,
        Instant completedAt
) {
}
