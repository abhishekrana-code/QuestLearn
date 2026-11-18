package com.questlearn.dto;

import jakarta.validation.constraints.Size;

/**
 * @param cohortId null posts to everyone in the course; a class id narrows it to
 *                 that class, which is checked against the course server-side
 */
public record CreateAnnouncementRequest(
        @Size(max = 2000, message = "Keep the announcement under 2000 characters")
        String body,
        Long cohortId
) {
}
