package com.questlearn.service;

import com.questlearn.model.DeadlineState;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The one clock used by the dashboard, the skill tree, the briefing and the
 * digest. Boundaries matter here: a state that disagrees with the email is a
 * support ticket.
 */
class DeadlineStateResolverTest {

    private static final Instant NOW = Instant.parse("2026-05-01T09:00:00Z");
    private final DeadlineStateResolver resolver = new DeadlineStateResolver(7);

    @Test
    void anUndatedNodeHasNoDeadlineState() {
        assertThat(resolver.resolve(null, null, NOW)).isNull();
    }

    @Test
    void workBeyondTheWindowIsUpcoming() {
        assertThat(resolver.resolve(NOW.plus(Duration.ofDays(8)), null, NOW))
                .isEqualTo(DeadlineState.UPCOMING);
    }

    @Test
    void theWindowEdgeItselfIsDueSoon() {
        assertThat(resolver.resolve(NOW.plus(Duration.ofDays(7)), null, NOW))
                .isEqualTo(DeadlineState.DUE_SOON);
    }

    @Test
    void workInsideTheWindowIsDueSoon() {
        assertThat(resolver.resolve(NOW.plus(Duration.ofHours(1)), null, NOW))
                .isEqualTo(DeadlineState.DUE_SOON);
    }

    @Test
    void theDueInstantItselfIsOverdue() {
        assertThat(resolver.resolve(NOW, null, NOW)).isEqualTo(DeadlineState.OVERDUE);
        assertThat(resolver.resolve(NOW.minusSeconds(1), null, NOW))
                .isEqualTo(DeadlineState.OVERDUE);
    }

    @Test
    void finishingInTimeIsComplete() {
        assertThat(resolver.resolve(NOW.plus(Duration.ofDays(1)), NOW, NOW))
                .isEqualTo(DeadlineState.COMPLETED);
    }

    @Test
    void finishingAfterTheDeadlineIsLate() {
        assertThat(resolver.resolve(NOW, NOW.plusSeconds(1), NOW))
                .isEqualTo(DeadlineState.COMPLETED_LATE);
        // Completion wins over "overdue": the work is done, just late.
        assertThat(resolver.resolve(NOW.minus(Duration.ofDays(3)), NOW, NOW))
                .isEqualTo(DeadlineState.COMPLETED_LATE);
    }

    @Test
    void theWarningWindowCannotBeShorterThanADay() {
        assertThat(new DeadlineStateResolver(0).dueSoonWindow())
                .isEqualTo(Duration.ofDays(1));
        assertThat(new DeadlineStateResolver(-5).dueSoonWindow())
                .isEqualTo(Duration.ofDays(1));
    }
}
