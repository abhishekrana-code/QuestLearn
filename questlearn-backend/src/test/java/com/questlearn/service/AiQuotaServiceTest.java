package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

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
}
