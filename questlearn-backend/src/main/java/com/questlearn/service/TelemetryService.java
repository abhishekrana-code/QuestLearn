package com.questlearn.service;

import com.questlearn.dto.AdminTelemetryDto;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * One read of the operational picture: uptime, how many requests the HTTP metrics
 * have seen, how many failed, and the tail latency. The percentiles come from the
 * {@code http.server.requests} timer that Spring Boot's metrics auto-configuration
 * already records, so nothing extra has to be instrumented per endpoint.
 */
@Service
@RequiredArgsConstructor
public class TelemetryService {

    private final MeterRegistry meterRegistry;
    private final ErrorLogService errorLogService;

    private final long startedAt = System.currentTimeMillis();

    public AdminTelemetryDto snapshot() {
        Timer timer = meterRegistry.find("http.server.requests").timer();
        return new AdminTelemetryDto(
                (System.currentTimeMillis() - startedAt) / 1000,
                timer == null ? 0 : timer.count(),
                errorLogService.total(),
                percentile(timer, 0.5),
                percentile(timer, 0.95),
                percentile(timer, 0.99),
                errorLogService.recent(10));
    }

    private Double percentile(Timer timer, double quantile) {
        if (timer == null) {
            return null;
        }
        double millis = timer.percentile(quantile, TimeUnit.MILLISECONDS);
        // Micrometer reports NaN while a percentile has no samples yet.
        return Double.isNaN(millis) ? null : Math.round(millis * 10) / 10.0;
    }
}
