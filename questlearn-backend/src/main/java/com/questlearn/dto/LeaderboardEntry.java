package com.questlearn.dto;

public record LeaderboardEntry(
        int rank,
        Long userId,
        String name,
        int totalXp,
        int currentLevel,
        int streakDays,
        boolean currentUser
) {
}
