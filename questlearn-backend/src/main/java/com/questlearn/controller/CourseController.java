package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseDto;
import com.questlearn.dto.CourseRequest;
import com.questlearn.dto.CourseRosterDto;
import com.questlearn.dto.CourseUpdateRequest;
import com.questlearn.dto.RosterLearnerDetailDto;
import com.questlearn.dto.ModuleRequest;
import com.questlearn.dto.ModuleUpdateRequest;
import com.questlearn.dto.QuizRequest;
import com.questlearn.model.Module;
import com.questlearn.model.Quiz;
import com.questlearn.service.CourseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Courses", description = "Course and skill-tree authoring")
public class CourseController {

    private final CourseService courseService;

    @GetMapping("/courses")
    @Operation(summary = "Courses visible to the current role")
    public List<CourseDto> listCourses(@AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.listCourses(principal);
    }

    @GetMapping("/courses/mine")
    @Operation(summary = "Courses the current learner has joined")
    public List<CourseDto> myCourses(@AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.listMyCourses(principal);
    }

    @PostMapping("/courses/{courseId}/enroll")
    @Operation(summary = "Join a published course (idempotent)")
    public CourseDto enroll(@PathVariable Long courseId,
                            @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.enroll(courseId, principal);
    }

    @DeleteMapping("/courses/{courseId}/enroll")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Leave a course; progress is kept")
    public void unenroll(@PathVariable Long courseId,
                         @AuthenticationPrincipal AppUserPrincipal principal) {
        courseService.unenroll(courseId, principal);
    }

    @GetMapping("/courses/{courseId}/roster")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Who joined this course, with each learner's per-node progress")
    public CourseRosterDto roster(@PathVariable Long courseId,
                                  @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.roster(courseId, principal);
    }

    @GetMapping("/courses/{courseId}/roster/{userId}")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "One learner's nodes and attempt history in this course")
    public RosterLearnerDetailDto rosterLearner(@PathVariable Long courseId,
                                                @PathVariable Long userId,
                                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.rosterLearner(courseId, userId, principal);
    }

    @GetMapping("/courses/{courseId}")
    public CourseDto getCourse(@PathVariable Long courseId,
                               @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.getCourse(courseId, principal);
    }

    @PostMapping("/courses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Create a course (starts as a draft for instructors)")
    public CourseDto createCourse(@Valid @RequestBody CourseRequest request,
                                  @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.createCourse(request, principal);
    }

    @PostMapping("/courses/{courseId}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Copy a course with its node tree and quizzes as a private draft")
    public CourseDto duplicateCourse(@PathVariable Long courseId,
                                     @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.duplicateCourse(courseId, principal);
    }

    @PatchMapping("/courses/{courseId}/archive")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Archive a course (hide from students, keep its history) or restore it as a draft")
    public CourseDto setArchived(@PathVariable Long courseId,
                                 @RequestParam boolean archived,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.setArchived(courseId, archived, principal);
    }

    @DeleteMapping("/courses/{courseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Delete a draft course that no student has worked through")
    public void deleteCourse(@PathVariable Long courseId,
                             @AuthenticationPrincipal AppUserPrincipal principal) {
        courseService.deleteCourse(courseId, principal);
    }

    @PutMapping("/courses/{courseId}")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Edit a course's title, description, category and emoji")
    public CourseDto updateCourse(@PathVariable Long courseId,
                                  @Valid @RequestBody CourseUpdateRequest request,
                                  @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.updateCourse(courseId, request, principal);
    }

    @PatchMapping("/courses/{courseId}/publish")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Publish or unpublish a course")
    public CourseDto setPublished(@PathVariable Long courseId,
                                  @RequestParam boolean published,
                                  @AuthenticationPrincipal AppUserPrincipal principal) {
        return courseService.setPublished(courseId, published, principal);
    }

    @PostMapping("/courses/{courseId}/modules")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Add a skill-tree node, optionally linked to a parent node")
    public Map<String, Object> addModule(@PathVariable Long courseId,
                                         @Valid @RequestBody ModuleRequest request,
                                         @AuthenticationPrincipal AppUserPrincipal principal) {
        Module module = courseService.addModule(courseId, request, principal);
        return Map.of(
                "id", module.getId(),
                "title", module.getTitle(),
                "xpReward", module.getXpReward(),
                "parentModuleId", module.getParentModule() == null ? 0 : module.getParentModule().getId(),
                "positionX", module.getPositionX(),
                "positionY", module.getPositionY(),
                "orderIndex", module.getOrderIndex()
        );
    }

    @PutMapping("/modules/{moduleId}")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Edit a node's title, summary, lesson and XP reward")
    public Map<String, Object> updateModule(@PathVariable Long moduleId,
                                            @Valid @RequestBody ModuleUpdateRequest request,
                                            @AuthenticationPrincipal AppUserPrincipal principal) {
        Module module = courseService.updateModule(moduleId, request, principal);
        return Map.of(
                "id", module.getId(),
                "title", module.getTitle(),
                "summary", module.getSummary() == null ? "" : module.getSummary(),
                "xpReward", module.getXpReward()
        );
    }

    @PostMapping("/modules/{moduleId}/quiz")
    @PreAuthorize("hasAnyRole('INSTRUCTOR','ADMIN')")
    @Operation(summary = "Attach or replace a JSONB quiz on a node")
    public Map<String, Object> attachQuiz(@PathVariable Long moduleId,
                                          @Valid @RequestBody QuizRequest request,
                                          @AuthenticationPrincipal AppUserPrincipal principal) {
        Quiz quiz = courseService.attachQuiz(moduleId, request, principal);
        return Map.of(
                "id", quiz.getId(),
                "moduleId", moduleId,
                "type", quiz.getType(),
                "passingScore", quiz.getPassingScore()
        );
    }
}
