package com.questlearn.dto;

import java.util.List;

/**
 * Result of a module completion attempt - tells the React client whether to
 * celebrate with the Lottie level-up modal and which nodes just opened up.
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
        String message
) {
}
