package com.questlearn.service;

import com.questlearn.model.User;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

/**
 * Gamification engine: level curve, XP thresholds and daily streaks.
 *
 * <p>Level formula: {@code level = floor(0.1 * sqrt(totalXp)) + 1}</p>
 */
@Service
public class GamificationService {

    /** XP required to reach the given level, i.e. the inverse of the level formula. */
    public static int xpForLevel(int level) {
        int safeLevel = Math.max(level, 1);
        return 100 * (safeLevel - 1) * (safeLevel - 1);
    }

    public static int levelForXp(int totalXp) {
        return (int) Math.floor(0.1 * Math.sqrt(Math.max(totalXp, 0))) + 1;
    }

    /** XP needed to reach the next level. */
    public static int xpForNextLevel(int level) {
        return xpForLevel(Math.max(level, 1) + 1);
    }

    /**
     * Registers daily activity and returns {@code true} when the streak advanced.
     * Same day -> unchanged, yesterday -> +1, older -> reset to 1.
     */
    public boolean registerActivity(User user) {
        LocalDate today = LocalDate.now();
        LocalDate last = user.getLastActivityDate();

        if (last == null) {
            user.setStreakDays(1);
            user.setLastActivityDate(today);
            return true;
        }
        if (last.isEqual(today)) {
            return false;
        }
        if (last.isEqual(today.minusDays(1))) {
            user.setStreakDays(Math.max(user.getStreakDays(), 0) + 1);
        } else {
            user.setStreakDays(1);
        }
        user.setLastActivityDate(today);
        return true;
    }
}
