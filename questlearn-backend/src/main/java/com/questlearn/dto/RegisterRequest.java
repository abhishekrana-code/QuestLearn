package com.questlearn.dto;

import com.questlearn.model.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 120)
        String name,

        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address")
        @Size(max = 180)
        String email,

        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 72, message = "Password must be between 8 and 72 characters")
        String password,

    /**
     * Optional. An omitted role means STUDENT, so a client that only knows name,
     * email and password does not have to guess this enum. It is not a way to
     * escalate: ADMIN is rejected outright and INSTRUCTOR still needs an invite.
     */
    Role role,

    /**
     * Required only for INSTRUCTOR sign-up. Kept last so existing clients that post
     * name/email/password/role keep working unchanged.
     */
    String inviteCode
) {
}
