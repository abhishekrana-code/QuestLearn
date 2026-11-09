package com.questlearn.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Instructor request: "build me a quest about this topic".
 */
public record GenerateCourseRequest(
        @NotBlank(message = "Describe the topic the course should cover")
        @Size(max = 300, message = "Keep the topic under 300 characters")
        String topic,

        @Size(max = 120)
        String audience,

        @Size(max = 60)
        String category,

        @Min(value = 3, message = "A quest needs at least 3 nodes")
        @Max(value = 8, message = "Keep generated quests to 8 nodes or fewer")
        Integer nodeCount
) {

    public int resolvedNodeCount() {
        return nodeCount == null ? 6 : nodeCount;
    }

    public String resolvedAudience() {
        return audience == null || audience.isBlank() ? "undergraduate students" : audience.trim();
    }
}
