package com.questlearn.service;

import com.questlearn.dto.DeadlineDigestItem;
import com.questlearn.model.DeadlineReminder;
import com.questlearn.model.DeadlineState;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.ReminderKind;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.DeadlineReminderRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The daily deadline digest.
 *
 * <p>One email per learner, not one per node: a class of twenty dated nodes would
 * otherwise produce twenty messages a day. Only unfinished work inside the
 * reminder window is included, and every line is recorded in
 * {@code deadline_reminders} so rerunning the job cannot duplicate an inbox entry.</p>
 *
 * <p>It is opt-out per account ({@code users.notify_deadlines}) and off entirely
 * unless the deployment sets {@code NOTIFICATIONS_ENABLED=true}. Tests call
 * {@link #sendDueReminders()} directly, so the schedule itself stays out of the
 * test path.</p>
 */
@Service
public class DeadlineReminderService {

    private static final Logger log = LoggerFactory.getLogger(DeadlineReminderService.class);

    private final UserRepository userRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ModuleRepository moduleRepository;
    private final UserModuleProgressRepository progressRepository;
    private final DeadlineReminderRepository reminderRepository;
    private final MailService mailService;
    private final DeadlineStateResolver stateResolver;
    private final EffectiveDeadlines effectiveDeadlines;

    private final long retentionDays;

    public DeadlineReminderService(UserRepository userRepository,
                                   EnrollmentRepository enrollmentRepository,
                                   ModuleRepository moduleRepository,
                                   UserModuleProgressRepository progressRepository,
                                   DeadlineReminderRepository reminderRepository,
                                   MailService mailService,
                                   DeadlineStateResolver stateResolver,
                                   EffectiveDeadlines effectiveDeadlines,
                                   @Value("${questlearn.notifications.retention-days:120}") long retentionDays) {
        this.userRepository = userRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.moduleRepository = moduleRepository;
        this.progressRepository = progressRepository;
        this.reminderRepository = reminderRepository;
        this.mailService = mailService;
        this.stateResolver = stateResolver;
        this.effectiveDeadlines = effectiveDeadlines;
        this.retentionDays = Math.max(1, retentionDays);
    }

    /**
     * Sends every digest that is due now.
     *
     * <p>Returns counts so a scheduled run leaves an honest log line and a test can
     * assert what happened without reading the mailbox.</p>
     */
    @Transactional
    public ReminderRun sendDueReminders() {
        Instant now = Instant.now();
        reminderRepository.deleteBySentAtBefore(now.minus(Duration.ofDays(retentionDays)));

        int emailed = 0;
        int recorded = 0;
        for (User learner : userRepository.findByRoleAndNotifyDeadlinesTrue(Role.STUDENT)) {
            List<Enrollment> enrollments =
                    enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(learner.getId());
            if (enrollments.isEmpty()) {
                continue;
            }

            Set<Long> courseIds = enrollments.stream()
                    .map(Enrollment::getCourseId)
                    .collect(Collectors.toSet());
            // The digest reads the same effective date as the dashboard, so a
            // class override moves the email as well as the panel.
            Map<Long, Instant> overrides =
                    effectiveDeadlines.overridesFor(learner.getId(), courseIds);
            List<Module> relevant = moduleRepository.findByCourseIdIn(courseIds)
                    .stream()
                    .filter(module -> module.getCourse().isPublished())
                    .filter(module -> module.getCourse().getArchivedAt() == null)
                    .filter(module -> {
                        Instant dueAt = effectiveDeadlines.dueAt(module, overrides);
                        DeadlineState state = stateResolver.resolve(dueAt, null, now);
                        return state == DeadlineState.DUE_SOON || state == DeadlineState.OVERDUE;
                    })
                    .sorted(Comparator.comparing(module -> effectiveDeadlines.dueAt(module, overrides)))
                    .toList();
            if (relevant.isEmpty()) {
                continue;
            }

            Map<Long, Instant> completedAt = new HashMap<>();
            for (UserModuleProgress row : progressRepository.findByUserId(learner.getId())) {
                if (row.getCompletedAt() != null) {
                    completedAt.put(row.getModule().getId(), row.getCompletedAt());
                }
            }

            Set<ReminderKey> alreadySent = new HashSet<>();
            for (DeadlineReminder row : reminderRepository
                    .findByUserIdAndSentAtAfter(learner.getId(), now.minus(Duration.ofDays(retentionDays)))) {
                alreadySent.add(new ReminderKey(row.getModule().getId(), row.getKind(), row.getDueAt()));
            }

            List<DeadlineDigestItem> fresh = new ArrayList<>();
            List<Reminder> pending = new ArrayList<>();
            for (Module module : relevant) {
                if (completedAt.containsKey(module.getId())) {
                    continue;
                }
                Instant dueAt = effectiveDeadlines.dueAt(module, overrides);
                ReminderKind kind = stateResolver.resolve(dueAt, null, now)
                        == DeadlineState.OVERDUE ? ReminderKind.OVERDUE : ReminderKind.DUE_SOON;
                if (alreadySent.contains(new ReminderKey(module.getId(), kind, dueAt))) {
                    continue;
                }

                fresh.add(new DeadlineDigestItem(
                        module.getCourse().getId(),
                        module.getCourse().getTitle(),
                        module.getTitle(),
                        dueAt,
                        kind == ReminderKind.OVERDUE));
                pending.add(new Reminder(module, kind, dueAt));
            }

            if (fresh.isEmpty()) {
                continue;
            }
            // Overdue first: the point of the digest is what needs action now.
            fresh.sort(Comparator
                    .comparing(DeadlineDigestItem::overdue)
                    .reversed()
                    .thenComparing(DeadlineDigestItem::dueAt));

            if (!mailService.sendDeadlineDigest(learner, fresh)) {
                // Leave the rows unrecorded so tomorrow's run tries again.
                log.warn("Deadline digest for {} could not be delivered; will retry.",
                        learner.getEmail());
                continue;
            }

            for (Reminder reminder : pending) {
                reminderRepository.save(DeadlineReminder.builder()
                        .user(learner)
                        .module(reminder.module())
                        .kind(reminder.kind())
                        .dueAt(reminder.dueAt())
                        .sentAt(now)
                        .build());
                recorded++;
            }
            emailed++;
        }

        return new ReminderRun(emailed, recorded);
    }

    /** What one run did; a record so the log line cannot drift from the tests. */
    public record ReminderRun(int learnersEmailed, int remindersRecorded) {
    }

    private record Reminder(Module module, ReminderKind kind, Instant dueAt) {
    }

    private record ReminderKey(Long moduleId, ReminderKind kind, Instant dueAt) {
    }
}
