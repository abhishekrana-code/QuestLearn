package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.NextNodeDto;
import com.questlearn.model.Course;
import com.questlearn.model.DeadlineState;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The "continue" card is only as good as the node it points at: sending a learner
 * into a locked branch or back into finished work is worse than showing nothing.
 */
class ProgressServiceTest {

    private final CourseRepository courseRepository = mock(CourseRepository.class);
    private final ModuleRepository moduleRepository = mock(ModuleRepository.class);
    private final ModuleAttemptRepository attemptRepository = mock(ModuleAttemptRepository.class);
    private final UserModuleProgressRepository progressRepository =
            mock(UserModuleProgressRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final EnrollmentRepository enrollmentRepository = mock(EnrollmentRepository.class);
    private final QuizService quizService = mock(QuizService.class);
    private final GamificationService gamificationService = mock(GamificationService.class);
    private final CourseService courseService = mock(CourseService.class);
    private final EffectiveDeadlines effectiveDeadlines = mock(EffectiveDeadlines.class);
    private final CohortRepository cohortRepository = mock(CohortRepository.class);
    private final CohortMembershipRepository cohortMembershipRepository =
            mock(CohortMembershipRepository.class);

    // The real clock and window keep the urgency ordering honest.
    private final DeadlineStateResolver deadlineStateResolver = new DeadlineStateResolver(7);

    private final ProgressService service = new ProgressService(courseRepository, moduleRepository,
            attemptRepository, progressRepository, userRepository, enrollmentRepository,
            quizService, gamificationService, courseService, deadlineStateResolver,
            effectiveDeadlines, cohortRepository, cohortMembershipRepository);

    private final AppUserPrincipal student =
            new AppUserPrincipal(7L, "learner@example.com", Role.STUDENT);

    @Test
    void picksTheRootWhileItsChildIsStillLocked() {
        Course course = course(18L, "Data structures");
        Module root = module(100L, "Arrays", course, null, null);
        Module child = module(101L, "Linked lists", course, root, null);

        givenEnrolments(course);
        givenNodes(root, child);
        givenProgress();

        NextNodeDto next = service.nextNode(student);

        assertThat(next).isNotNull();
        assertThat(next.nodeId()).isEqualTo(100L);
        assertThat(next.courseTitle()).isEqualTo("Data structures");
        assertThat(next.xpReward()).isEqualTo(50);
        assertThat(next.dueAt()).isNull();
        assertThat(next.deadlineState()).isNull();
    }

    @Test
    void skipsTheLockedChildAndOpensTheOverdueSibling() {
        Course course = course(18L, "Data structures");
        Module root = module(100L, "Arrays", course, null, null);
        Module child = module(101L, "Linked lists", course, root, null);
        Module sibling = module(102L, "Hash maps", course, null,
                Instant.now().minus(2, ChronoUnit.DAYS));
        Module later = module(103L, "Graphs", course, null,
                Instant.now().plus(20, ChronoUnit.DAYS));

        givenEnrolments(course);
        givenNodes(root, child, sibling, later);
        givenProgress(progress(root, ProgressStatus.COMPLETED));

        NextNodeDto next = service.nextNode(student);

        assertThat(next.nodeId()).isEqualTo(102L);
        assertThat(next.deadlineState()).isEqualTo(DeadlineState.OVERDUE);
    }

    @Test
    void answersNothingWhenThereIsNoWorkLeft() {
        Course course = course(18L, "Data structures");
        Module root = module(100L, "Arrays", course, null, null);

        givenEnrolments(course);
        givenNodes(root);
        givenProgress(progress(root, ProgressStatus.COMPLETED));

        assertThat(service.nextNode(student)).isNull();
    }

    @Test
    void answersNothingForSomeoneNotEnrolled() {
        when(enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(7L)).thenReturn(List.of());

        assertThat(service.nextNode(student)).isNull();
    }

    @Test
    void answersNothingForTeachers() {
        AppUserPrincipal teacher =
                new AppUserPrincipal(8L, "teacher@example.com", Role.INSTRUCTOR);

        assertThat(service.nextNode(teacher)).isNull();
    }

    @Test
    void ignoresNodesInArchivedOrUnpublishedCourses() {
        Course archived = course(19L, "Retired course");
        archived.setArchivedAt(Instant.now().minus(30, ChronoUnit.DAYS));
        Course hidden = course(20L, "Draft course");
        hidden.setPublished(false);
        Module archivedNode = module(200L, "Old work", archived, null, null);
        Module hiddenNode = module(201L, "Draft work", hidden, null, null);

        when(enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(7L)).thenReturn(List.of(
                enrollment(archived), enrollment(hidden)));
        givenNodes(archivedNode, hiddenNode);
        givenProgress();

        assertThat(service.nextNode(student)).isNull();
    }

    private void givenEnrolments(Course... courses) {
        when(enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(7L))
                .thenReturn(java.util.Arrays.stream(courses).map(this::enrollment).toList());
    }

    private void givenNodes(Module... modules) {
        when(moduleRepository.findByCourseIdIn(anyCollection())).thenReturn(List.of(modules));
        when(effectiveDeadlines.overridesFor(anyLong(), anyCollection())).thenReturn(Map.of());
        when(effectiveDeadlines.dueAt(any(Module.class), any()))
                .thenAnswer(call -> call.getArgument(0, Module.class).getDueAt());
    }

    private void givenProgress(UserModuleProgress... rows) {
        when(progressRepository.findByUserId(7L)).thenReturn(List.of(rows));
    }

    private Enrollment enrollment(Course course) {
        return Enrollment.builder()
                .userId(7L)
                .courseId(course.getId())
                .enrolledAt(Instant.now())
                .build();
    }

    private static UserModuleProgress progress(Module module, ProgressStatus status) {
        return UserModuleProgress.builder()
                .user(User.builder().id(7L).build())
                .module(module)
                .status(status)
                .build();
    }

    private static Course course(Long id, String title) {
        return Course.builder().id(id).title(title).published(true).build();
    }

    private static Module module(Long id, String title, Course course, Module parent, Instant dueAt) {
        return Module.builder()
                .id(id)
                .title(title)
                .course(course)
                .parentModule(parent)
                .xpReward(50)
                .dueAt(dueAt)
                .build();
    }
}
