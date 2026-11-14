package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseAnalyticsDto;
import com.questlearn.service.AnalyticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Where a course loses people.
 *
 * <p>One endpoint for the studio's analytics panel. It is owner-or-admin only, because
 * a course's funnel says how a class is doing and that is the teacher's business.</p>
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Analytics", description = "Per-node funnels for a course or one class")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @GetMapping("/courses/{courseId}/analytics")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Per-node funnel for a course, or for one class inside it")
    public CourseAnalyticsDto courseAnalytics(@PathVariable Long courseId,
                                             @RequestParam(required = false) Long cohortId,
                                             @AuthenticationPrincipal AppUserPrincipal principal) {
        return analyticsService.course(courseId, cohortId, principal);
    }
}
