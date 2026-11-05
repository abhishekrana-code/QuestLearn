package com.questlearn.service;

import com.questlearn.model.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GamificationServiceTest {

    @Test
    void levelCurveMatchesTheSpecifiedFormula() {
        // level = floor(0.1 * sqrt(xp)) + 1
        assertEquals(1, GamificationService.levelForXp(0));
        assertEquals(1, GamificationService.levelForXp(99));
        assertEquals(2, GamificationService.levelForXp(100));
        assertEquals(2, GamificationService.levelForXp(360));
        assertEquals(3, GamificationService.levelForXp(400));
        assertEquals(4, GamificationService.levelForXp(900));
        assertEquals(5, GamificationService.levelForXp(1600));
    }

    @Test
    void negativeXpIsTreatedAsZero() {
        assertEquals(1, GamificationService.levelForXp(-500));
    }

    @Test
    void xpForLevelIsTheExactInverseOfTheCurve() {
        assertEquals(0, GamificationService.xpForLevel(1));
        assertEquals(100, GamificationService.xpForLevel(2));
        assertEquals(400, GamificationService.xpForLevel(3));
        assertEquals(900, GamificationService.xpForLevel(4));

        for (int level = 1; level <= 8; level++) {
            assertEquals(level, GamificationService.levelForXp(GamificationService.xpForLevel(level)),
                    "level " + level + " should round-trip through its XP threshold");
        }
    }

    @Test
    void xpForNextLevelLooksOneLevelAhead() {
        assertEquals(100, GamificationService.xpForNextLevel(1));
        assertEquals(400, GamificationService.xpForNextLevel(2));
        assertEquals(900, GamificationService.xpForNextLevel(3));
    }

    @Test
    void firstEverActivityStartsTheStreak() {
        User user = User.builder().streakDays(0).build();
        assertTrue(new GamificationService().registerActivity(user));
        assertEquals(1, user.getStreakDays());
        assertEquals(LocalDate.now(), user.getLastActivityDate());
    }

    @Test
    void sameDayActivityDoesNotAdvanceTheStreak() {
        User user = User.builder()
                .streakDays(4)
                .lastActivityDate(LocalDate.now())
                .build();
        assertFalse(new GamificationService().registerActivity(user));
        assertEquals(4, user.getStreakDays());
    }

    @Test
    void yesterdayAdvancesTheStreak() {
        User user = User.builder()
                .streakDays(4)
                .lastActivityDate(LocalDate.now().minusDays(1))
                .build();
        assertTrue(new GamificationService().registerActivity(user));
        assertEquals(5, user.getStreakDays());
        assertEquals(LocalDate.now(), user.getLastActivityDate());
    }

    @Test
    void olderActivityResetsTheStreak() {
        User user = User.builder()
                .streakDays(9)
                .lastActivityDate(LocalDate.now().minusDays(3))
                .build();
        assertTrue(new GamificationService().registerActivity(user));
        assertEquals(1, user.getStreakDays());
    }
}
