package com.questlearn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The object a signed upload actually produced, once the browser has put it there.
 *
 * <p>The name is the one the ticket issued; the server checks that it exists in the
 * store before attaching it, so a failed or abandoned upload cannot become a broken
 * lesson.</p>
 */
public record AttachUploadRequest(
        @NotBlank(message = "The upload name is missing.")
        @Size(max = 120, message = "The upload name is too long.")
        String name,
        @Size(max = 160, message = "Keep the label under 160 characters.")
        String label
) {
}
