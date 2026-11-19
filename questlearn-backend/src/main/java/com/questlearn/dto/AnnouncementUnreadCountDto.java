package com.questlearn.dto;

/**
 * The number beside the nav link. A separate, cheap answer because a badge must
 * not start by downloading a page of notes.
 */
public record AnnouncementUnreadCountDto(long unread) {
}
