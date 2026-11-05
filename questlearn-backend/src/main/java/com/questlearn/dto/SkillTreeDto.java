package com.questlearn.dto;

import java.util.List;

public record SkillTreeDto(
        Long courseId,
        String courseTitle,
        String courseDescription,
        String category,
        String emoji,
        int totalModules,
        long completedModules,
        int totalXp,
        int level,
        List<SkillNodeDto> nodes
) {
}
