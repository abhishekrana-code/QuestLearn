package com.questlearn.dto;

import com.questlearn.model.QuizType;

import java.util.List;

/**
 * Result of an AI course generation: the draft that was persisted, plus any
 * nodes whose generated quiz had to be dropped because it failed validation.
 */
public record GeneratedCourseDto(
        Long courseId,
        String title,
        String description,
        String category,
        String emoji,
        int nodeCount,
        List<NodeSummary> nodes,
        List<String> warnings
) {

    public record NodeSummary(
            Long id,
            String title,
            int xpReward,
            Long parentId,
            QuizType quizType
    ) {
    }
}
