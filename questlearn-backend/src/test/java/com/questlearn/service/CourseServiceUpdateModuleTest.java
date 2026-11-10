package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.ModuleUpdateRequest;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Editing a node is the one authoring action that can quietly destroy work: a
 * stale form could drop an uploaded video, and a non-owner could rewrite someone
 * else's lesson.
 */
class CourseServiceUpdateModuleTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ModuleRepository moduleRepository;
    private CourseService courseService;
    private Module module;
    private final AppUserPrincipal owner = new AppUserPrincipal(7L, "owner@questlearn.dev", Role.INSTRUCTOR);

    @BeforeEach
    void setUp() {
        moduleRepository = mock(ModuleRepository.class);
        courseService = new CourseService(
                mock(CourseRepository.class),
                moduleRepository,
                mock(QuizRepository.class),
                mock(UserRepository.class),
                mock(UserModuleProgressRepository.class),
                mock(QuizService.class));

        User instructor = User.builder().id(7L).email("owner@questlearn.dev").role(Role.INSTRUCTOR).build();
        Course course = Course.builder().id(1L).instructor(instructor).build();
        module = Module.builder()
                .id(14L)
                .title("Flexbox rows")
                .summary("Old summary")
                .xpReward(100)
                .content(MAPPER.createObjectNode())
                .course(course)
                .build();
        when(moduleRepository.findById(14L)).thenReturn(Optional.of(module));
        when(moduleRepository.save(any(Module.class))).thenAnswer(call -> call.getArgument(0));
    }

    private JsonNode lesson(String json) throws Exception {
        return MAPPER.readTree(json);
    }

    @Test
    void updatesTitleSummaryXpAndLesson() throws Exception {
        ModuleUpdateRequest request = new ModuleUpdateRequest(
                "  Flexbox rows  ", "How a row is laid out", lesson("""
                {"sections":[{"heading":"The idea","body":"Left to right."}],"keyTakeaways":["Gap beats margins."]}
                """), 250);

        courseService.updateModule(14L, request, owner);

        assertThat(module.getTitle()).isEqualTo("Flexbox rows");
        assertThat(module.getSummary()).isEqualTo("How a row is laid out");
        assertThat(module.getXpReward()).isEqualTo(250);
        assertThat(module.getContent().path("sections")).hasSize(1);
        assertThat(module.getContent().path("sections").get(0).path("heading").asText())
                .isEqualTo("The idea");
    }

    @Test
    void keepsTheUploadedVideoWhenTheLessonIsSaved() throws Exception {
        ObjectNode existing = (ObjectNode) lesson("""
                {"videoUrl":"/api/v1/media/videos/abc.mp4","videoLabel":"intro.mp4",
                 "sections":[{"heading":"Old","body":"Old body"}]}
                """);
        module.setContent(existing);

        courseService.updateModule(14L, new ModuleUpdateRequest(
                "Flexbox rows", null, lesson("""
                {"sections":[{"heading":"New","body":"New body"}],"viva":{"topics":["wrap"]}}
                """), null), owner);

        JsonNode saved = module.getContent();
        assertThat(saved.path("videoUrl").asText()).isEqualTo("/api/v1/media/videos/abc.mp4");
        assertThat(saved.path("videoLabel").asText()).isEqualTo("intro.mp4");
        assertThat(saved.path("sections").get(0).path("heading").asText()).isEqualTo("New");
        assertThat(saved.path("viva").path("topics").get(0).asText()).isEqualTo("wrap");
    }

    @Test
    void blankSummaryAndEmptyLessonBecomeNull() {
        courseService.updateModule(14L, new ModuleUpdateRequest("Flexbox rows", "   ", null, 100), owner);

        assertThat(module.getSummary()).isNull();
        assertThat(module.getContent()).isNull();
    }

    @Test
    void anotherInstructorCannotEditTheNode() {
        AppUserPrincipal stranger = new AppUserPrincipal(99L, "stranger@questlearn.dev", Role.INSTRUCTOR);

        assertThatThrownBy(() ->
                courseService.updateModule(14L, new ModuleUpdateRequest("Hijacked", null, null, 5000), stranger))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getStatus())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(module.getTitle()).isEqualTo("Flexbox rows");
        verify(moduleRepository, never()).save(any(Module.class));
    }

    @Test
    void adminCanEditAnyNode() {
        AppUserPrincipal admin = new AppUserPrincipal(1L, "admin@questlearn.dev", Role.ADMIN);

        courseService.updateModule(14L, new ModuleUpdateRequest("Renamed", null, null, 50), admin);

        assertThat(module.getTitle()).isEqualTo("Renamed");
        assertThat(module.getXpReward()).isEqualTo(50);
    }
}
