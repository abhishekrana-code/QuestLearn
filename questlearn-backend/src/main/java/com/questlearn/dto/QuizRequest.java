package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.model.QuizType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record QuizRequest(
        @NotNull(message = "Quiz type is required")
        QuizType type,

        @Min(value = 0, message = "Passing score cannot be negative")
        @Max(value = 100, message = "Passing score cannot exceed 100")
        Integer passingScore,

        @NotNull(message = "Quiz payload is required")
        JsonNode payload
) {
}
