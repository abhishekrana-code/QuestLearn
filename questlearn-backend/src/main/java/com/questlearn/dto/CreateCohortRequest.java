package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCohortRequest(
        @NotBlank(message = "Give the class a name")
        @Size(max = 120, message = "Keep the name under 120 characters")
        String name
) {
}
