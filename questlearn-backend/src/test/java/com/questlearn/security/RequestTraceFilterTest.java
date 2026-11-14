package com.questlearn.security;

import com.questlearn.service.ErrorLogService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;

import static org.assertj.core.api.Assertions.assertThat;

class RequestTraceFilterTest {

    private final ErrorLogService errorLogService = new ErrorLogService();
    private final RequestTraceFilter filter = new RequestTraceFilter(errorLogService);

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void generatesAnIdAndEchoesItOnTheResponse() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/courses");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, ok());

        String id = response.getHeader(RequestTraceFilter.HEADER);
        assertThat(id).isNotBlank();
        assertThat(request.getAttribute(RequestTraceFilter.REQUEST_ID_ATTRIBUTE)).isEqualTo(id);
        assertThat(MDC.get(RequestTraceFilter.MDC_KEY)).isNull();
        assertThat(errorLogService.total()).isZero();
    }

    @Test
    void keepsAWellFormedIdFromTheProxy() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/courses");
        request.addHeader(RequestTraceFilter.HEADER, "nginx-abc123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, ok());

        assertThat(response.getHeader(RequestTraceFilter.HEADER)).isEqualTo("nginx-abc123");
    }

    @Test
    void replacesAnIdThatCouldForgeALogLine() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/courses");
        request.addHeader(RequestTraceFilter.HEADER, "short");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, ok());

        assertThat(response.getHeader(RequestTraceFilter.HEADER)).isNotEqualTo("short");
        assertThat(response.getHeader(RequestTraceFilter.HEADER)).isNotBlank();
    }

    @Test
    void recordsAServerErrorWithTheCauseSetByTheExceptionHandler() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/courses");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain failing = (req, res) -> {
            req.setAttribute(RequestTraceFilter.ERROR_DETAIL_ATTRIBUTE,
                    "IllegalStateException: database is on fire");
            ((MockHttpServletResponse) res).setStatus(500);
        };

        filter.doFilter(request, response, failing);

        assertThat(errorLogService.total()).isEqualTo(1);
        assertThat(errorLogService.recent(1).get(0).message())
                .isEqualTo("IllegalStateException: database is on fire");
        assertThat(errorLogService.recent(1).get(0).path()).isEqualTo("/api/v1/courses");
        assertThat(MDC.get(RequestTraceFilter.MDC_KEY)).isNull();
    }

    @Test
    void leavesClientErrorsOutOfTheLedger() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/nope");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain notFound = (req, res) -> ((MockHttpServletResponse) res).setStatus(404);

        filter.doFilter(request, response, notFound);

        assertThat(errorLogService.total()).isZero();
    }

    private FilterChain ok() {
        return (req, res) -> ((MockHttpServletResponse) res).setStatus(200);
    }
}
