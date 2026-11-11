package com.questlearn.dto;

import java.util.List;

/**
 * Result of a module completion attempt - tells the React client whether to
 * celebrate with the Lottie level-up modal, which nodes just opened up, and
 * any pedagogical explanations from the evaluated quiz.
 */
public record XpAwardResponse(
        int xpGained,
        int newTotalXp,
        int newLevel,
        int nextLevelXp,
        boolean leveledUp,
        int score,
        boolean passed,
        List<Long> unlockedModuleIds,
        int streakDays,
        boolean streakIncremented,
        String message,
        List<String> explanations
) {
    public XpAwardResponse(int xpGained,
                           int newTotalXp,
                           int newLevel,
                           int nextLevelXp,
                           boolean leveledUp,
                           int score,
                           boolean passed,
                           List<Long> unlockedModuleIds,
                           int streakDays,
                           boolean streakIncremented,
                           String message) {
        this(xpGained, newTotalXp, newLevel, nextLevelXp, leveledUp, score, passed,
                unlockedModuleIds, streakDays, streakIncremented, message, List.of());
    }
}
