package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.exception.ApiException;
import com.questlearn.model.EmailVerificationToken;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.EmailVerificationTokenRepository;
import com.questlearn.repository.UserRepository;
import com.questlearn.security.OneTimeTokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailVerificationServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final EmailVerificationTokenRepository tokenRepository =
            mock(EmailVerificationTokenRepository.class);
    private final MailService mailService = mock(MailService.class);

    private EmailVerificationService service;

    @BeforeEach
    void setUp() {
        service = new EmailVerificationService(userRepository, tokenRepository, mailService, 48, 3);
    }

    @Test
    void issuingStoresOnlyTheHashAndMailsTheRawToken() {
        User user = user(7L, "verify@questlearn.dev");

        service.issue(user);

        verify(tokenRepository).invalidateAllForUser(eq(7L), any(Instant.class));

        ArgumentCaptor<EmailVerificationToken> saved =
                ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository).save(saved.capture());

        ArgumentCaptor<String> raw = ArgumentCaptor.forClass(String.class);
        verify(mailService).sendEmailVerification(eq(user), raw.capture(), eq(Duration.ofHours(48)));

        assertEquals(OneTimeTokens.sha256(raw.getValue()), saved.getValue().getTokenHash());
        assertNotEquals(raw.getValue(), saved.getValue().getTokenHash());
        assertTrue(saved.getValue().getExpiresAt().isAfter(saved.getValue().getCreatedAt()));
    }

    @Test
    void aValidTokenMarksTheAccountVerified() {
        User user = user(7L, "verify@questlearn.dev");
        EmailVerificationToken token = token(user);
        when(tokenRepository.findByTokenHash(OneTimeTokens.sha256("raw-token")))
                .thenReturn(Optional.of(token));
        when(tokenRepository.claim(eq(1L), any(Instant.class))).thenReturn(1);

        service.verify("raw-token");

        assertTrue(user.isEmailVerified());
        verify(userRepository).save(user);
        verify(tokenRepository).invalidateAllForUser(eq(7L), any(Instant.class));
    }

    @Test
    void aUsedTokenIsRefused() {
        User user = user(7L, "verify@questlearn.dev");
        EmailVerificationToken token = token(user);
        token.setUsedAt(Instant.now().minusSeconds(5));
        when(tokenRepository.findByTokenHash(OneTimeTokens.sha256("raw-token")))
                .thenReturn(Optional.of(token));

        ApiException error = assertThrows(ApiException.class, () -> service.verify("raw-token"));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        assertFalse(user.isEmailVerified());
        verify(tokenRepository, never()).claim(any(), any());
    }

    @Test
    void anExpiredTokenIsRefused() {
        User user = user(7L, "verify@questlearn.dev");
        EmailVerificationToken token = token(user);
        token.setExpiresAt(Instant.now().minusSeconds(5));
        when(tokenRepository.findByTokenHash(OneTimeTokens.sha256("raw-token")))
                .thenReturn(Optional.of(token));

        ApiException error = assertThrows(ApiException.class, () -> service.verify("raw-token"));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void losingTheClaimRaceDoesNotVerifyTheAccount() {
        User user = user(7L, "verify@questlearn.dev");
        EmailVerificationToken token = token(user);
        when(tokenRepository.findByTokenHash(OneTimeTokens.sha256("raw-token")))
                .thenReturn(Optional.of(token));
        // Another request claimed the row first.
        when(tokenRepository.claim(eq(1L), any(Instant.class))).thenReturn(0);

        assertThrows(ApiException.class, () -> service.verify("raw-token"));

        assertFalse(user.isEmailVerified());
        verify(userRepository, never()).save(any());
    }

    @Test
    void aConfirmedAccountCannotResend() {
        User user = user(7L, "verify@questlearn.dev");
        user.setEmailVerified(true);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));

        ApiException error = assertThrows(ApiException.class,
                () -> service.resend(new AppUserPrincipal(7L, user.getEmail(), Role.STUDENT)));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(mailService, never()).sendEmailVerification(any(), any(), any());
    }

    @Test
    void resendsAreThrottledPerAddress() {
        User user = user(7L, "verify@questlearn.dev");
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        AppUserPrincipal principal =
                new AppUserPrincipal(7L, user.getEmail(), Role.STUDENT);

        for (int attempt = 1; attempt <= 3; attempt++) {
            service.resend(principal);
        }

        ApiException error = assertThrows(ApiException.class, () -> service.resend(principal));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, error.getStatus());
        verify(mailService, times(3)).sendEmailVerification(any(), any(), any());
    }

    private static User user(Long id, String email) {
        return User.builder()
                .id(id)
                .name("Verify Me")
                .email(email)
                .passwordHash("hash")
                .role(Role.STUDENT)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .emailVerified(false)
                .build();
    }

    private static EmailVerificationToken token(User user) {
        return EmailVerificationToken.builder()
                .id(1L)
                .user(user)
                .tokenHash(OneTimeTokens.sha256("raw-token"))
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plus(Duration.ofHours(48)))
                .build();
    }
}
