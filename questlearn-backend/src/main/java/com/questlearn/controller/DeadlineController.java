package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.DeadlineDto;
import com.questlearn.dto.DeadlineOverviewDto;
import com.questlearn.dto.SetDeadlineRequest;
import com.questlearn.service.DeadlineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import java.util.List;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Dated nodes. One deadline per node, applying to the whole course; it is
 * advisory, so the completion endpoints are deliberately unaware of it.
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Deadlines", description = "Node due dates and the learner's deadline panel")
public class DeadlineController {

    private final DeadlineService deadlineService;

    @GetMapping("/me/deadlines")
    @Operation(summary = "The signed-in learner's dated nodes, soonest first")
    public DeadlineOverviewDto overview(@AuthenticationPrincipal AppUserPrincipal principal) {
        return deadlineService.overview(principal);
    }

    @PutMapping("/courses/{courseId}/modules/{moduleId}/deadline")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Set or move one node's due date")
    public DeadlineDto setDeadline(@PathVariable Long courseId,
                                   @PathVariable Long moduleId,
                                   @Valid @RequestBody SetDeadlineRequest request,
                                   @AuthenticationPrincipal AppUserPrincipal principal) {
        return deadlineService.setDeadline(courseId, moduleId, request.dueAt(), principal);
    }

    @DeleteMapping("/courses/{courseId}/modules/{moduleId}/deadline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Make one node self-paced again")
    public void clearDeadline(@PathVariable Long courseId,
                              @PathVariable Long moduleId,
                              @AuthenticationPrincipal AppUserPrincipal principal) {
        deadlineService.clearDeadline(courseId, moduleId, principal);
    }

    @GetMapping("/courses/{courseId}/cohorts/{cohortId}/deadlines")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "One class's deadline overrides")
    public List<DeadlineDto> cohortOverrides(@PathVariable Long courseId,
                                             @PathVariable Long cohortId,
                                             @AuthenticationPrincipal AppUserPrincipal principal) {
        return deadlineService.cohortOverrides(courseId, cohortId, principal);
    }

    @PutMapping("/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Give one class its own due date for a node")
    public DeadlineDto setCohortDeadline(@PathVariable Long courseId,
                                         @PathVariable Long cohortId,
                                         @PathVariable Long moduleId,
                                         @Valid @RequestBody SetDeadlineRequest request,
                                         @AuthenticationPrincipal AppUserPrincipal principal) {
        return deadlineService.setCohortDeadline(courseId, cohortId, moduleId,
                request.dueAt(), principal);
    }

    @DeleteMapping("/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Drop a class override so the node's own date applies again")
    public void clearCohortDeadline(@PathVariable Long courseId,
                                    @PathVariable Long cohortId,
                                    @PathVariable Long moduleId,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        deadlineService.clearCohortDeadline(courseId, cohortId, moduleId, principal);
    }
}
