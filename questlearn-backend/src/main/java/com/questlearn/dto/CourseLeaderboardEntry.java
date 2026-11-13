package com.questlearn.dto;

/**
 * A learner on one course's board.
 *
 * <p>Deliberately not {@link LeaderboardEntry}: {@code courseXp} is XP earned
 * inside this course only, while the global board ranks lifetime XP. Naming them
 * the same field would invite a wrong comparison.</p>
 */
public record CourseLeaderboardEntry(
        int rank,
        Long userId,
        String name,
        int courseXp,
        int currentLevel,
        int streakDays,
        int modulesCleared,
        int moduleCount,
        boolean currentUser
) {
}
