package com.questlearn.dto;

import java.time.Instant;

/** One course PDF as the materials panel needs it. */
public record CourseMaterialDto(
        Long id,
        String filename,
        long sizeBytes,
        String status,
        String errorMessage,
        Instant createdAt
) {
}
