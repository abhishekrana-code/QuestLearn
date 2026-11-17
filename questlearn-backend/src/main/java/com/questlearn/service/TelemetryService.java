package com.questlearn.service;

import com.questlearn.dto.AdminTelemetryDto;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.distribution.CountAtBucket;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;

/**
 * One read of the operational picture: uptime, how many requests the HTTP metrics
 * have seen, how many failed, and the tail latency.
 *
 * <p>{@code http.server.requests} is not one meter: Spring Boot records a separate
 * timer per URI, method and status. Reading a single timer therefore reported the
 * traffic of whichever tag combination happened to come first, which is why the
 * console could show "1 request" on a busy server. Counts are summed here, and the
 * percentiles are read from the merged histogram buckets so that p95 means the
 * slowest request in the whole process, not the slowest one endpoint. The bucket
 * bounds come from {@code management.metrics.distribution.slo.http.server.requests},
 * which works on every registry including the simple in-memory one.</p>
 *
 * <p>The quantile is taken over the histogram's own sample count rather than the
 * timer's all-time count. Micrometer rotates histogram windows, so mixing the two
 * produced a p50 of 5,000 ms on a server whose median request was about 60 ms.</p>
 */
@Service
@RequiredArgsConstructor
public class TelemetryService {

    private final MeterRegistry meterRegistry;
    private final ErrorLogService errorLogService;

    private static final double[] QUANTILES = {0.5, 0.95, 0.99};

    private final long startedAt = System.currentTimeMillis();

    public AdminTelemetryDto snapshot() {
        List<Timer> timers = new ArrayList<>(meterRegistry.find("http.server.requests").timers());

        long requests = 0;
        for (Timer timer : timers) {
            requests += timer.count();
        }

        Buckets buckets = mergedBuckets(timers);

        return new AdminTelemetryDto(
                (System.currentTimeMillis() - startedAt) / 1000,
                requests,
                errorLogService.total(),
                // The quantile is divided by the samples the histogram still holds,
                // not by the all-time count: Micrometer rotates its histogram window
                // (two minutes by default). Using the larger count made every tail
                // figure fall past the last bucket and report the 5 s ceiling.
                percentile(buckets.counts(), buckets.samples(), QUANTILES[0]),
                percentile(buckets.counts(), buckets.samples(), QUANTILES[1]),
                percentile(buckets.counts(), buckets.samples(), QUANTILES[2]),
                errorLogService.recent(10));
    }

    /** Finite bucket counts plus the number of samples those buckets describe. */
    private record Buckets(TreeMap<Double, Double> counts, double samples) {
    }

    /**
     * Bucket upper bounds in milliseconds, with the cumulative counts of every
     * matching timer added together. Micrometer's per-bucket counts are already
     * cumulative, so summing them is valid across tag combinations.
     */
    private Buckets mergedBuckets(List<Timer> timers) {
        TreeMap<Double, Double> buckets = new TreeMap<>();
        double samples = 0;
        for (Timer timer : timers) {
            double timerSamples = 0;
            double lastFiniteCount = 0;
            for (CountAtBucket bucket : timer.takeSnapshot().histogramCounts()) {
                double bound = bucket.bucket(TimeUnit.MILLISECONDS);
                if (Double.isInfinite(bound)) {
                    // +Inf is the window's cumulative total for this timer.
                    timerSamples = Math.max(timerSamples, bucket.count());
                } else {
                    buckets.merge(bound, bucket.count(), Double::sum);
                    lastFiniteCount = Math.max(lastFiniteCount, bucket.count());
                }
            }
            samples += Math.max(timerSamples, lastFiniteCount);
        }
        return new Buckets(buckets, samples);
    }

    /**
     * Linear interpolation inside the bucket that contains the quantile. Without
     * histogram buckets (an older configuration) there is no honest answer, so the
     * caller gets null instead of a fabricated zero.
     */
    private Double percentile(TreeMap<Double, Double> buckets, double samples, double quantile) {
        if (buckets.isEmpty() || samples <= 0) {
            return null;
        }

        double target = quantile * samples;
        double previousBound = 0;
        double previousCount = 0;

        for (Map.Entry<Double, Double> bucket : buckets.entrySet()) {
            double bound = bucket.getKey();
            double cumulative = bucket.getValue();

            if (cumulative >= target) {
                double inBucket = cumulative - previousCount;
                double fraction = inBucket <= 0 ? 1 : (target - previousCount) / inBucket;
                double position = previousBound + (bound - previousBound) * Math.max(0, Math.min(1, fraction));
                return round(position);
            }

            previousBound = bound;
            previousCount = cumulative;
        }

        // Every sample landed in the +Inf bucket; the largest finite bound is the
        // most the histogram can honestly claim.
        return round(buckets.lastKey());
    }

    private Double round(double millis) {
        return Math.round(millis * 10) / 10.0;
    }
}
