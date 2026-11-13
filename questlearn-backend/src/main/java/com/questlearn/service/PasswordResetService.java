package com.questlearn.service;

import com.questlearn.exception.ApiException;
import com.questlearn.model.PasswordResetToken;
import com.questlearn.model.User;
import com.questlearn.repository.PasswordResetTokenRepository;
import com.questlearn.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Self-service password recovery.
 *
 * <p>Requesting a reset never says whether the address exists: the endpoint always
 * answers the same 202, and only a real account gets a token and an email. The
 * token itself is 32 random bytes, handed out once and stored only as a SHA-256
 * hash; {@code used_at} makes it single-use and {@code expires_at} bounds its life.
 * Issuing a new link kills every earlier unused link for that account.</p>
 *
 * <p>Redeeming a token bumps the account's token version, so any session that was
 * open before the reset is signed out.</p>
 */
@Service
public class PasswordResetService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailer mailer;
    private final LoginAttemptService loginAttemptService;
    private final Duration tokenTtl;
    private final int maxRequestsPerHour;

    /** Recent requests per email, so one address cannot be used to spam an inbox. */
    private final Map<String, Deque<Instant>> recentRequests = new ConcurrentHashMap<>();

    public PasswordResetService(UserRepository userRepository,
                                PasswordResetTokenRepository tokenRepository,
                                PasswordEncoder passwordEncoder,
                                PasswordResetMailer mailer,
                                LoginAttemptService loginAttemptService,
                                @Value("${questlearn.auth.reset-token-minutes:30}") long tokenTtlMinutes,
                                @Value("${questlearn.auth.reset-max-per-hour:3}") int maxRequestsPerHour) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailer = mailer;
        this.loginAttemptService = loginAttemptService;
        this.tokenTtl = Duration.ofMinutes(Math.max(1, tokenTtlMinutes));
        this.maxRequestsPerHour = Math.max(1, maxRequestsPerHour);
    }

    public long tokenTtlMinutes() {
        return tokenTtl.toMinutes();
    }

    /**
     * Starts a reset. Answers nothing about whether the email is registered.
     */
    @Transactional
    public void request(String email) {
        String normalised = email.trim().toLowerCase(Locale.ROOT);
        if (!allowRequest(normalised)) {
            throw ApiException.tooManyRequests(
                    "Too many reset requests for this email. Try again in an hour.");
        }

        userRepository.findByEmailIgnoreCase(normalised).ifPresent(user -> {
            Instant now = Instant.now();
            // A new link supersedes any older one, so a forwarded email stops working.
            tokenRepository.invalidateAllForUser(user.getId(), now);

            String rawToken = newToken();
            tokenRepository.save(PasswordResetToken.builder()
                    .user(user)
                    .tokenHash(hash(rawToken))
                    .createdAt(now)
                    .expiresAt(now.plus(tokenTtl))
                    .build());

            mailer.send(user, rawToken, tokenTtl);
        });
    }

    /**
     * Redeems a token and sets the new password.
     */
    @Transactional
    public void confirm(String rawToken, String newPassword) {
        Instant now = Instant.now();
        PasswordResetToken token = tokenRepository.findByTokenHash(hash(rawToken.trim()))
                .orElseThrow(PasswordResetService::invalidToken);

        if (token.getUsedAt() != null || !token.getExpiresAt().isAfter(now)) {
            throw invalidToken();
        }

        User user = token.getUser();
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            // Stop before claiming the token: a rejected attempt must not burn it.
            throw ApiException.badRequest("Choose a password different from your current one");
        }

        if (tokenRepository.claim(token.getId(), now) != 1) {
            throw invalidToken();
        }
        tokenRepository.invalidateAllForUser(user.getId(), now);

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        // Every session opened before the reset stops working.
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);

        // A successful recovery also clears any login lockout on the account.
        loginAttemptService.recordSuccess(user.getEmail());
    }

    private boolean allowRequest(String email) {
        Instant cutoff = Instant.now().minus(Duration.ofHours(1));
        if (recentRequests.size() > 10_000) {
            recentRequests.clear();
        }
        Deque<Instant> hits = recentRequests.computeIfAbsent(email, key -> new ArrayDeque<>());
        synchronized (hits) {
            while (!hits.isEmpty() && hits.peekFirst().isBefore(cutoff)) {
                hits.pollFirst();
            }
            if (hits.size() >= maxRequestsPerHour) {
                return false;
            }
            hits.addLast(Instant.now());
            return true;
        }
    }

    private static ApiException invalidToken() {
        return ApiException.badRequest(
                "This reset link is invalid or has expired. Request a new one.");
    }

    private static String newToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required by the platform", ex);
        }
    }
}
