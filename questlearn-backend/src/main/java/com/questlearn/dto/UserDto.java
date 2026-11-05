package com.questlearn.dto;

import com.questlearn.model.Role;

import java.time.LocalDate;

public record UserDto(
        Long id,
        String name,
        String email,
        Role role,
        int totalXp,
        int currentLevel,
        int streakDays,
        LocalDate lastActivityDate,
        int nextLevelXp
) {
}
