package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.exception.ApiException;
import com.questlearn.model.EmailVerificationToken;
import com.questlearn.model.User;
import com.questlearn.repository.EmailVerificationTokenRepository;
import com.questlearn.repository.UserRepository;
import com.questlearn.security.OneTimeTokens;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Issues and redeems the link that proves an address belongs to its owner.
 *
 * <p>Verification is deliberately soft. An unconfirmed account keeps every
 * permission it had; the only difference is a dashboard reminder. That means a
 * school with no mail provider, or a provider having a bad day, can still teach.</p>
 *
 * <p>Tokens follow the reset-link rules: 32 random bytes, only their SHA-256 hash
 * at rest, absolute expiry, single use through a conditional claim, and a newer
 * link kills the older ones. Resends are throttled per account so one signed-in
 * browser cannot be used to flood an inbox.</p>
 */
@Service
public class EmailVerificationService {

    private final UserRepository userRepository;
    private final EmailVerificationTokenRepository tokenRepository;
    private final MailService mailService;
    private final Duration tokenTtl;
    private final int maxRequestsPerHour;

    /** Recent resends per address. In-memory: correct for one instance. */
    private final Map<String, Deque<Instant>> recentRequests = new ConcurrentHashMap<>();

    public EmailVerificationService(UserRepository userRepository,
                                    EmailVerificationTokenRepository tokenRepository,
                                    MailService mailService,
                                    @Value("${questlearn.auth.verification-token-hours:48}") long tokenTtlHours,
                                    @Value("${questlearn.auth.verification-max-per-hour:3}") int maxRequestsPerHour) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.mailService = mailService;
        this.tokenTtl = Duration.ofHours(Math.max(1, tokenTtlHours));
        this.maxRequestsPerHour = Math.max(1, maxRequestsPerHour);
    }

    public long tokenTtlHours() {
        return tokenTtl.toHours();
    }

    /**
     * Creates a fresh link and mails it. Used both by sign-up and by an explicit
     * resend; the caller decides whether the per-account throttle applies.
     */
    @Transactional
    public void issue(User user) {
        Instant now = Instant.now();
        // A new link supersedes older ones, so a forwarded email stops working.
        tokenRepository.invalidateAllForUser(user.getId(), now);

        String rawToken = OneTimeTokens.mint();
        tokenRepository.save(EmailVerificationToken.builder()
                .user(user)
                .tokenHash(OneTimeTokens.sha256(rawToken))
                .createdAt(now)
                .expiresAt(now.plus(tokenTtl))
                .build());

        mailService.sendEmailVerification(user, rawToken, tokenTtl);
    }

    /**
     * Sends another link to the signed-in account. Refuses a confirmed address so
     * the endpoint cannot be used to keep mailing someone who already acted.
     */
    @Transactional
    public void resend(AppUserPrincipal principal) {
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        if (user.isEmailVerified()) {
            throw ApiException.badRequest("This email address is already confirmed.");
        }
        if (!allowRequest(user.getEmail())) {
            throw ApiException.tooManyRequests(
                    "Too many confirmation emails for this account. Try again in an hour.");
        }
        issue(user);
    }

    /**
     * Redeems a link. A token that was already used, superseded or has expired is
     * refused with the same message, so the caller cannot learn which it was.
     */
    @Transactional
    public User verify(String rawToken) {
        Instant now = Instant.now();
        EmailVerificationToken token = tokenRepository
                .findByTokenHash(OneTimeTokens.sha256(rawToken.trim()))
                .orElseThrow(EmailVerificationService::invalidToken);

        if (token.getUsedAt() != null || !token.getExpiresAt().isAfter(now)) {
            throw invalidToken();
        }
        if (tokenRepository.claim(token.getId(), now) != 1) {
            throw invalidToken();
        }

        User user = token.getUser();
        tokenRepository.invalidateAllForUser(user.getId(), now);
        user.setEmailVerified(true);
        userRepository.save(user);
        return user;
    }

    private boolean allowRequest(String email) {
        String key = email.trim().toLowerCase(java.util.Locale.ROOT);
        Instant cutoff = Instant.now().minus(Duration.ofHours(1));
        if (recentRequests.size() > 10_000) {
            recentRequests.clear();
        }
        Deque<Instant> hits = recentRequests.computeIfAbsent(key, ignored -> new ArrayDeque<>());
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
                "This confirmation link is invalid or has expired. Request a new one.");
    }
}
