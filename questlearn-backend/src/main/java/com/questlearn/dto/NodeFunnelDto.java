package com.questlearn.dto;

/**
 * One node's funnel: how many learners reached it, tried it, and cleared it.
 *
 * <p>{@code medianHoursToClear} is the median gap between a learner's first attempt
 * and the completion stamp, for the learners who cleared it. It is null when nobody
 * has, so the panel can say so instead of showing a zero that reads like "instant".</p>
 */
public record NodeFunnelDto(
        Long moduleId,
        String title,
        Integer orderIndex,
        int reached,
        int started,
        int cleared,
        long attempts,
        Double medianHoursToClear
) {
}
