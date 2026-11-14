package com.questlearn.dto;

import java.time.Instant;
import java.util.Map;

/**
 * Where to put a lesson video, and where it will play from once it is there.
 *
 * <p>The browser sends the bytes itself, so the application server never holds a
 * hundred megabytes in memory. {@code name} is what it sends back to attach the
 * upload to the node.</p>
 */
public record VideoUploadTicketDto(
        String name,
        String uploadUrl,
        String method,
        Map<String, String> headers,
        String mediaUrl,
        Instant expiresAt,
        long maxBytes
) {
}
