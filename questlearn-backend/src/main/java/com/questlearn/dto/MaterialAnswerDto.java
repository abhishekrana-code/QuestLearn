package com.questlearn.dto;

import java.util.List;

/**
 * A cited answer from VerityAI.
 *
 * <p>{@code evidenceStatus} is VerityAI's own verdict: SUFFICIENT when the model
 * cited its sources, INSUFFICIENT when it answered without one, NONE when no
 * passage was retrieved at all.</p>
 */
public record MaterialAnswerDto(
        String answer,
        String evidenceStatus,
        List<MaterialCitationDto> citations
) {
}
