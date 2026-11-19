package com.questlearn.dto;

import java.time.Instant;

/**
 * One learner on a receipt list. {@code readAt} is null for a learner who has not
 * opened the note, which is the row an instructor is usually looking for.
 */
public record AnnouncementReceiptRowDto(
        Long userId,
        String name,
        Instant readAt
) {
}
