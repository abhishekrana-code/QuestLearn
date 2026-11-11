package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * New values for the details a course owns.
 *
 * <p>Publishing has its own route, so this body cannot accidentally take a
 * course live: it only carries what a student sees on the course card.</p>
 */
public record CourseUpdateRequest(
        @NotBlank(message = "Course title is required")
        @Size(max = 160)
        String title,

        @Size(max = 1200)
        String description,

        @Size(max = 60)
        String category,

        @Size(max = 8)
        String emoji
) {
}
