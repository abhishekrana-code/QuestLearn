package com.questlearn.service;

import com.questlearn.model.DeadlineState;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * One clock for every deadline display.
 *
 * <p>The dashboard, the skill tree, the node briefing and the reminder digest all
 * call this, so "due soon" means the same thing in all four places. The window is
 * configurable because a two-week project and a nightly reading task do not want
 * the same warning lead time.</p>
 */
@Component
public class DeadlineStateResolver {

    private final Duration dueSoonWindow;

    public DeadlineStateResolver(
            @Value("${questlearn.notifications.due-soon-days:7}") long dueSoonDays) {
        this.dueSoonWindow = Duration.ofDays(Math.max(1, dueSoonDays));
    }

    public Duration dueSoonWindow() {
        return dueSoonWindow;
    }

    /**
     * @param completedAt when the learner cleared the node, or null if they have not
     * @return null when the node has no deadline
     */
    public DeadlineState resolve(Instant dueAt, Instant completedAt) {
        return resolve(dueAt, completedAt, Instant.now());
    }

    DeadlineState resolve(Instant dueAt, Instant completedAt, Instant now) {
        if (dueAt == null) {
            return null;
        }
        if (completedAt != null) {
            return completedAt.isAfter(dueAt)
                    ? DeadlineState.COMPLETED_LATE
                    : DeadlineState.COMPLETED;
        }
        if (!now.isBefore(dueAt)) {
            return DeadlineState.OVERDUE;
        }
        return dueAt.isAfter(now.plus(dueSoonWindow))
                ? DeadlineState.UPCOMING
                : DeadlineState.DUE_SOON;
    }
}
