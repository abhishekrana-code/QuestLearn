package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;

public record JoinCohortRequest(
        @NotBlank(message = "Enter the class code")
        String code
) {
}
