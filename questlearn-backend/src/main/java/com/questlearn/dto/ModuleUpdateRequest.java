package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for editing an existing skill-tree node.
 *
 * <p>Every field is the node's new value, so an omitted {@code summary} clears
 * it. {@code content} replaces the lesson, except for the uploaded video, which
 * is owned by the media endpoints and is always carried across.</p>
 */
public record ModuleUpdateRequest(
        @NotBlank(message = "Module title is required")
        @Size(max = 160)
        String title,

        @Size(max = 800)
        String summary,

        JsonNode content,

        @Min(value = 0, message = "XP reward cannot be negative")
        @Max(value = 5000, message = "XP reward is too large")
        Integer xpReward
) {
}
