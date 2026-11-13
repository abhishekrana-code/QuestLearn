package com.questlearn.dto;

import java.util.List;

/**
 * A learner on the school-wide board.
 *
 * <p>{@code combinedXp} is the sum of the XP rewards of every node they cleared,
 * in every course. It is not {@code totalXp}: that figure follows the account and
 * can include bonuses, while this one only counts cleared work, which is what makes
 * "across all my courses" an honest comparison. The top courses are carried along
 * so the board can say where the work came from.</p>
 */
public record OverallLeaderboardEntry(
        int rank,
        Long userId,
        String name,
        int combinedXp,
        int nodesCleared,
        int coursesCleared,
        int currentLevel,
        int streakDays,
        boolean currentUser,
        List<CourseXpShare> topCourses
) {
    /** One course's contribution to a learner's combined total. */
    public record CourseXpShare(Long courseId, String title, int xp) {
    }
}
