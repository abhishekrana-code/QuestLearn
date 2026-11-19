package com.questlearn.dto;

import java.time.Instant;

/**
 * One announcement as both sides read it.
 *
 * <p>{@code cohortId} and {@code cohortName} are null for a note to the whole
 * course; the learner needs the name to know which class it was addressed to when
 * they belong to more than one.</p>
 *
 * <p>{@code read} is the caller's own state, not a property of the note: the same
 * announcement is read for one learner and unread for another.</p>
 */
public record AnnouncementDto(
        Long id,
        Long courseId,
        Long cohortId,
        String cohortName,
        String authorName,
        String body,
        Instant createdAt,
        boolean read
) {
}
