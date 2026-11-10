package com.questlearn.dto;

import com.questlearn.model.AttemptSource;

import java.time.Instant;

/** One row of a learner's attempt history for a node. */
public record AttemptDto(
        int score,
        boolean passed,
        AttemptSource source,
        Instant at
) {
}
