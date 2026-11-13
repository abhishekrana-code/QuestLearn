package com.questlearn.dto;

import java.time.Instant;

/** One row of the admin activity feed. */
public record AuditEntryDto(
        Long id,
        String actorEmail,
        String action,
        String target,
        String detail,
        Instant createdAt
) {
}
