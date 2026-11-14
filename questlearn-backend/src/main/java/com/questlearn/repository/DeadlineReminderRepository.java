package com.questlearn.repository;

import com.questlearn.model.DeadlineReminder;
import com.questlearn.model.ReminderKind;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface DeadlineReminderRepository extends JpaRepository<DeadlineReminder, Long> {

    boolean existsByUserIdAndModuleIdAndKindAndDueAt(
            Long userId, Long moduleId, ReminderKind kind, Instant dueAt);

    List<DeadlineReminder> findByUserIdAndSentAtAfter(Long userId, Instant cutoff);

    /** Old ledger rows are only useful while a deadline can still be moved back. */
    long deleteBySentAtBefore(Instant cutoff);
}
