package com.questlearn.dto;

import java.time.Instant;
import java.util.List;

/**
 * One learner's whole story in a course: their standing plus every node with
 * its attempt trail.
 *
 * <p>Same access rule as the roster itself - the course instructor or an admin -
 * because it exposes another person's work.</p>
 */
public record RosterLearnerDetailDto(
        Long courseId,
        String courseTitle,
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
        List<LearnerNodeDto> nodes
) {
}
