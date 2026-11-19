package com.questlearn.dto;

/**
 * How one note landed with the learners it was addressed to.
 *
 * <p>{@code recipients} is the current audience, not a snapshot taken at posting:
 * a learner who joins the course later is counted, because the note is visible to
 * them now. {@code readPercent} is rounded, and 0 when there is nobody to read it.</p>
 */
public record AnnouncementReceiptSummaryDto(
        Long announcementId,
        long recipients,
        long read,
        int readPercent
) {
}
