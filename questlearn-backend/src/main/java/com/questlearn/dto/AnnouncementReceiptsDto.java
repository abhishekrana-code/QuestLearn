package com.questlearn.dto;

import java.util.List;

/**
 * One note's receipts, with the audience rows paged.
 *
 * <p>The counts are always over the whole audience; only {@code rows} is paged, so
 * expanding "who has not read it" never changes the percentage above it.</p>
 */
public record AnnouncementReceiptsDto(
        Long announcementId,
        long recipients,
        long read,
        int readPercent,
        List<AnnouncementReceiptRowDto> rows,
        int page,
        int size,
        int totalPages
) {
}
