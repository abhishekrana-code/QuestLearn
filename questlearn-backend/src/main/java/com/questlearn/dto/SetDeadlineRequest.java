package com.questlearn.dto;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;

/** A new due date for one node, in UTC. */
public record SetDeadlineRequest(
        @NotNull(message = "A due date is required")
        Instant dueAt
) {
}
