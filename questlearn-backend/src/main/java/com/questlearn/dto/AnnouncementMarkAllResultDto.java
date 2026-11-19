package com.questlearn.dto;

/**
 * How many notes a "mark all read" actually changed. The caller's unread count is
 * zero afterwards by definition, so the count of changes is the useful report.
 */
public record AnnouncementMarkAllResultDto(int marked) {
}
