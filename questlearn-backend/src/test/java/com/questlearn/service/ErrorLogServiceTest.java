package com.questlearn.service;

import com.questlearn.dto.ServerErrorDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorLogServiceTest {

    @Test
    void keepsTheNewestFailureFirst() {
        ErrorLogService service = new ErrorLogService();

        service.record("req-1", "GET", "/api/v1/courses", 500, "boom", 12);
        service.record("req-2", "POST", "/api/v1/modules/1/complete", 502, "upstream", 40);

        List<ServerErrorDto> recent = service.recent(10);
        assertThat(recent).hasSize(2);
        assertThat(recent.get(0).requestId()).isEqualTo("req-2");
        assertThat(recent.get(1).requestId()).isEqualTo("req-1");
        assertThat(recent.get(0).status()).isEqualTo(502);
        assertThat(recent.get(0).durationMs()).isEqualTo(40);
    }

    @Test
    void evictsOldEntriesButKeepsTheTotal() {
        ErrorLogService service = new ErrorLogService();

        for (int i = 0; i < ErrorLogService.CAPACITY + 5; i++) {
            service.record("req-" + i, "GET", "/api/v1/courses", 500, "failure " + i, i);
        }

        assertThat(service.total()).isEqualTo(ErrorLogService.CAPACITY + 5);
        assertThat(service.recent(500)).hasSize(ErrorLogService.CAPACITY);
        assertThat(service.recent(1).get(0).requestId())
                .isEqualTo("req-" + (ErrorLogService.CAPACITY + 4));
    }

    @Test
    void collapsesWhitespaceAndCapsTheMessage() {
        ErrorLogService service = new ErrorLogService();
        String noisy = "java.lang.IllegalStateException:\n\tat com.questlearn.Foo(Foo.java:12) "
                + "x".repeat(500);

        service.record("req-1", "GET", "/api/v1/courses", 500, noisy, 3);

        String message = service.recent(1).get(0).message();
        assertThat(message).doesNotContain("\n");
        assertThat(message.length()).isLessThanOrEqualTo(300);
        assertThat(message).startsWith("java.lang.IllegalStateException:");
    }

    @Test
    void fallsBackToAGenericMessageWhenNoneIsSupplied() {
        ErrorLogService service = new ErrorLogService();

        service.record("req-1", "GET", "/api/v1/courses", 500, "   ", 3);

        assertThat(service.recent(1).get(0).message()).isEqualTo("Unexpected server error");
    }
}
