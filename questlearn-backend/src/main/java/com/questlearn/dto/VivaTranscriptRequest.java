package com.questlearn.dto;

import jakarta.validation.constraints.Size;

/**
 * A typed viva answer, used when the student has no working microphone.
 * Length limits are deliberately loose: the service rejects answers that are too
 * short to grade or too long to be a single spoken answer.
 */
public record VivaTranscriptRequest(
        @Size(max = 4000, message = "Keep your written answer under 4000 characters")
        String answer
) {
}
