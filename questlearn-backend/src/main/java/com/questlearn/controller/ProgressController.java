package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CompleteModuleRequest;
import com.questlearn.dto.LeaderboardEntry;
import com.questlearn.dto.ModuleDetailDto;
import com.questlearn.dto.SkillTreeDto;
import com.questlearn.dto.XpAwardResponse;
import com.questlearn.service.ProgressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Progression", description = "Skill tree, node completion, XP and leaderboard")
public class ProgressController {

    private final ProgressService progressService;

    @GetMapping("/courses/{courseId}/skill-tree")
    @Operation(summary = "Course nodes merged with the learner's LOCKED/UNLOCKED/COMPLETED state")
    public SkillTreeDto skillTree(@PathVariable Long courseId,
                                  @AuthenticationPrincipal AppUserPrincipal principal) {
        return progressService.getSkillTree(courseId, principal);
    }

    @GetMapping("/modules/{moduleId}")
    @Operation(summary = "Lesson content plus the sanitized interactive quiz")
    public ModuleDetailDto moduleDetail(@PathVariable Long moduleId,
                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        return progressService.getModuleDetail(moduleId, principal);
    }

    @PostMapping("/modules/{moduleId}/complete")
    @PreAuthorize("hasAnyRole('STUDENT','ADMIN')")
    @Operation(summary = "Score the quiz, award XP, unlock child nodes")
    public XpAwardResponse completeModule(@PathVariable Long moduleId,
                                          @RequestBody(required = false) @Valid CompleteModuleRequest request,
                                          @AuthenticationPrincipal AppUserPrincipal principal) {
        List<com.questlearn.dto.AnswerRequest> answers =
                request == null ? List.of() : request.answers();
        return progressService.completeModule(moduleId, principal, answers);
    }

    @GetMapping("/leaderboard")
    @PreAuthorize("hasAnyRole('STUDENT','ADMIN')")
    @Operation(summary = "Top students by total XP")
    public List<LeaderboardEntry> leaderboard(@AuthenticationPrincipal AppUserPrincipal principal) {
        return progressService.leaderboard(principal);
    }
}
