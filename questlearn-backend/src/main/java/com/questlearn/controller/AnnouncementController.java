package com.questlearn.controller;

import com.questlearn.dto.AnnouncementDto;
import com.questlearn.dto.AnnouncementFeedPage;
import com.questlearn.dto.AnnouncementMarkAllResultDto;
import com.questlearn.dto.AnnouncementReceiptSummaryDto;
import com.questlearn.dto.AnnouncementReceiptsDto;
import com.questlearn.dto.AnnouncementUnreadCountDto;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Course and class announcements. Reading, the learner's cross-course feed, and
 * recording that a note was read are the endpoints a learner uses; the service
 * decides what that learner is allowed to see. Receipts are the instructor's side
 * of the same channel and never leave the course's staff.
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

    @GetMapping("/announcements")
    @PreAuthorize("hasRole('STUDENT')")
    @Operation(summary = "Every notice across the learner's courses, newest first, in one page")
    public AnnouncementFeedPage feed(@RequestParam(defaultValue = "0") int page,
                                     @RequestParam(defaultValue = "20") int size,
                                     @RequestParam(required = false) Long courseId,
                                     @RequestParam(defaultValue = "false") boolean unread,
                                     @AuthenticationPrincipal AppUserPrincipal principal) {
        return announcementService.feed(principal, page, size, courseId, unread);
    }

    @GetMapping("/announcements/unread-count")
    @PreAuthorize("hasRole('STUDENT')")
    @Operation(summary = "How many of the learner's notices are still unread")
    public AnnouncementUnreadCountDto unreadCount(
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return new AnnouncementUnreadCountDto(announcementService.unreadCount(principal));
    }

    @PostMapping("/announcements/read-all")
    @PreAuthorize("hasRole('STUDENT')")
    @Operation(summary = "Mark every note in the caller's feed read, and nothing outside it")
    public AnnouncementMarkAllResultDto markAllRead(
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return new AnnouncementMarkAllResultDto(announcementService.markAllRead(principal));
    }

    @PostMapping("/announcements/{announcementId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Mark one announcement read for the caller; the visibility rules still apply")
    public void markRead(@PathVariable Long announcementId,
                         @AuthenticationPrincipal AppUserPrincipal principal) {
        announcementService.markRead(announcementId, principal);
    }

    @GetMapping("/courses/{courseId}/announcements/receipts")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Read counts for every note in one course, for the studio list")
    public List<AnnouncementReceiptSummaryDto> receiptSummaries(
            @PathVariable Long courseId,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return announcementService.receiptSummaries(courseId, principal);
    }

    @GetMapping("/announcements/{announcementId}/receipts")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Who has and has not read one note, paged, for the course's staff")
    public AnnouncementReceiptsDto receipts(
            @PathVariable Long announcementId,
            @RequestParam(defaultValue = "unread") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return announcementService.receipts(announcementId, status, page, size, principal);
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
