package com.questlearn.dto;

import java.util.List;
import java.util.Map;

/**
 * One learner answer. Only the field relevant to the quiz type is populated.
 */
public record AnswerRequest(
        String questionId,
        Integer selectedIndex,
        List<String> order,
        Map<String, String> matches
) {
}
