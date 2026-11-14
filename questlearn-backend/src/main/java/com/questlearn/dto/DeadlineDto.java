package com.questlearn.dto;

import com.questlearn.model.DeadlineState;

import java.time.Instant;

/**
 * One dated node, with the state that applies to the learner asking.
 *
 * <p>{@code state} is computed on the server from the due date and the learner's
 * completion time, so the dashboard, the skill tree and the digest all agree.</p>
 */
public record DeadlineDto(
        Long moduleId,
        String moduleTitle,
        Long courseId,
        String courseTitle,
        String courseEmoji,
        Instant dueAt,
        int xpReward,
        DeadlineState state,
        Instant completedAt
) {
}
