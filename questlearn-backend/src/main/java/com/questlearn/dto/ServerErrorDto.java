package com.questlearn.dto;

import java.time.Instant;

/**
 * One failure, as an admin sees it. The request id matches the {@code X-Request-Id}
 * response header and the server log line, so a support report can be traced.
 */
public record ServerErrorDto(
        Instant at,
        String requestId,
        String method,
        String path,
        int status,
        String message,
        long durationMs) {
}
