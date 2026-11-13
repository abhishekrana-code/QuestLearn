package com.questlearn.dto;

import java.util.List;

/**
 * One page of accounts.
 *
 * <p>The total is carried alongside the rows so the page can say "26–50 of 2,000"
 * without a second request, and so a client can tell an empty page from an empty
 * school.</p>
 */
public record AdminUserPage(
        List<UserDto> users,
        long total,
        int page,
        int size,
        int totalPages
) {
}
