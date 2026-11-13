package com.questlearn.dto;

/**
 * What a learner gets back after typing a class code: which class they are now
 * in, and which course that put them in the catalogue for.
 */
public record CohortJoinResponse(
        Long cohortId,
        String cohortName,
        Long courseId,
        String courseTitle,
        boolean alreadyMember
) {
}
