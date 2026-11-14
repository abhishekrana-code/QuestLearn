package com.questlearn.dto;

import java.time.Instant;
import java.util.List;

/**
 * Everything a signed-in learner needs for the dashboard deadline panel: the
 * dated nodes across the courses they joined, plus their digest preference so
 * the toggle can render without a second request.
 */
public record DeadlineOverviewDto(
        List<DeadlineDto> deadlines,
        boolean deadlineEmailsEnabled
) {
}
