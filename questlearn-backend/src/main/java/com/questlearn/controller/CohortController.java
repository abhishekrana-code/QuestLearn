package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CohortDto;
import com.questlearn.dto.CohortJoinResponse;
import com.questlearn.dto.CreateCohortRequest;
import com.questlearn.dto.JoinCohortRequest;
import com.questlearn.service.CohortService;
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

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Cohorts", description = "Classes inside a course, and their join codes")
public class CohortController {

    private final CohortService cohortService;

    @GetMapping("/courses/{courseId}/cohorts")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Classes in this course, with their join codes and sizes")
    public List<CohortDto> list(@PathVariable Long courseId,
                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return cohortService.list(courseId, principal);
    }

    @PostMapping("/courses/{courseId}/cohorts")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Create a class and return its join code")
    public CohortDto create(@PathVariable Long courseId,
                            @Valid @RequestBody CreateCohortRequest request,
                            @AuthenticationPrincipal AppUserPrincipal principal) {
        return cohortService.create(courseId, request.name(), principal);
    }

    @DeleteMapping("/cohorts/{cohortId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Delete a class; members keep their course and progress")
    public void delete(@PathVariable Long cohortId,
                       @AuthenticationPrincipal AppUserPrincipal principal) {
        cohortService.delete(cohortId, principal);
    }

    @PostMapping("/cohorts/join")
    @PreAuthorize("hasRole('STUDENT')")
    @Operation(summary = "Join a class by its code, which also enrolls in the course")
    public CohortJoinResponse join(@Valid @RequestBody JoinCohortRequest request,
                                   @AuthenticationPrincipal AppUserPrincipal principal) {
        return cohortService.join(request.code(), principal);
    }
}
