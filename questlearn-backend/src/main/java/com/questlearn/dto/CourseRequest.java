package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CourseRequest(
        @NotBlank(message = "Course title is required")
        @Size(max = 160)
        String title,

        @Size(max = 1200)
        String description,

        @Size(max = 60)
        String category,

        @Size(max = 8)
        String emoji,

        Boolean published
) {
}
