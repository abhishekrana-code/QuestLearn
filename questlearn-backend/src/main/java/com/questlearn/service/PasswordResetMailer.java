package com.questlearn.service;

import com.questlearn.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Delivers the reset link.
 *
 * <p>There is no mail transport on a local deployment yet, so this is honest about
 * it: with {@code MAIL_HOST} blank the link is written to the server log (at WARN,
 * because it is a live credential) and the request still answers the same generic
 * message. Set {@code MAIL_HOST}, {@code MAIL_PORT}, {@code MAIL_USERNAME},
 * {@code MAIL_PASSWORD} and {@code MAIL_FROM} to turn it into real email.</p>
 *
 * <p>A transport failure is logged, never surfaced: the endpoint must not tell an
 * anonymous caller whether an address exists, and must not break when SMTP is
 * down.</p>
 */
@Component
public class PasswordResetMailer {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetMailer.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final String mailHost;
    private final String fromAddress;
    private final String appBaseUrl;

    public PasswordResetMailer(ObjectProvider<JavaMailSender> mailSenderProvider,
                               @Value("${spring.mail.host:}") String mailHost,
                               @Value("${questlearn.auth.mail-from:no-reply@questlearn.dev}") String fromAddress,
                               @Value("${questlearn.auth.app-base-url:http://localhost:5173}") String appBaseUrl) {
        this.mailSenderProvider = mailSenderProvider;
        this.mailHost = mailHost == null ? "" : mailHost.trim();
        this.fromAddress = fromAddress;
        this.appBaseUrl = appBaseUrl.replaceAll("/+$", "");
    }

    /** True when the deployment can actually send mail, used by the health of the docs. */
    public boolean isMailConfigured() {
        return !mailHost.isEmpty();
    }

    public void send(User user, String rawToken, Duration ttl) {
        String link = appBaseUrl + "/reset-password?token=" + rawToken;
        if (!isMailConfigured()) {
            log.warn("No mail transport configured (MAIL_HOST is empty). "
                            + "Password reset link for {}: {} (valid for {} minutes, single use).",
                    user.getEmail(), link, ttl.toMinutes());
            return;
        }

        JavaMailSender sender = mailSenderProvider.getIfAvailable();
        if (sender == null) {
            log.error("MAIL_HOST is set but no mail sender was configured; "
                    + "the reset link for {} could not be sent.", user.getEmail());
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(user.getEmail());
        message.setSubject("Reset your QuestLearn password");
        message.setText("""
                Hi %s,

                Someone asked to reset the password for this QuestLearn account.
                Open this link to choose a new one:

                %s

                The link works once and expires in %d minutes. If this was not you,
                ignore this email - your password stays as it is.

                QuestLearn
                """.formatted(user.getName(), link, ttl.toMinutes()));

        try {
            sender.send(message);
            log.info("Password reset link emailed to {}.", user.getEmail());
        } catch (MailException ex) {
            log.error("Could not send the password reset email to {}: {}",
                    user.getEmail(), ex.getMessage());
        }
    }
}
