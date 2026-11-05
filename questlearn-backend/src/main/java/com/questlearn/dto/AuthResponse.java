package com.questlearn.dto;

public record AuthResponse(
        String token,
        String tokenType,
        long expiresInMs,
        UserDto user
) {
}
