package com.questlearn.exception;

import org.springframework.http.HttpStatus;

/**
 * Raised when Groq rejects a request, is unreachable, or is not configured.
 *
 * <p>The status is carried here because the difference matters to the client:
 * an unconfigured key is a {@code 503} the instructor can fix, while a rejected
 * or malformed upstream response is a {@code 502} that retrying may resolve.</p>
 */
public class GroqAiException extends RuntimeException {

    private final HttpStatus status;

    public GroqAiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public GroqAiException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

    /** No API key was supplied, so the AI features cannot run at all. */
    public static GroqAiException notConfigured() {
        return new GroqAiException(HttpStatus.SERVICE_UNAVAILABLE,
                "The AI examiner is not configured. Set GROQ_API_KEY and restart the server.");
    }

    /** Groq answered with an error, a timeout, or unusable content. */
    public static GroqAiException upstream(String message) {
        return new GroqAiException(HttpStatus.BAD_GATEWAY, message);
    }

    public static GroqAiException upstream(String message, Throwable cause) {
        return new GroqAiException(HttpStatus.BAD_GATEWAY, message, cause);
    }
}
