package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A learner's question about this course's materials. */
public record MaterialAskRequest(
        @NotBlank(message = "Type a question first.")
        @Size(max = 4000, message = "Keep the question under 4000 characters.")
        String question
) {
}
