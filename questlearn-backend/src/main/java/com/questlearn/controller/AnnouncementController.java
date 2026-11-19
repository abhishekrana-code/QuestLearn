package com.questlearn.controller;

import com.questlearn.dto.AnnouncementDto;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CreateAnnouncementRequest;
import com.questlearn.service.AnnouncementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Course and class announcements. Reading, and recording that a note was read,
 * are the endpoints a learner uses; the service decides what that learner is
 * allowed to see.
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Announcements", description = "Course and class notices from the instructor")
public class AnnouncementController {

    private final AnnouncementService announcementService;

    @GetMapping("/courses/{courseId}/announcements")
    @Operation(summary = "Announcements for this course, newest first, filtered to the caller's classes")
    public List<AnnouncementDto> list(@PathVariable Long courseId,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return announcementService.list(courseId, principal);
    }

    @PostMapping("/courses/{courseId}/announcements")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Post a note to the whole course, or to one of its classes")
    public AnnouncementDto create(@PathVariable Long courseId,
                                  @Valid @RequestBody CreateAnnouncementRequest request,
                                  @AuthenticationPrincipal AppUserPrincipal principal) {
        return announcementService.create(courseId, request, principal);
    }

    @PostMapping("/announcements/{announcementId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Mark one announcement read for the caller; the visibility rules still apply")
    public void markRead(@PathVariable Long announcementId,
                         @AuthenticationPrincipal AppUserPrincipal principal) {
        announcementService.markRead(announcementId, principal);
    }

    @DeleteMapping("/announcements/{announcementId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Remove an announcement from the course")
    public void delete(@PathVariable Long announcementId,
                       @AuthenticationPrincipal AppUserPrincipal principal) {
        announcementService.delete(announcementId, principal);
    }
}
