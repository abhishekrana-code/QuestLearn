package com.questlearn.dto;

import java.util.List;

/**
 * The teacher's view of who joined a course and how far each of them got.
 *
 * <p>{@code modules} is the shared column order: every learner's {@code nodes}
 * list has the same length and order, so a table can render it without
 * cross-referencing.</p>
 */
public record CourseRosterDto(
        Long courseId,
        String title,
        int moduleCount,
        List<RosterLearnerDto> learners
) {
}
