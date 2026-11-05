package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-account brute-force protection for the login endpoint.
 *
 * <p>After {@code questlearn.login.max-attempts} consecutive failures the account
 * is locked for {@code questlearn.login.lock-minutes}. A successful sign-in clears
 * the counter. Keyed by email, so one attacker cannot lock every account by IP.</p>
 *
 * <p>State is in-memory, which is correct for a single instance. Running several
 * instances would need a shared store (Redis) or an edge limiter; the nginx deploy
 * config also applies {@code limit_req} as a coarse per-IP backstop.</p>
 */
@Service
public class LoginAttemptService {

    /** Keeps memory bounded if an attacker cycles through many addresses. */
    private static final int MAX_TRACKED_ACCOUNTS = 10_000;

    private final int maxAttempts;
    private final Duration lockDuration;
    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    public LoginAttemptService(@Value("${questlearn.login.max-attempts:5}") int maxAttempts,
                               @Value("${questlearn.login.lock-minutes:15}") long lockMinutes) {
        this.maxAttempts = Math.max(maxAttempts, 1);
        this.lockDuration = Duration.ofMinutes(Math.max(lockMinutes, 1));
    }

    /** @throws ApiException 429 when the account is currently locked. */
    public void assertNotLocked(String email) {
        Attempt attempt = attempts.get(key(email));
        if (attempt == null) {
            return;
        }
        Instant now = Instant.now();
        if (attempt.isLocked(now)) {
            throw ApiException.tooManyRequests(
                    "Too many failed sign-in attempts. Try again in "
                            + attempt.remainingMinutes(now) + " minute(s).");
        }
        if (attempt.lockUntil() != null) {
            // The lock has expired; start a fresh window.
            attempts.remove(key(email));
        }
    }

    public void recordFailure(String email) {
        if (attempts.size() > MAX_TRACKED_ACCOUNTS) {
            pruneExpired(Instant.now());
        }
        Instant now = Instant.now();
        attempts.compute(key(email), (ignored, existing) -> {
            if (existing == null || existing.isLocked(now)) {
                return new Attempt(1, null, now);
            }
            int failures = existing.failures() + 1;
            Instant lockUntil = failures >= maxAttempts ? now.plus(lockDuration) : null;
            return new Attempt(failures, lockUntil, now);
        });
    }

    public void recordSuccess(String email) {
        attempts.remove(key(email));
    }

    private void pruneExpired(Instant now) {
        attempts.entrySet().removeIf(entry -> {
            Attempt attempt = entry.getValue();
            return !attempt.isLocked(now)
                    && attempt.lastFailure().plus(lockDuration).isBefore(now);
        });
    }

    private String key(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private record Attempt(int failures, Instant lockUntil, Instant lastFailure) {

        boolean isLocked(Instant now) {
            return lockUntil != null && lockUntil.isAfter(now);
        }

        long remainingMinutes(Instant now) {
            long seconds = Duration.between(now, lockUntil).getSeconds();
            return Math.max(1, (seconds + 59) / 60);
        }
    }
}
