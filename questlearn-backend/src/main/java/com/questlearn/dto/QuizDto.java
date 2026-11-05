package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.model.QuizType;

/**
 * Client-safe quiz projection: correct answers never leave the server.
 */
public record QuizDto(
        Long id,
        QuizType type,
        int passingScore,
        JsonNode payload
) {
}
