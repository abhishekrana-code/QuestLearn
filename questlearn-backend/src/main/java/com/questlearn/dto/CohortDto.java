package com.questlearn.dto;

import java.time.Instant;

/**
 * A class inside a course, as its teacher sees it: the name, the code students
 * type, and how many are in it.
 */
public record CohortDto(
        Long id,
        Long courseId,
        String name,
        String joinCode,
        long memberCount,
        Instant createdAt
) {
}
