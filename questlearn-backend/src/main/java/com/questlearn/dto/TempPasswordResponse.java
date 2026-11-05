package com.questlearn.dto;

/**
 * Returned once to an admin after an account reset. The temporary password is
 * never retrievable again and is never logged by the application.
 */
public record TempPasswordResponse(
        Long userId,
        String email,
        String temporaryPassword
) {
}
