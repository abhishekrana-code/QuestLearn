package com.questlearn.dto;

import java.time.Instant;

/** One line in a deadline digest email. */
public record DeadlineDigestItem(
        Long courseId,
        String courseTitle,
        String moduleTitle,
        Instant dueAt,
        boolean overdue
) {
}
