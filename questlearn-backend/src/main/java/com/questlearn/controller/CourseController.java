package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseDto;
import com.questlearn.dto.CourseRequest;
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
