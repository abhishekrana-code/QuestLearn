package com.questlearn.dto;

import java.time.Instant;

public record CourseDto(
        Long id,
        String title,
        String description,
        String category,
        String emoji,
        boolean published,
        Long instructorId,
        String instructorName,
        long moduleCount,
        long completedModules,
        Instant createdAt,
        Instant archivedAt
) {
}
