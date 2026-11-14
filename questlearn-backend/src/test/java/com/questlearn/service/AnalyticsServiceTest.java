package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseAnalyticsDto;
import com.questlearn.dto.NodeFunnelDto;
import com.questlearn.model.Cohort;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Course;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.ModuleAttempt;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnalyticsServiceTest {

    private final CourseService courseService = mock(CourseService.class);
    private final EnrollmentRepository enrollmentRepository = mock(EnrollmentRepository.class);
    private final CohortRepository cohortRepository = mock(CohortRepository.class);
    private final CohortMembershipRepository membershipRepository = mock(CohortMembershipRepository.class);
    private final ModuleRepository moduleRepository = mock(ModuleRepository.class);
    private final UserModuleProgressRepository progressRepository = mock(UserModuleProgressRepository.class);
    private final ModuleAttemptRepository attemptRepository = mock(ModuleAttemptRepository.class);

    private final AnalyticsService service = new AnalyticsService(courseService, enrollmentRepository,
            cohortRepository, membershipRepository, moduleRepository, progressRepository,
            attemptRepository);

    private final AppUserPrincipal instructor = new AppUserPrincipal(1L, "teacher@example.com",
            Role.INSTRUCTOR);
    private final Course course = course(9L);

    @BeforeEach
    void commonStubs() {
        when(courseService.loadCourse(9L)).thenReturn(course);
        when(enrollmentRepository.findByCourseIdOrderByEnrolledAtAsc(9L)).thenReturn(List.of(
                enrollment(11L), enrollment(12L), enrollment(13L)));
        when(moduleRepository.findByCourseIdOrderByOrderIndexAsc(9L))
                .thenReturn(List.of(module(101L, "Foundations", 1), module(102L, "Loops", 2)));
        when(attemptRepository.findByModuleCourseIdAndUserIdInOrderByCreatedAtAsc(anyLong(), any()))
                .thenReturn(List.of());
    }

    @Test
    void countsReachedStartedAndClearedPerNode() {
        when(progressRepository.findByModuleCourseIdAndUserIdIn(9L, List.of(11L, 12L, 13L)))
                .thenReturn(List.of(
                        progress(11L, 101L, ProgressStatus.COMPLETED, 2, "2026-03-01T10:00:00Z"),
                        progress(12L, 101L, ProgressStatus.LOCKED, 0, null),
                        progress(13L, 101L, ProgressStatus.UNLOCKED, 0, null),
                        progress(11L, 102L, ProgressStatus.UNLOCKED, 1, null)));

        CourseAnalyticsDto result = service.course(9L, null, instructor);

        assertThat(result.learners()).isEqualTo(3);
        NodeFunnelDto first = result.nodes().get(0);
        assertThat(first.reached()).isEqualTo(2);   // completed and unlocked, not locked
        assertThat(first.cleared()).isEqualTo(1);
        assertThat(first.started()).isEqualTo(1);   // attempts were recorded
        assertThat(first.attempts()).isZero();

        NodeFunnelDto second = result.nodes().get(1);
        assertThat(second.started()).isEqualTo(1);
        assertThat(second.cleared()).isZero();
    }

    @Test
    void theDropOffIsTheNodeWithTheMostPeopleStillStuck() {
        when(progressRepository.findByModuleCourseIdAndUserIdIn(9L, List.of(11L, 12L, 13L)))
                .thenReturn(List.of(
                        progress(11L, 101L, ProgressStatus.COMPLETED, 1, "2026-03-01T10:00:00Z"),
                        progress(12L, 101L, ProgressStatus.COMPLETED, 1, "2026-03-01T11:00:00Z"),
                        progress(13L, 101L, ProgressStatus.COMPLETED, 1, "2026-03-01T12:00:00Z"),
                        progress(11L, 102L, ProgressStatus.COMPLETED, 1, "2026-03-02T10:00:00Z"),
                        progress(12L, 102L, ProgressStatus.UNLOCKED, 1, null),
                        progress(13L, 102L, ProgressStatus.LOCKED, 0, null)));

        CourseAnalyticsDto result = service.course(9L, null, instructor);

        assertThat(result.dropOff()).isNotNull();
        assertThat(result.dropOff().moduleId()).isEqualTo(102L);
        assertThat(result.dropOff().title()).isEqualTo("Loops");
        assertThat(result.finished()).isEqualTo(1);
        assertThat(result.started()).isEqualTo(3);
    }

    @Test
    void theMedianHoursToClearUsesFirstAttemptToCompletion() {
        when(progressRepository.findByModuleCourseIdAndUserIdIn(9L, List.of(11L, 12L, 13L)))
                .thenReturn(List.of(
                        progress(11L, 101L, ProgressStatus.COMPLETED, 1, "2026-03-01T04:00:00Z"),
                        progress(12L, 101L, ProgressStatus.COMPLETED, 2, "2026-03-01T10:00:00Z"),
                        progress(13L, 101L, ProgressStatus.COMPLETED, 1, "2026-03-01T20:00:00Z")));
        when(attemptRepository.findByModuleCourseIdAndUserIdInOrderByCreatedAtAsc(9L, List.of(11L, 12L, 13L)))
                .thenReturn(List.of(
                        attempt(11L, 101L, "2026-03-01T00:00:00Z"),   // 4 hours
                        attempt(12L, 101L, "2026-03-01T00:00:00Z"),   // 10 hours
                        attempt(13L, 101L, "2026-03-01T18:00:00Z")));  // 2 hours

        CourseAnalyticsDto result = service.course(9L, null, instructor);

        assertThat(result.nodes().get(0).medianHoursToClear()).isEqualTo(4.0);
        assertThat(result.nodes().get(0).attempts()).isEqualTo(3);
    }

    @Test
    void aClassScopeOnlyCountsThatClass() {
        when(cohortRepository.findById(7L)).thenReturn(java.util.Optional.of(
                Cohort.builder().id(7L).courseId(9L).name("10B").joinCode("ABC123").build()));
        when(membershipRepository.findByCohortIdOrderByJoinedAtAsc(7L))
                .thenReturn(List.of(membership(7L, 12L)));
        when(progressRepository.findByModuleCourseIdAndUserIdIn(9L, List.of(12L)))
                .thenReturn(List.of(progress(12L, 101L, ProgressStatus.COMPLETED, 1,
                        "2026-03-01T10:00:00Z")));

        CourseAnalyticsDto result = service.course(9L, 7L, instructor);

        assertThat(result.cohortName()).isEqualTo("10B");
        assertThat(result.learners()).isEqualTo(1);
        assertThat(result.nodes().get(0).reached()).isEqualTo(1);
    }

    @Test
    void anEmptyClassReportsZeroesRatherThanFailing() {
        when(cohortRepository.findById(7L)).thenReturn(java.util.Optional.of(
                Cohort.builder().id(7L).courseId(9L).name("10C").joinCode("XYZ789").build()));
        when(membershipRepository.findByCohortIdOrderByJoinedAtAsc(7L)).thenReturn(List.of());

        CourseAnalyticsDto result = service.course(9L, 7L, instructor);

        assertThat(result.learners()).isZero();
        assertThat(result.nodes()).isEmpty();
        assertThat(result.dropOff()).isNull();
    }

    @Test
    void medianOfAnEvenCountIsTheMidpointOfTheTwoMiddleValues() {
        assertThat(AnalyticsService.median(List.of(1.0, 3.0, 2.0, 10.0))).isEqualTo(2.5);
        assertThat(AnalyticsService.median(List.of())).isNull();
    }

    private Course course(Long id) {
        Course value = new Course();
        value.setId(id);
        value.setTitle("Systems");
        return value;
    }

    private Enrollment enrollment(Long userId) {
        return Enrollment.builder().userId(userId).courseId(9L).build();
    }

    private CohortMembership membership(Long cohortId, Long userId) {
        return CohortMembership.builder().cohortId(cohortId).userId(userId).build();
    }

    private Module module(Long id, String title, int order) {
        Module value = new Module();
        value.setId(id);
        value.setTitle(title);
        value.setOrderIndex(order);
        value.setCourse(course);
        return value;
    }

    private UserModuleProgress progress(Long userId, Long moduleId, ProgressStatus status,
                                        int attempts, String completedAt) {
        User user = new User();
        user.setId(userId);
        return UserModuleProgress.builder()
                .user(user)
                .module(module(moduleId, "Node " + moduleId, 1))
                .status(status)
                .attempts(attempts)
                .completedAt(completedAt == null ? null : Instant.parse(completedAt))
                .build();
    }

    private ModuleAttempt attempt(Long userId, Long moduleId, String createdAt) {
        User user = new User();
        user.setId(userId);
        return ModuleAttempt.builder()
                .user(user)
                .module(module(moduleId, "Node " + moduleId, 1))
                .createdAt(Instant.parse(createdAt))
                .score(80)
                .passed(true)
                .build();
    }
}
