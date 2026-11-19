package com.questlearn.dto;

import java.time.Instant;

/**
 * One note in a learner's cross-course feed.
 *
 * <p>It carries the course title and emoji the notices page used to merge in from
 * the course list, so the page no longer needs one request per enrolled course.</p>
 *
 * <p>{@code read} is the caller's own state, as on the per-course DTO.</p>
 */
public record AnnouncementFeedItemDto(
        Long id,
        Long courseId,
        String courseTitle,
        String courseEmoji,
        Long cohortId,
        String cohortName,
        String authorName,
        String body,
        Instant createdAt,
        boolean read
) {
}
