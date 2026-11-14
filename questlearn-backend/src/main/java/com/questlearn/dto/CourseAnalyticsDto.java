package com.questlearn.dto;

import java.util.List;

/**
 * How a course actually goes for the people taking it.
 *
 * <p>The roster answers "who is stuck now"; this answers "where do people stop".
 * Counts are over every enrolled learner, or over one class when {@code cohortId} is
 * given. {@code dropOff} is the node with the most learners who reached it and never
 * cleared it, or null when the course has no such node.</p>
 */
public record CourseAnalyticsDto(
        Long courseId,
        String courseTitle,
        Long cohortId,
        String cohortName,
        int learners,
        int started,
        int finished,
        List<NodeFunnelDto> nodes,
        NodeFunnelDto dropOff
) {
}
