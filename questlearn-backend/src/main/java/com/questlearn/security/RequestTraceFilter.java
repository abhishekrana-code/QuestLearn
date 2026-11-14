package com.questlearn.security;

import com.questlearn.service.ErrorLogService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Gives every request a short id and makes it visible in three places at once: the
 * {@code X-Request-Id} response header, the log lines written while it runs, and any
 * error body produced by the exception handler. A teacher can quote the id from a
 * failed page and the operator can find the matching log line instead of guessing
 * from a timestamp.
 *
 * <p>An id supplied by the client or a proxy is kept when it is a safe token, so a
 * fronting nginx can correlate its own access log with the application's. Anything
 * that could forge a log field (newlines, spaces, very long values) is replaced.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class RequestTraceFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String REQUEST_ID_ATTRIBUTE = "questlearn.requestId";
    /** Set by the exception handler so the failure is recorded with its real cause. */
    public static final String ERROR_DETAIL_ATTRIBUTE = "questlearn.errorDetail";
    public static final String MDC_KEY = "requestId";

    private static final Logger log = LoggerFactory.getLogger(RequestTraceFilter.class);
    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9._-]{8,64}");

    private final ErrorLogService errorLogService;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {

        String requestId = resolveId(request.getHeader(HEADER));
        MDC.put(MDC_KEY, requestId);
        request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
        response.setHeader(HEADER, requestId);

        long startedAt = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = (System.nanoTime() - startedAt) / 1_000_000;
            int status = response.getStatus();
            if (status >= 500) {
                Object detail = request.getAttribute(ERROR_DETAIL_ATTRIBUTE);
                String message = detail == null ? "Unhandled server error" : String.valueOf(detail);
                errorLogService.record(requestId, request.getMethod(), request.getRequestURI(),
                        status, message, durationMs);
                log.warn("{} {} failed with {} in {} ms", request.getMethod(),
                        request.getRequestURI(), status, durationMs);
            } else if (status >= 400) {
                log.debug("{} {} answered {} in {} ms", request.getMethod(),
                        request.getRequestURI(), status, durationMs);
            }
            MDC.remove(MDC_KEY);
        }
    }

    private String resolveId(String supplied) {
        if (supplied != null && SAFE_ID.matcher(supplied).matches()) {
            return supplied;
        }
        return UUID.randomUUID().toString();
    }
}
