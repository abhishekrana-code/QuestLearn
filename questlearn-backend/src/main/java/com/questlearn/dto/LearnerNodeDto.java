package com.questlearn.dto;

import java.time.Instant;
import java.util.List;

/**
 * One node as a specific learner has it, with the trail of graded attempts
 * behind the summary score.
 *
 * <p>The attempt list is oldest first so a teacher reads it as a story: 40%,
 * then 60%, then cleared.</p>
 */
public record LearnerNodeDto(
        Long moduleId,
        String title,
        String status,
        int score,
        int attempts,
        Instant completedAt,
        List<AttemptDto> history
) {
}
