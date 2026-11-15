package com.questlearn.dto;

import java.time.Instant;

/**
 * What the console can honestly say about the shared demo password.
 *
 * @param accounts  how many demo accounts exist to share it
 * @param source    "ROTATED" when an admin chose it here, otherwise "STARTUP" for
 *                  DEMO_PASSWORD or the value generated on the first start
 * @param rotatedAt when it was rotated here, null for a startup value
 * @param rotatedBy the admin who rotated it, null for a startup value
 */
public record DemoPasswordStatus(
        int accounts,
        String source,
        Instant rotatedAt,
        String rotatedBy) {
}
