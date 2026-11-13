package com.questlearn.dto;

import java.time.Instant;
import java.util.List;

/**
 * A learner on the roster, with the per-node detail behind their cleared count.
 *
 * @param lastActivity the latest of their enrollment and any completed node, so a
 *                     teacher can spot someone who joined and then went quiet
 */
public record RosterLearnerDto(
        Long userId,
        String name,
        String email,
        int totalXp,
        int currentLevel,
        int streakDays,
        long clearedNodes,
        int moduleCount,
        Instant enrolledAt,
        Instant lastActivity,
        List<RosterNodeDto> nodes
) {
}
