package com.questlearn.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The fallback when no transport is configured.
 *
 * <p>It writes the whole message, link included, at WARN: on a demo machine or a
 * school without SMTP this is how the reset link reaches a human. It is loud on
 * purpose, because the body is a live credential.</p>
 */
public class LogEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LogEmailSender.class);

    @Override
    public void send(EmailMessage message) {
        log.warn("""

                ---------- email not sent: no provider configured ----------
                to:      {}
                subject: {}
                {}
                -------------------------------------------------------------
                Set RESEND_API_KEY (or MAIL_HOST) to deliver this by email.
                """, message.to(), message.subject(), message.text());
    }

    @Override
    public boolean isDeliveryConfigured() {
        return false;
    }
}
