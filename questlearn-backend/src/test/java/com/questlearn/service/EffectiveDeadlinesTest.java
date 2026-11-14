package com.questlearn.service;

import com.questlearn.model.Cohort;
import com.questlearn.model.CohortDeadline;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Module;
import com.questlearn.repository.CohortDeadlineRepository;
import com.questlearn.repository.CohortMembershipRepository;
import com.questlearn.repository.CohortRepository;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EffectiveDeadlinesTest {

    private final CohortRepository cohortRepository = mock(CohortRepository.class);
    private final CohortMembershipRepository membershipRepository = mock(CohortMembershipRepository.class);
    private final CohortDeadlineRepository deadlineRepository = mock(CohortDeadlineRepository.class);
    private final EffectiveDeadlines service =
            new EffectiveDeadlines(cohortRepository, membershipRepository, deadlineRepository);

    private final Instant courseDate = Instant.parse("2026-12-01T12:00:00Z");

    @BeforeEach
    void noOverridesByDefault() {
        when(deadlineRepository.findByCohortIdIn(any())).thenReturn(List.of());
        when(membershipRepository.findByUserIdAndCohortIdIn(any(), any())).thenReturn(List.of());
        when(cohortRepository.findByCourseIdIn(any())).thenReturn(List.of());
    }

    @Test
    void aNodeWithoutAClassOverrideKeepsTheCourseDate() {
        Module module = module(7L);

        assertThat(service.dueAt(module, Map.of())).isEqualTo(courseDate);
    }

    @Test
    void theClassDateWinsOverTheCourseDate() {
        Instant classDate = Instant.parse("2026-11-20T12:00:00Z");
        Module module = module(7L);

        assertThat(service.dueAt(module, Map.of(7L, classDate))).isEqualTo(classDate);
    }

    @Test
    void onlyTheLearnersOwnClassesAreRead() {
        when(cohortRepository.findByCourseIdIn(List.of(1L))).thenReturn(List.of(
                cohort(10L), cohort(11L)));
        when(membershipRepository.findByUserIdAndCohortIdIn(any(), any())).thenReturn(List.of(
                membership(10L)));
        when(deadlineRepository.findByCohortIdIn(any())).thenReturn(List.of(
                deadline(10L, 7L, "2026-11-20T12:00:00Z")));

        Map<Long, Instant> overrides = service.overridesFor(5L, List.of(1L));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<Long>> asked = ArgumentCaptor.forClass(Collection.class);
        verify(deadlineRepository).findByCohortIdIn(asked.capture());
        assertThat(asked.getValue()).containsExactly(10L);
        assertThat(overrides).containsOnlyKeys(7L);
        assertThat(overrides.get(7L)).isEqualTo(Instant.parse("2026-11-20T12:00:00Z"));
    }

    @Test
    void twoClassesOnOneNodeTakeTheEarlierDate() {
        when(cohortRepository.findByCourseIdIn(List.of(1L))).thenReturn(List.of(
                cohort(10L), cohort(11L)));
        when(membershipRepository.findByUserIdAndCohortIdIn(any(), any())).thenReturn(List.of(
                membership(10L), membership(11L)));
        when(deadlineRepository.findByCohortIdIn(any())).thenReturn(List.of(
                deadline(10L, 7L, "2026-11-20T12:00:00Z"),
                deadline(11L, 7L, "2026-11-05T12:00:00Z")));

        assertThat(service.overridesFor(5L, List.of(1L)).get(7L))
                .isEqualTo(Instant.parse("2026-11-05T12:00:00Z"));
    }

    @Test
    void aLearnerInNoClassHasNoOverrides() {
        when(cohortRepository.findByCourseIdIn(List.of(1L))).thenReturn(List.of(cohort(10L)));
        when(membershipRepository.findByUserIdAndCohortIdIn(any(), any())).thenReturn(List.of());

        assertThat(service.overridesFor(5L, List.of(1L))).isEmpty();
    }

    @Test
    void anEmptyCourseListShortCircuits() {
        assertThat(service.overridesFor(5L, List.of())).isEmpty();
    }

    private Module module(Long id) {
        Module module = new Module();
        module.setId(id);
        module.setDueAt(courseDate);
        return module;
    }

    private Cohort cohort(Long id) {
        return Cohort.builder().id(id).courseId(1L).name("Class " + id).joinCode("CODE" + id).build();
    }

    private CohortMembership membership(Long cohortId) {
        return CohortMembership.builder().cohortId(cohortId).userId(5L).build();
    }

    private CohortDeadline deadline(Long cohortId, Long moduleId, String dueAt) {
        return CohortDeadline.builder()
                .cohortId(cohortId)
                .moduleId(moduleId)
                .dueAt(Instant.parse(dueAt))
                .build();
    }
}
