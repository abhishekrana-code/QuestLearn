package com.questlearn.service;

import com.questlearn.dto.DeadlineDigestItem;
import com.questlearn.email.EmailMessage;
import com.questlearn.email.EmailSender;
import com.questlearn.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InterruptedIOException;
import java.net.SocketException;
import java.net.UnknownHostException;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * The one place that writes and sends QuestLearn's transactional email.
 *
 * <p>Password recovery and address verification share it, so both links use the
 * same from-address, origin and delivery path. A provider failure is logged and
 * reported through the return value rather than thrown, so a mail outage never
 * breaks the request that triggered it: sign-up carries on, while an explicit
 * resend can tell the learner the link was not sent. A failure that looks
 * transient — the host did not resolve, a connection was refused or reset, or a
 * connect/read timed out — is retried once after a short pause, so a brief network
 * hiccup does not lose the link. An unconfigured deployment writes the message to
 * the server log instead.</p>
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    /**
     * One retry rides out the failure seen on this machine: a DNS lookup that
     * briefly stopped resolving. Two attempts with a short pause stay inside a
     * request the browser is still waiting on, while a third would not buy more.
     */
    private static final int MAX_ATTEMPTS = 2;
    private static final long RETRY_PAUSE_MS = 500;

    private final EmailSender sender;
    private final String fromAddress;
    private final String appBaseUrl;

    public MailService(EmailSender sender,
                       @Value("${questlearn.email.from:no-reply@questlearn.dev}") String fromAddress,
                       @Value("${questlearn.auth.app-base-url:http://localhost:5173}") String appBaseUrl) {
        this.sender = sender;
        this.fromAddress = fromAddress;
        this.appBaseUrl = appBaseUrl.replaceAll("/+$", "");
    }

    public boolean isDeliveryConfigured() {
        return sender.isDeliveryConfigured();
    }

    public void sendPasswordReset(User user, String rawToken, Duration ttl) {
        String link = appBaseUrl + "/reset-password?token=" + rawToken;
        sendQuietly(user,
                "Reset your QuestLearn password",
                """
                Hi %s,

                Someone asked to reset the password for this QuestLearn account.
                Open this link to choose a new one:

                %s

                The link works once and expires in %d minutes. If this was not you,
                ignore this email - your password stays as it is.

                QuestLearn
                """.formatted(user.getName(), link, ttl.toMinutes()),
                htmlLink(user, link, "Choose a new password",
                        "This link works once and expires in " + ttl.toMinutes() + " minutes."));
    }

    /**
     * @return whether the transport accepted the message. Sign-up ignores this so
     *         a mail outage cannot fail account creation; an explicit resend uses
     *         it to report the failure instead of claiming a link was sent.
     */
    public boolean sendEmailVerification(User user, String rawToken, Duration ttl) {
        String link = appBaseUrl + "/verify-email?token=" + rawToken;
        return sendQuietly(user,
                "Confirm your QuestLearn email address",
                """
                Hi %s,

                Confirm this address for your QuestLearn account by opening:

                %s

                The link works once and expires in %d hours. Until it is confirmed,
                QuestLearn shows a reminder on your dashboard, but nothing you have
                done is affected.

                QuestLearn
                """.formatted(user.getName(), link, Math.max(1, ttl.toHours())),
                htmlLink(user, link, "Confirm this address",
                        "The link works once and expires in "
                                + Math.max(1, ttl.toHours()) + " hours."));
    }

    /**
     * Sends the daily list of soon-or-overdue nodes.
     *
     * <p>Returns false when the transport failed, so the caller can leave the
     * reminder unrecorded and try again on the next run. The log fallback counts
     * as delivered: on a demo machine the digest is simply written to the server
     * log like every other message.</p>
     */
    public boolean sendDeadlineDigest(User user, List<DeadlineDigestItem> items) {
        if (items.isEmpty()) {
            return true;
        }
        long overdue = items.stream().filter(DeadlineDigestItem::overdue).count();
        String subject = overdue > 0
                ? overdue + (overdue == 1 ? " overdue task" : " overdue tasks")
                        + " and " + items.size() + " deadline" + (items.size() == 1 ? "" : "s")
                        + " in QuestLearn"
                : items.size() + " deadline" + (items.size() == 1 ? "" : "s")
                        + " coming up in QuestLearn";

        StringBuilder text = new StringBuilder();
        text.append("Hi ").append(user.getName()).append(",\n\n")
                .append("Here is what needs your attention in QuestLearn:\n\n");
        for (DeadlineDigestItem item : items) {
            text.append(item.overdue() ? "[OVERDUE] " : "[DUE SOON] ")
                    .append(item.courseTitle()).append(" - ").append(item.moduleTitle())
                    .append("\n           due ").append(formatDue(item.dueAt()))
                    .append("\n           ").append(appBaseUrl).append("/courses/")
                    .append(item.courseId()).append("\n\n");
        }
        text.append("You can turn these reminders off from the deadline panel on your ")
                .append("QuestLearn dashboard.\n\nQuestLearn\n");

        StringBuilder html = new StringBuilder();
        html.append("<p>Hi ").append(escape(user.getName())).append(",</p>")
                .append("<p>Here is what needs your attention in QuestLearn:</p><ul>");
        for (DeadlineDigestItem item : items) {
            html.append("<li><strong>")
                    .append(item.overdue() ? "Overdue: " : "Due soon: ")
                    .append(escape(item.courseTitle())).append(" - ")
                    .append(escape(item.moduleTitle())).append("</strong><br>")
                    .append("due ").append(escape(formatDue(item.dueAt()))).append(" &middot; ")
                    .append("<a href=\"").append(appBaseUrl).append("/courses/")
                    .append(item.courseId()).append("\">Open the course</a></li>");
        }
        html.append("</ul><p style=\"color:#666;font-size:13px\">You can turn these reminders off ")
                .append("from the deadline panel on your QuestLearn dashboard.</p><p>QuestLearn</p>");

        return sendQuietly(user, subject, text.toString(), html.toString());
    }

    private static String formatDue(java.time.Instant dueAt) {
        return DateTimeFormatter.ofPattern("EEE d MMM yyyy, HH:mm 'UTC'")
                .withZone(ZoneOffset.UTC)
                .format(dueAt);
    }

    private boolean sendQuietly(User user, String subject, String text, String html) {
        EmailMessage message = new EmailMessage(fromAddress, user.getEmail(), subject, text, html);
        RuntimeException failure = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                sender.send(message);
                if (sender.isDeliveryConfigured()) {
                    log.info("Email '{}' sent to {}.", subject, user.getEmail());
                }
                return true;
            } catch (RuntimeException ex) {
                failure = ex;
                if (attempt == MAX_ATTEMPTS || !isTransient(ex)) {
                    break;
                }
                log.warn("Email '{}' to {} failed ({}); retrying once.",
                        subject, user.getEmail(), ex.getMessage());
                if (!pauseBeforeRetry()) {
                    break;
                }
            }
        }

        // Never surface delivery problems to the caller: an anonymous reset
        // request must not learn whether an address exists or a provider is down.
        log.error("Could not send '{}' to {}: {}", subject, user.getEmail(),
                failure == null ? "unknown transport failure" : failure.getMessage());
        return false;
    }

    private static boolean pauseBeforeRetry() {
        try {
            Thread.sleep(RETRY_PAUSE_MS);
            return true;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * True for failures that say the message never reached the server: the host
     * did not resolve, the port refused or reset the connection, or a connect or
     * read timed out. Authentication and provider rejections are excluded, because
     * sending the same credentials again cannot help and a retry only spends quota.
     *
     * <p>JavaMail wraps the real network error, so the whole cause chain is walked.</p>
     */
    private static boolean isTransient(Throwable failure) {
        Throwable cause = failure;
        for (int depth = 0; cause != null && depth < 12; depth++) {
            if (cause instanceof UnknownHostException
                    || cause instanceof SocketException
                    || cause instanceof InterruptedIOException) {
                return true;
            }
            if (cause.getCause() == cause) {
                break;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private String htmlLink(User user, String link, String label, String note) {
        return """
                <p>Hi %s,</p>
                <p><a href="%s">%s</a></p>
                <p style="color:#666;font-size:13px">%s</p>
                <p style="color:#666;font-size:13px">If this was not you, ignore this email.</p>
                <p>QuestLearn</p>
                """.formatted(escape(user.getName()), link, label, note);
    }

    private static String escape(String value) {
        return value == null ? "" : value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
