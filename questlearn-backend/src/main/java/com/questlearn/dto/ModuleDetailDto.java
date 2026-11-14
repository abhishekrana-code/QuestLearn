package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.model.DeadlineState;
import com.questlearn.model.ProgressStatus;

import java.time.Instant;
import java.util.List;

public record ModuleDetailDto(
        Long id,
        Long courseId,
        String courseTitle,
        String title,
        String summary,
        JsonNode content,
        int xpReward,
        ProgressStatus status,
        /** Best viva/quiz score so far, 0 when never attempted. */
        int score,
        /** Number of graded attempts so far, across both answer routes. */
        int attempts,
        QuizDto quiz,
        VivaConfig viva,
        /** Newest first, at most 10; empty for instructors and untouched nodes. */
        List<AttemptDto> history,
        /** When this node is due, or null when it is self-paced. */
        Instant dueAt,
        /** How the deadline reads for this learner, null when there is none. */
        DeadlineState deadlineState
) {
}
