package com.questlearn.dto;

/**
 * One page-level citation.
 *
 * <p>{@code materialId} is QuestLearn's row id, so the UI can name the reading
 * even if the same PDF filename appears twice in a course.</p>
 */
public record MaterialCitationDto(
        Long materialId,
        String documentName,
        Integer pageNumber,
        String excerpt
) {
}
