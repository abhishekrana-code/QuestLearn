package com.questlearn.dto;

import java.util.List;

/**
 * Result of a viva attempt. The XP/level/streak fields deliberately carry
 * the same names as {@link XpAwardResponse} so the React client can reuse its
 * existing {@code award(...)} celebration path for a passed boss battle.
 *
 * <p>{@code input} is {@code SPOKEN} when the answer came from a recording and
 * {@code WRITTEN} when the student typed it; the client labels the transcript
 * block accordingly.</p>
 */
public record VivaGradeResponse(
        Long moduleId,
        String input,
        String transcript,
        int score,
        int passThreshold,
        boolean passed,
        String verdict,
        List<String> strengths,
        List<String> gaps,
        String feedback,
        String followUpQuestion,
        int attempts,
        int xpGained,
        int newTotalXp,
        int newLevel,
        int nextLevelXp,
        boolean leveledUp,
        int streakDays,
        boolean streakIncremented,
        List<Long> unlockedModuleIds,
        String message
) {
}
