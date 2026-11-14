package com.questlearn.dto;

import com.questlearn.model.Role;

import java.time.LocalDate;

public record UserDto(
        Long id,
        String name,
        String email,
        Role role,
        boolean emailVerified,
        boolean notifyDeadlines,
        int totalXp,
        int currentLevel,
        int streakDays,
        LocalDate lastActivityDate,
        int nextLevelXp
) {
}
