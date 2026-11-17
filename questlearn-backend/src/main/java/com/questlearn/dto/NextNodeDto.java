package com.questlearn.dto;

import com.questlearn.model.DeadlineState;

import java.time.Instant;

/**
 * The single node a learner should open next, chosen on the server so the
 * dashboard does not have to fetch every course's tree to guess.
 *
 * @param courseId   which course the node belongs to
 * @param courseTitle its title, so the card can say where the work sits
 * @param nodeId     the node to open
 * @param nodeTitle  what the learner will be working on
 * @param xpReward   what finishing it is worth
 * @param dueAt      when it is due, or null for self-paced work
 * @param deadlineState how that date reads today, null when there is none
 */
public record NextNodeDto(
        Long courseId,
        String courseTitle,
        Long nodeId,
        String nodeTitle,
        int xpReward,
        Instant dueAt,
        DeadlineState deadlineState) {
}
