package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.VivaGradeResponse;
import com.questlearn.service.VivaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Voice viva", description = "Spoken boss battle graded by Groq whisper + reasoning model")
public class VivaController {

    private final VivaService vivaService;

    @PostMapping(path = "/modules/{moduleId}/viva", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('STUDENT','ADMIN')")
    @Operation(summary = "Transcribe a spoken answer, grade it, award XP and unlock children")
    public VivaGradeResponse gradeViva(@PathVariable Long moduleId,
                                       @RequestPart("audio") MultipartFile audio,
                                       @AuthenticationPrincipal AppUserPrincipal principal) {
        return vivaService.gradeViva(moduleId, principal, audio);
    }
}
