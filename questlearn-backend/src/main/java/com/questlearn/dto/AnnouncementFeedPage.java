package com.questlearn.dto;

import java.util.List;

/**
 * One page of a learner's notices, plus the number that badge the nav.
 *
 * <p>{@code unreadCount} covers every visible note, not just this page, so the
 * header can say "4 unread" while the page holds twenty. {@code total} is the size
 * after filters, which is what a pager needs.</p>
 */
public record AnnouncementFeedPage(
        List<AnnouncementFeedItemDto> announcements,
        long unreadCount,
        long total,
        int page,
        int size,
        int totalPages
) {
}
