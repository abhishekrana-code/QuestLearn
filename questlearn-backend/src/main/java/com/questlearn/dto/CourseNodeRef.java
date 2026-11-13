package com.questlearn.dto;

/**
 * A node's id and title, for a picker.
 *
 * <p>Carried on the roster itself rather than read off the first learner: once the
 * roster is filtered down to nobody, the list of nodes is exactly what the teacher
 * still needs to widen the filter again.</p>
 */
public record CourseNodeRef(Long id, String title) {
}
