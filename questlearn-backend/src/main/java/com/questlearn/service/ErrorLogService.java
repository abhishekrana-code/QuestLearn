package com.questlearn.service;

import com.questlearn.dto.ServerErrorDto;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * A bounded, in-memory record of recent server failures.
 *
 * <p>Deliberately not a database table: this is an operator aid for "the teacher
 * says the page is broken, what happened?", not an audit trail. Keeping it in memory
 * means a failing database can never make the error path fail as well, and a restart
 * clears it, which is the honest lifetime for a diagnostic ring buffer. The counter
 * is separate from the buffer so the total survives eviction of old entries.
 */
@Service
public class ErrorLogService {

    /** Enough to cover a bad afternoon, small enough that it can never grow. */
    static final int CAPACITY = 100;

    /** Long messages are cut so one stack-trace-ish string cannot fill the buffer. */
    private static final int MAX_MESSAGE = 300;

    private final Deque<ServerErrorDto> entries = new ArrayDeque<>();
    private final AtomicLong total = new AtomicLong();

    public synchronized void record(String requestId, String method, String path,
                                    int status, String message, long durationMs) {
        total.incrementAndGet();
        entries.addFirst(new ServerErrorDto(
                Instant.now(),
                requestId,
                method,
                path,
                status,
                trim(message),
                Math.max(0, durationMs)));
        while (entries.size() > CAPACITY) {
            entries.removeLast();
        }
    }

    /** Newest first. */
    public synchronized List<ServerErrorDto> recent(int limit) {
        int wanted = Math.clamp(limit, 1, CAPACITY);
        return entries.stream().limit(wanted).toList();
    }

    /** Every failure since startup, including the ones evicted from the buffer. */
    public long total() {
        return total.get();
    }

    private String trim(String message) {
        if (message == null || message.isBlank()) {
            return "Unexpected server error";
        }
        String single = message.replaceAll("\\s+", " ").trim();
        return single.length() <= MAX_MESSAGE ? single : single.substring(0, MAX_MESSAGE - 1) + "…";
    }
}
