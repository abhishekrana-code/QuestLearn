package com.questlearn.controller;

import com.questlearn.dto.AdminStatsDto;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuditEntryDto;
import com.questlearn.dto.TempPasswordResponse;
import com.questlearn.dto.UpdateRoleRequest;
import com.questlearn.dto.UserDto;
import com.questlearn.service.AdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Administration", description = "User moderation and platform statistics")
public class AdminController {

    private final AdminService adminService;

    @GetMapping("/users")
    @Operation(summary = "List every account, optionally filtered by name or email")
    public List<UserDto> users(@RequestParam(required = false) String query) {
        return adminService.listUsers(query);
    }

    @PatchMapping("/users/{userId}/role")
    @Operation(summary = "Change a user's role")
    public UserDto updateRole(@PathVariable Long userId,
                              @Valid @RequestBody UpdateRoleRequest request,
                              @AuthenticationPrincipal AppUserPrincipal principal) {
        return adminService.updateRole(userId, request.role(), principal);
    }

    @PostMapping("/users/{userId}/reset-password")
    @Operation(summary = "Issue a one-time temporary password for a locked-out account")
    public TempPasswordResponse resetPassword(@PathVariable Long userId,
                                              @AuthenticationPrincipal AppUserPrincipal principal) {
        return adminService.resetPassword(userId, principal);
    }

    @DeleteMapping("/users/{userId}/modules/{moduleId}/progress")
    @Operation(summary = "Reset one learner's progress on one node so they can retry it")
    public UserDto resetProgress(@PathVariable Long userId,
                                 @PathVariable Long moduleId,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return adminService.resetProgress(userId, moduleId, principal);
    }

    @GetMapping("/audit")
    @Operation(summary = "Recent privileged actions, newest first")
    public List<AuditEntryDto> audit() {
        return adminService.auditTrail();
    }

    @GetMapping("/stats")
    public AdminStatsDto stats() {
        return adminService.stats();
    }
}
