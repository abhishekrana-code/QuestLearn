package com.questlearn.dto;

import com.questlearn.model.ProgressStatus;
import com.questlearn.model.QuizType;

public record SkillNodeDto(
        Long id,
        String title,
        String summary,
        int xpReward,
        Long parentId,
        int positionX,
        int positionY,
        int orderIndex,
        ProgressStatus status,
        int score,
        QuizType quizType
) {
}
