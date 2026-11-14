package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AttachUploadRequest;
import com.questlearn.dto.VideoAttachmentDto;
import com.questlearn.dto.VideoUploadTicketDto;
import com.questlearn.dto.VideoUrlRequest;
import com.questlearn.service.LessonVideoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Lesson video for a node.
 *
 * <p>Instructors can either upload a file (streamed to disk) or point at a video
 * that already lives somewhere else. Both end up as {@code videoUrl} in the
 * node's lesson content, which is what the student's briefing plays.</p>
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Media", description = "Lesson videos for course nodes")
public class MediaController {

    private final LessonVideoService lessonVideoService;

    @PostMapping(path = "/modules/{moduleId}/video", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Upload a lesson video file for a node")
    public VideoAttachmentDto uploadVideo(@PathVariable Long moduleId,
                                          @RequestPart("file") MultipartFile file,
                                          @AuthenticationPrincipal AppUserPrincipal principal) {
        return lessonVideoService.upload(moduleId, principal, file);
    }

    @PostMapping("/modules/{moduleId}/video/upload-ticket")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Get a signed place to upload a lesson video")
    public VideoUploadTicketDto uploadTicket(@PathVariable Long moduleId,
                                            @RequestParam(required = false) String filename,
                                            @AuthenticationPrincipal AppUserPrincipal principal) {
        return lessonVideoService.uploadTicket(moduleId, filename, principal);
    }

    @PostMapping(path = "/modules/{moduleId}/video/attachments",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Record a video the browser uploaded directly")
    public VideoAttachmentDto attachUpload(@PathVariable Long moduleId,
                                          @Valid @RequestBody AttachUploadRequest request,
                                          @AuthenticationPrincipal AppUserPrincipal principal) {
        return lessonVideoService.attachUpload(moduleId, request.name(), request.label(), principal);
    }

    @PutMapping(path = "/modules/{moduleId}/video-url", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Attach a lesson video that is hosted elsewhere")
    public VideoAttachmentDto attachVideoUrl(@PathVariable Long moduleId,
                                             @Valid @RequestBody VideoUrlRequest request,
                                             @AuthenticationPrincipal AppUserPrincipal principal) {
        return lessonVideoService.attachUrl(moduleId, principal, request.url(), request.label());
    }

    @DeleteMapping("/modules/{moduleId}/video")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Remove the lesson video from a node")
    public VideoAttachmentDto removeVideo(@PathVariable Long moduleId,
                                          @AuthenticationPrincipal AppUserPrincipal principal) {
        return lessonVideoService.remove(moduleId, principal);
    }
}
