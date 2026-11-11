package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A lesson video that is already hosted elsewhere (a drive link, a CDN, a school
 * media server). Only http(s) URLs are accepted.
 */
public record VideoUrlRequest(
        @NotBlank(message = "Paste the video link first")
        @Size(max = 1000)
        String url,

        @Size(max = 160)
        String label
) {
}
