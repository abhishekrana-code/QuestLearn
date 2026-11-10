package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.model.ProgressStatus;

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
        VivaConfig viva
) {
}
