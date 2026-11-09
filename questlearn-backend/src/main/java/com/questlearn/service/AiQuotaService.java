package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rolling per-account quota for calls that spend money on the Groq API.
 *
 * <p>Grading a viva and generating a course each cost tokens, so one student or
 * instructor must not be able to loop the endpoint. In-memory by design: this
 * deployment runs a single backend instance, and the limit is a cost guard rather
 * than an authorisation rule.</p>
 */
@Service
public class AiQuotaService {

    private static final long WINDOW_MS = 60L * 60L * 1000L;
    private static final int MAX_TRACKED_ACCOUNTS = 10_000;

    private final int hourlyLimit;
    private final Map<Long, Deque<Long>> calls = new ConcurrentHashMap<>();

    public AiQuotaService(@Value("${questlearn.ai.hourly-limit:30}") int hourlyLimit) {
        this.hourlyLimit = Math.max(1, hourlyLimit);
    }

    public int hourlyLimit() {
        return hourlyLimit;
    }

    /**
     * Records one AI call for the account.
     *
     * @throws ApiException 429 when the account has used its window
     */
    public void consume(Long userId) {
        long now = Instant.now().toEpochMilli();
        pruneIfOversized();

        Deque<Long> window = calls.computeIfAbsent(userId, key -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && now - window.peekFirst() >= WINDOW_MS) {
                window.pollFirst();
            }
            if (window.size() >= hourlyLimit) {
                throw ApiException.tooManyRequests(
                        "You have reached the AI limit of " + hourlyLimit
                                + " calls per hour. Try again later.");
            }
            window.addLast(now);
        }
    }

    /** Drops stale accounts so a long-running server does not grow without bound. */
    private void pruneIfOversized() {
        if (calls.size() < MAX_TRACKED_ACCOUNTS) {
            return;
        }
        long cutoff = Instant.now().toEpochMilli() - WINDOW_MS;
        calls.entrySet().removeIf(entry -> {
            Deque<Long> window = entry.getValue();
            synchronized (window) {
                return window.isEmpty() || window.peekLast() < cutoff;
            }
        });
    }
}
