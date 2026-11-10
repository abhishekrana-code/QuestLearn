package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiQuotaServiceTest {

    @Test
    void allowsCallsUpToTheHourlyLimit() {
        AiQuotaService quota = new AiQuotaService(2);

        assertThatCode(() -> {
            quota.consume(7L);
            quota.consume(7L);
        }).doesNotThrowAnyException();

        assertThatThrownBy(() -> quota.consume(7L))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getStatus())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    void countsEachAccountSeparately() {
        AiQuotaService quota = new AiQuotaService(1);

        quota.consume(1L);

        assertThatThrownBy(() -> quota.consume(1L)).isInstanceOf(ApiException.class);
        assertThatCode(() -> quota.consume(2L)).doesNotThrowAnyException();
    }

    @Test
    void exposesTheConfiguredLimitAndRejectsNonsense() {
        assertThat(new AiQuotaService(30).hourlyLimit()).isEqualTo(30);
        assertThat(new AiQuotaService(0).hourlyLimit()).isEqualTo(1);
    }

    // ------------------------------------------------------------ daily cap

    @Test
    void theDailyCapStopsCallsAcrossDifferentAccounts() {
        AiQuotaService quota = new AiQuotaService(30, 3, Clock.systemDefaultZone());

        quota.consume(1L);
        quota.consume(2L);
        quota.consume(3L);

        assertThatThrownBy(() -> quota.consume(4L))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("today's limit")
                .satisfies(error -> assertThat(((ApiException) error).getStatus())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        assertThat(quota.usedToday()).isEqualTo(3);
    }

    @Test
    void aCallRejectedByTheHourlyLimitDoesNotSpendADaySlot() {
        AiQuotaService quota = new AiQuotaService(1, 5, Clock.systemDefaultZone());

        quota.consume(1L);
        assertThatThrownBy(() -> quota.consume(1L)).isInstanceOf(ApiException.class);

        assertThat(quota.usedToday()).isEqualTo(1);
        assertThatCode(() -> quota.consume(2L)).doesNotThrowAnyException();
        assertThat(quota.usedToday()).isEqualTo(2);
    }

    @Test
    void theDailyCounterResetsAtMidnightServerTime() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-10T23:59:00Z"));
        AiQuotaService quota = new AiQuotaService(30, 1, clock);

        quota.consume(1L);
        assertThatThrownBy(() -> quota.consume(2L)).isInstanceOf(ApiException.class);

        clock.set(Instant.parse("2026-11-11T00:01:00Z"));

        assertThatCode(() -> quota.consume(2L)).doesNotThrowAnyException();
        assertThat(quota.usedToday()).isEqualTo(1);
    }

    /** A clock the test can move forward without sleeping. */
    private static final class MutableClock extends Clock {

        private Instant now;

        MutableClock(Instant start) {
            this.now = start;
        }

        void set(Instant instant) {
            this.now = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
