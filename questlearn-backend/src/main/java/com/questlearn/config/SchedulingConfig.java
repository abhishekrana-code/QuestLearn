package com.questlearn.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables scheduling for the deadline digest.
 *
 * <p>The job bean itself is conditional on {@code NOTIFICATIONS_ENABLED}, so a
 * default deployment runs no background mail while the scheduler stays available
 * for future jobs.</p>
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
