package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Step two of recovery: the token from the link, plus the password to set. */
public record PasswordResetConfirmRequest(
        @NotBlank(message = "Reset token is required")
        @Size(max = 200)
        String token,

        @NotBlank(message = "New password is required")
        @Size(min = 8, max = 72, message = "Password must be between 8 and 72 characters")
        String password
) {
}
