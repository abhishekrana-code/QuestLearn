package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The token carried by the confirmation link. */
public record VerifyEmailRequest(
        @NotBlank(message = "Confirmation token is required")
        @Size(max = 200)
        String token
) {
}
