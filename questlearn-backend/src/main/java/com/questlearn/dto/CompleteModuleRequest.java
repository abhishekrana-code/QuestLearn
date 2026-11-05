package com.questlearn.dto;

import jakarta.validation.Valid;

import java.util.List;

public record CompleteModuleRequest(
        @Valid List<AnswerRequest> answers
) {
}
