package com.questlearn.dto;

import java.util.List;

/**
 * What an operator needs at a glance: is the server answering, how slowly, and
 * which requests failed recently. Latency figures are null until the first requests
 * have been recorded, so the UI can say "no traffic yet" instead of showing zero.
 */
public record AdminTelemetryDto(
        long uptimeSeconds,
        long requests,
        long serverErrors,
        Double p50Ms,
        Double p95Ms,
        Double p99Ms,
        List<ServerErrorDto> recentErrors) {
}
