package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseDto;
import com.questlearn.dto.CourseRequest;
import com.questlearn.dto.ModuleRequest;
import com.questlearn.dto.ModuleUpdateRequest;
import com.questlearn.dto.QuizRequest;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Quiz;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CourseService {

    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuizRepository quizRepository;
    private final UserRepository userRepository;
    private final UserModuleProgressRepository progressRepository;
    private final QuizService quizService;

    @Transactional(readOnly = true)
    public List<CourseDto> listCourses(AppUserPrincipal principal) {
        Map<Long, Course> visible = new LinkedHashMap<>();
        if (principal.role() == Role.ADMIN) {
            courseRepository.findAllByOrderByIdAsc().forEach(c -> visible.put(c.getId(), c));
        } else if (principal.role() == Role.INSTRUCTOR) {
            courseRepository.findByPublishedTrueOrderByIdAsc().forEach(c -> visible.put(c.getId(), c));
            courseRepository.findByInstructorIdOrderByIdAsc(principal.id())
                    .forEach(c -> visible.put(c.getId(), c));
        } else {
            courseRepository.findByPublishedTrueOrderByIdAsc().forEach(c -> visible.put(c.getId(), c));
        }

        return visible.values().stream()
                .sorted(Comparator.comparing(Course::getId))
                .map(course -> toCourseDto(course, principal))
                .toList();
    }

    @Transactional(readOnly = true)
    public CourseDto getCourse(Long courseId, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanView(course, principal);
        return toCourseDto(course, principal);
    }

    @Transactional
    public CourseDto createCourse(CourseRequest request, AppUserPrincipal principal) {
        User instructor = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        boolean published = principal.role() == Role.ADMIN && Boolean.TRUE.equals(request.published());

        Course course = Course.builder()
                .title(request.title().trim())
                .description(request.description())
                .category(request.category())
                .emoji(request.emoji() == null || request.emoji().isBlank() ? "🗺️" : request.emoji())
                .published(published)
                .instructor(instructor)
                .build();

        return toCourseDto(courseRepository.save(course), principal);
    }

    @Transactional
    public CourseDto setPublished(Long courseId, boolean published, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);
        course.setPublished(published);
        return toCourseDto(courseRepository.save(course), principal);
    }

    @Transactional
    public Module addModule(Long courseId, ModuleRequest request, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        Module parent = null;
        if (request.parentModuleId() != null) {
            parent = moduleRepository.findById(request.parentModuleId())
                    .orElseThrow(() -> ApiException.badRequest("Parent module does not exist"));
            if (!parent.getCourse().getId().equals(courseId)) {
                throw ApiException.badRequest("Parent module belongs to a different course");
            }
        }

        long existing = moduleRepository.countByCourseId(courseId);
        int orderIndex = request.orderIndex() != null ? request.orderIndex() : (int) existing;

        Module module = Module.builder()
                .title(request.title().trim())
                .summary(request.summary())
                .content(request.content())
                .xpReward(request.xpReward() != null ? request.xpReward() : 100)
                .positionX(request.positionX() != null ? request.positionX() : 0)
                .positionY(request.positionY() != null ? request.positionY() : orderIndex)
                .orderIndex(orderIndex)
                .course(course)
                .parentModule(parent)
                .build();

        return moduleRepository.save(module);
    }

    @Transactional
    public Module updateModule(Long moduleId, ModuleUpdateRequest request, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        assertCanManage(module.getCourse(), principal);

        module.setTitle(request.title().trim());
        String summary = request.summary() == null ? null : request.summary().trim();
        module.setSummary(summary == null || summary.isEmpty() ? null : summary);
        if (request.xpReward() != null) {
            module.setXpReward(request.xpReward());
        }
        module.setContent(lessonKeepingMedia(module.getContent(), request.content()));

        return moduleRepository.save(module);
    }

    /**
     * The lesson editor owns the prose; the media endpoints own the video. Copy the
     * request's lesson over and then put back the video fields still on the node, so
     * saving a lesson can never silently delete a teacher's uploaded film.
     */
    private static JsonNode lessonKeepingMedia(JsonNode existing, JsonNode incoming) {
        ObjectNode next = JsonNodeFactory.instance.objectNode();
        if (incoming != null && incoming.isObject()) {
            next.setAll((ObjectNode) incoming);
        }
        if (existing != null && existing.isObject()) {
            for (String field : List.of("videoUrl", "videoLabel")) {
                JsonNode value = existing.get(field);
                if (value != null && !value.isNull() && !value.asText().isBlank()) {
                    next.set(field, value);
                }
            }
        }
        return next.isEmpty() ? null : next;
    }

    @Transactional
    public Quiz attachQuiz(Long moduleId, QuizRequest request, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        assertCanManage(module.getCourse(), principal);
        quizService.validate(request.type(), request.payload());

        Quiz quiz = quizRepository.findByModuleId(moduleId).orElseGet(() -> Quiz.builder()
                .module(module)
                .build());
        quiz.setType(request.type());
        quiz.setPassingScore(request.passingScore() != null ? request.passingScore() : 60);
        quiz.setPayload(request.payload());

        return quizRepository.save(quiz);
    }

    @Transactional(readOnly = true)
    public Module getModuleEntity(Long moduleId) {
        return moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
    }

    public Course loadCourse(Long courseId) {
        return courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }

    public void assertCanManage(Course course, AppUserPrincipal principal) {
        if (principal.role() == Role.ADMIN) {
            return;
        }
        if (principal.role() == Role.INSTRUCTOR
                && course.getInstructor() != null
                && course.getInstructor().getId().equals(principal.id())) {
            return;
        }
        throw ApiException.forbidden("Only the course instructor or an admin can do that");
    }

    public void assertCanView(Course course, AppUserPrincipal principal) {
        if (course.isPublished() || principal.role() == Role.ADMIN) {
            return;
        }
        if (principal.role() == Role.INSTRUCTOR
                && course.getInstructor() != null
                && course.getInstructor().getId().equals(principal.id())) {
            return;
        }
        throw ApiException.forbidden("This course is not published yet");
    }

    private CourseDto toCourseDto(Course course, AppUserPrincipal principal) {
        long moduleCount = moduleRepository.countByCourseId(course.getId());
        long completed = 0;
        if (principal.role() != Role.INSTRUCTOR) {
            completed = progressRepository.countByUserIdAndModuleCourseIdAndStatus(
                    principal.id(), course.getId(), ProgressStatus.COMPLETED);
        }
        List<Long> moduleIds = moduleRepository.findByCourseIdOrderByOrderIndexAsc(course.getId())
                .stream().map(Module::getId).toList();
        if (moduleIds.isEmpty()) {
            completed = 0;
        }

        return new CourseDto(
                course.getId(),
                course.getTitle(),
                course.getDescription(),
                course.getCategory(),
                course.getEmoji(),
                course.isPublished(),
                course.getInstructor() == null ? null : course.getInstructor().getId(),
                course.getInstructor() == null ? "QuestLearn" : course.getInstructor().getName(),
                moduleCount,
                completed,
                course.getCreatedAt()
        );
    }

    /** Convenience used by the dashboard: module ids for a course in order. */
    public List<Long> moduleIds(Long courseId) {
        List<Long> ids = new ArrayList<>();
        moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId)
                .forEach(m -> ids.add(m.getId()));
        return ids;
    }
}
