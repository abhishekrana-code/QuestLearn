package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.GenerateCourseRequest;
import com.questlearn.dto.GeneratedCourseDto;
import com.questlearn.service.AiAuthoringService;
import com.questlearn.service.AiQuotaService;
import com.questlearn.service.GroqAiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "AI", description = "Groq-powered course authoring and examiner status")
public class AiController {

    private final GroqAiService groqAiService;
    private final AiAuthoringService aiAuthoringService;
    private final AiQuotaService aiQuotaService;

    /** Lets the Studio show an honest "AI not configured" card instead of failing on submit. */
    @GetMapping("/status")
    @Operation(summary = "Whether the Groq examiner and AI authoring are available")
    public Map<String, Object> status() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("configured", groqAiService.isConfigured());
        body.put("reasoningModel", groqAiService.reasoningModel());
        body.put("transcriptionModel", groqAiService.transcriptionModel());
        body.put("hourlyLimit", aiQuotaService.hourlyLimit());
        return body;
    }

    @PostMapping("/courses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Draft an entire quest (nodes + quizzes) from a topic prompt")
    public GeneratedCourseDto generateCourse(@Valid @RequestBody GenerateCourseRequest request,
                                             @AuthenticationPrincipal AppUserPrincipal principal) {
        return aiAuthoringService.generate(request, principal);
    }
}
