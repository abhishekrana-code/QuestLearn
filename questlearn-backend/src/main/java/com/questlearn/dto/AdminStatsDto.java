package com.questlearn.dto;

public record AdminStatsDto(
        long totalUsers,
        long students,
        long instructors,
        long admins,
        long courses,
        long publishedCourses
) {
}
