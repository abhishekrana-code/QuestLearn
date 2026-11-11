package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Cost guard for calls that spend money on the Groq API.
 *
 * <p>Two limits apply, cheapest to reason about first:</p>
 * <ul>
 *   <li>a <strong>daily cap across all accounts</strong>, so however many accounts
 *       exist the deployment cannot exceed the free tier in one day;</li>
 *   <li>a <strong>rolling per-account hourly limit</strong>, so one student or
 *       instructor cannot loop the endpoint and starve everyone else.</li>
 * </ul>
 *
 * <p>In-memory by design: this deployment runs a single backend instance, and the
 * limit is a cost guard rather than an authorisation rule. The day resets at
 * midnight in the server's time zone.</p>
 */
@Service
public class AiQuotaService {

    private static final long WINDOW_MS = 60L * 60L * 1000L;
    private static final int MAX_TRACKED_ACCOUNTS = 10_000;
    private static final int DEFAULT_DAILY_LIMIT = 150;

    private final int hourlyLimit;
    private final int dailyLimit;
    private final Clock clock;
    private final Map<Long, Deque<Long>> calls = new ConcurrentHashMap<>();
    private final AtomicReference<DailyCounter> today = new AtomicReference<>();

    @Autowired
    public AiQuotaService(@Value("${questlearn.ai.hourly-limit:30}") int hourlyLimit,
                          @Value("${questlearn.ai.daily-limit:150}") int dailyLimit) {
        this(hourlyLimit, dailyLimit, Clock.systemDefaultZone());
    }

    /** Kept for callers that only care about the per-account window. */
    public AiQuotaService(int hourlyLimit) {
        this(hourlyLimit, DEFAULT_DAILY_LIMIT, Clock.systemDefaultZone());
    }

    /** The clock is injectable so the midnight reset can be tested without sleeping. */
    AiQuotaService(int hourlyLimit, int dailyLimit, Clock clock) {
        this.hourlyLimit = Math.max(1, hourlyLimit);
        this.dailyLimit = Math.max(1, dailyLimit);
        this.clock = clock;
    }

    public int hourlyLimit() {
        return hourlyLimit;
    }

    public int dailyLimit() {
        return dailyLimit;
    }

    /**
     * Records one AI call: first against the deployment-wide day, then against the
     * account's rolling hour.
     *
     * @throws ApiException 429 when either limit is used up
     */
    public void consume(Long userId) {
        DailyCounter counter = counterForToday();
        if (counter.used().incrementAndGet() > dailyLimit) {
            counter.used().decrementAndGet();
            throw ApiException.tooManyRequests(
                    "The examiner has reached today's limit. Try the quiz instead, "
                            + "or come back tomorrow.");
        }

        try {
            consumeHourly(userId);
        } catch (RuntimeException rejected) {
            // The call never happened, so give the day's slot back.
            counter.used().decrementAndGet();
            throw rejected;
        }
    }

    /** How many calls the deployment has made today (for the status endpoint). */
    public int usedToday() {
        return counterForToday().used().get();
    }

    private void consumeHourly(Long userId) {
        long now = Instant.now(clock).toEpochMilli();
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

    /** Returns the counter for today, replacing it when the date has rolled over. */
    private DailyCounter counterForToday() {
        LocalDate day = LocalDate.now(clock);
        DailyCounter current = today.get();
        if (current != null && current.day().equals(day)) {
            return current;
        }
        synchronized (this) {
            DailyCounter recheck = today.get();
            if (recheck == null || !recheck.day().equals(day)) {
                recheck = new DailyCounter(day, new AtomicInteger());
                today.set(recheck);
            }
            return recheck;
        }
    }

    /** Drops stale accounts so a long-running server does not grow without bound. */
    private void pruneIfOversized() {
        if (calls.size() < MAX_TRACKED_ACCOUNTS) {
            return;
        }
        long cutoff = Instant.now(clock).toEpochMilli() - WINDOW_MS;
        calls.entrySet().removeIf(entry -> {
            Deque<Long> window = entry.getValue();
            synchronized (window) {
                return window.isEmpty() || window.peekLast() < cutoff;
            }
        });
    }

    private record DailyCounter(LocalDate day, AtomicInteger used) {
    }
}
