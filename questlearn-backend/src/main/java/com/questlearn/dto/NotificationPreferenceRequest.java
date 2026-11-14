package com.questlearn.dto;

import jakarta.validation.constraints.NotNull;

/** Per-account switch for the daily deadline digest. */
public record NotificationPreferenceRequest(
        @NotNull(message = "Choose whether deadline emails are on")
        Boolean deadlineEmails
) {
}
