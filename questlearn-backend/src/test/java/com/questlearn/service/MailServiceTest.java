package com.questlearn.service;

import com.questlearn.email.EmailSender;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import jakarta.mail.AuthenticationFailedException;
import org.junit.jupiter.api.Test;

import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MailServiceTest {

    private final EmailSender sender = mock(EmailSender.class);
    private final MailService service =
            new MailService(sender, "no-reply@questlearn.dev", "http://localhost:5173");

    @Test
    void aDnsFailureIsRetriedOnceAndCanStillDeliver() {
        when(sender.isDeliveryConfigured()).thenReturn(true);
        doThrow(transientFailure(new UnknownHostException("smtp.gmail.com")))
                .doNothing()
                .when(sender).send(any());

        assertTrue(service.sendEmailVerification(user(), "raw-token", Duration.ofHours(48)));
        verify(sender, times(2)).send(any());
    }

    @Test
    void aReadTimeoutIsRetriedOnce() {
        when(sender.isDeliveryConfigured()).thenReturn(true);
        doThrow(transientFailure(new SocketTimeoutException("Read timed out")))
                .doNothing()
                .when(sender).send(any());

        assertTrue(service.sendEmailVerification(user(), "raw-token", Duration.ofHours(48)));
        verify(sender, times(2)).send(any());
    }

    @Test
    void aFailureOnBothAttemptsIsReportedOnceAndReturnsFalse() {
        when(sender.isDeliveryConfigured()).thenReturn(true);
        doThrow(transientFailure(new UnknownHostException("smtp.gmail.com")))
                .when(sender).send(any());

        assertFalse(service.sendEmailVerification(user(), "raw-token", Duration.ofHours(48)));
        verify(sender, times(2)).send(any());
    }

    @Test
    void rejectedCredentialsAreNotRetried() {
        when(sender.isDeliveryConfigured()).thenReturn(true);
        doThrow(new EmailSender.EmailDeliveryException(
                "SMTP rejected the login", new AuthenticationFailedException("535 authentication failed")))
                .when(sender).send(any());

        assertFalse(service.sendEmailVerification(user(), "raw-token", Duration.ofHours(48)));
        verify(sender, times(1)).send(any());
    }

    @Test
    void theLogFallbackCountsAsDeliveredAndNeverRetries() {
        when(sender.isDeliveryConfigured()).thenReturn(false);

        assertTrue(service.sendEmailVerification(user(), "raw-token", Duration.ofHours(48)));
        verify(sender, times(1)).send(any());
    }

    private static EmailSender.EmailDeliveryException transientFailure(Throwable cause) {
        return new EmailSender.EmailDeliveryException("SMTP could not deliver: " + cause.getMessage(), cause);
    }

    private static User user() {
        return User.builder()
                .id(7L)
                .name("Verify Me")
                .email("verify@questlearn.dev")
                .passwordHash("hash")
                .role(Role.STUDENT)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .emailVerified(false)
                .build();
    }
}
