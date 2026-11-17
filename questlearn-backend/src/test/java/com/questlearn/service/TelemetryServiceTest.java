package com.questlearn.service;

import com.questlearn.dto.AdminTelemetryDto;
import io.micrometer.core.instrument.MockClock;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleConfig;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TelemetryServiceTest {

    /** The same bounds as management.metrics.distribution.slo.http.server.requests. */
    private static Timer timer(SimpleMeterRegistry registry, String uri) {
        return Timer.builder("http.server.requests")
                .tag("uri", uri)
                .serviceLevelObjectives(
                        Duration.ofMillis(5), Duration.ofMillis(10), Duration.ofMillis(25),
                        Duration.ofMillis(50), Duration.ofMillis(100), Duration.ofMillis(250),
                        Duration.ofMillis(500), Duration.ofMillis(1000),
                        Duration.ofMillis(2500), Duration.ofMillis(5000))
                .register(registry);
    }

    @Test
    void requestCountCoversEveryTaggedTimer() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        Timer fast = timer(registry, "/api/v1/courses");
        Timer slow = timer(registry, "/api/v1/leaderboard");

        for (int i = 0; i < 90; i++) {
            fast.record(Duration.ofMillis(10));
        }
        for (int i = 0; i < 10; i++) {
            slow.record(Duration.ofMillis(500));
        }

        AdminTelemetryDto snapshot = new TelemetryService(registry, new ErrorLogService()).snapshot();

        assertEquals(100, snapshot.requests(),
                "the console must count the whole server, not the first timer it finds");
        assertNotNull(snapshot.p50Ms());
        assertNotNull(snapshot.p95Ms());
        assertTrue(snapshot.p50Ms() <= 25,
                "p50 belongs in the fast buckets, was " + snapshot.p50Ms());
        assertTrue(snapshot.p95Ms() >= 250,
                "p95 must include the slow endpoint, was " + snapshot.p95Ms());
        assertTrue(snapshot.p99Ms() >= snapshot.p95Ms(),
                "p99 cannot be faster than p95");
    }

    @Test
    void percentilesUseTheHistogramWindowNotTheAllTimeCount() {
        MockClock clock = new MockClock();
        SimpleMeterRegistry registry = new SimpleMeterRegistry(SimpleConfig.DEFAULT, clock);
        Timer timer = timer(registry, "/api/v1/courses");

        for (int i = 0; i < 100; i++) {
            timer.record(Duration.ofMillis(10));
        }
        // Micrometer rotates its histogram window; the timer keeps counting while
        // the buckets forget. Dividing by the all-time count made every percentile
        // fall through to the 5 s ceiling.
        clock.add(Duration.ofMinutes(5));
        for (int i = 0; i < 5; i++) {
            timer.record(Duration.ofMillis(10));
        }

        AdminTelemetryDto snapshot = new TelemetryService(registry, new ErrorLogService()).snapshot();

        assertEquals(105, snapshot.requests(), "the counter still covers every request");
        assertNotNull(snapshot.p50Ms());
        assertTrue(snapshot.p50Ms() <= 25,
                "the median must describe the samples the histogram holds, was " + snapshot.p50Ms());
    }

    @Test
    void noTrafficReportsNullLatencyRatherThanZero() {
        AdminTelemetryDto snapshot =
                new TelemetryService(new SimpleMeterRegistry(), new ErrorLogService()).snapshot();

        assertEquals(0, snapshot.requests());
        assertNull(snapshot.p50Ms());
        assertNull(snapshot.p95Ms());
        assertNull(snapshot.p99Ms());
    }

    @Test
    void timersWithoutBucketsStillReportATruthfulCount() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        registry.timer("http.server.requests", "uri", "/api/v1/courses")
                .record(Duration.ofMillis(12));

        AdminTelemetryDto snapshot = new TelemetryService(registry, new ErrorLogService()).snapshot();

        assertEquals(1, snapshot.requests());
        assertNull(snapshot.p50Ms(),
                "without buckets the service must decline to guess a percentile");
    }
}
