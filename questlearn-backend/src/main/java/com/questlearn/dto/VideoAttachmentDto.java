package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * The lesson video after a change, plus the updated lesson content so the editor
 * can refresh without a second round trip.
 */
public record VideoAttachmentDto(
        Long moduleId,
        String videoUrl,
        String videoLabel,
        JsonNode content
) {
}
