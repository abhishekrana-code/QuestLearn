package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for adding a skill-tree node.
 *
 * <p>{@code content} is free-form JSONB, e.g.
 * {@code {"sections":[{"heading":"Intro","body":"..."}]}}.</p>
 */
public record ModuleRequest(
        @NotBlank(message = "Module title is required")
        @Size(max = 160)
        String title,

        @Size(max = 800)
        String summary,

        JsonNode content,

        @Min(value = 0, message = "XP reward cannot be negative")
        @Max(value = 5000, message = "XP reward is too large")
        Integer xpReward,

        @Min(0)
        Integer positionX,

        @Min(0)
        Integer positionY,

        @Min(0)
        Integer orderIndex,

        Long parentModuleId
) {
}
