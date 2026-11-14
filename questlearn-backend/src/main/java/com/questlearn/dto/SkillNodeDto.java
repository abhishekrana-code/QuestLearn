package com.questlearn.dto;

import com.questlearn.model.DeadlineState;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.QuizType;

import java.time.Instant;

public record SkillNodeDto(
        Long id,
        String title,
        String summary,
        int xpReward,
        Long parentId,
        int positionX,
        int positionY,
        int orderIndex,
        ProgressStatus status,
        int score,
        /** Graded tries so far; 1 means a clean first pass. */
        int attempts,
        QuizType quizType,
        /** Lesson video attached to this node, null when it has none. */
        String videoUrl,
        String videoLabel,
        /** When this node is due, or null when it is self-paced. */
        Instant dueAt,
        /** How the deadline reads for this learner, null when there is none. */
        DeadlineState deadlineState
) {
}
