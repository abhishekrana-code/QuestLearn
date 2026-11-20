package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseMaterialDto;
import com.questlearn.dto.MaterialAnswerDto;
import com.questlearn.dto.MaterialAskRequest;
import com.questlearn.service.CourseMaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/courses/{courseId}/materials")
@RequiredArgsConstructor
@Tag(name = "Course materials", description = "PDF readings and cited questions powered by VerityAI")
public class CourseMaterialController {

    private final CourseMaterialService materialService;

    @GetMapping
    @Operation(summary = "Materials attached to a course")
    public List<CourseMaterialDto> list(@PathVariable Long courseId,
                                        @RequestParam(defaultValue = "false") boolean refresh,
                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        return materialService.list(courseId, principal, refresh);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Upload a course PDF for processing")
    public CourseMaterialDto upload(@PathVariable Long courseId,
                                    @RequestPart("file") MultipartFile file,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return materialService.upload(courseId, principal, file);
    }

    @DeleteMapping("/{materialId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a course PDF")
    public void delete(@PathVariable Long courseId,
                       @PathVariable Long materialId,
                       @AuthenticationPrincipal AppUserPrincipal principal) {
        materialService.delete(courseId, materialId, principal);
    }

    @PostMapping("/ask")
    @Operation(summary = "Ask a question over this course's processed materials")
    public MaterialAnswerDto ask(@PathVariable Long courseId,
                                 @Valid @RequestBody MaterialAskRequest request,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return materialService.ask(courseId, principal, request.question());
    }
}
