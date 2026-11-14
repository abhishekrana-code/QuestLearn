package com.questlearn.config;

import com.questlearn.service.DeadlineReminderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs the deadline digest once a day, only when the deployment asks for it.
 *
 * <p>Disabled by default so a local demo never writes a digest into the log every
 * morning, and so enabling mail is an explicit operational decision. The cron is
 * UTC; a school can set {@code NOTIFICATIONS_CRON} to its own morning.</p>
 */
@Component
@ConditionalOnProperty(name = "questlearn.notifications.enabled", havingValue = "true")
public class DeadlineReminderJob {

    private static final Logger log = LoggerFactory.getLogger(DeadlineReminderJob.class);

    private final DeadlineReminderService reminderService;

    public DeadlineReminderJob(DeadlineReminderService reminderService) {
        this.reminderService = reminderService;
    }

    @Scheduled(cron = "${questlearn.notifications.cron:0 0 7 * * *}", zone = "UTC")
    public void run() {
        try {
            DeadlineReminderService.ReminderRun run = reminderService.sendDueReminders();
            log.info("Deadline digest run: {} learner(s) emailed, {} reminder(s) recorded.",
                    run.learnersEmailed(), run.remindersRecorded());
        } catch (RuntimeException ex) {
            // A scheduled exception would otherwise disappear into the scheduler log.
            log.error("Deadline digest run failed: {}", ex.getMessage(), ex);
        }
    }
}
