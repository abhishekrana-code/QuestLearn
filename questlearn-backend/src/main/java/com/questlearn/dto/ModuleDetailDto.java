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
        int score,
        QuizDto quiz
) {
}
