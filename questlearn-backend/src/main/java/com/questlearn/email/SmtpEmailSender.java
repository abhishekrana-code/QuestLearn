package com.questlearn.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;

/**
 * Sends over SMTP, for schools that already have a mail server and would rather
 * not hand a third party their address list.
 */
public class SmtpEmailSender implements EmailSender {

    private final JavaMailSender mailSender;

    public SmtpEmailSender(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Override
    public void send(EmailMessage message) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setFrom(message.from());
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            // Both parts go out: clients that block HTML still show the link.
            helper.setText(message.text(), message.html());
            mailSender.send(mime);
        } catch (MessagingException | RuntimeException ex) {
            throw new EmailDeliveryException(
                    "SMTP could not deliver to " + message.to() + ": " + ex.getMessage(), ex);
        }
    }

    @Override
    public boolean isDeliveryConfigured() {
        return true;
    }
}
