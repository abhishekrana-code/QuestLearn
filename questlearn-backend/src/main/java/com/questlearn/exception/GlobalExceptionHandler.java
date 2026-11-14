package com.questlearn.exception;

import com.questlearn.security.RequestTraceFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex,
                                                                  HttpServletRequest request) {
        return build(ex.getStatus(), ex.getMessage(), request.getRequestURI());
    }

    /**
     * Groq failures already carry the right status: 503 when no key is configured
     * (the school can fix that) and 502 when the upstream call failed.
     */
    @ExceptionHandler(GroqAiException.class)
    public ResponseEntity<Map<String, Object>> handleGroqFailure(GroqAiException ex,
                                                                HttpServletRequest request) {
        return build(ex.getStatus(), ex.getMessage(), request.getRequestURI());
    }

    /**
     * A request body in the wrong format - typically a multipart upload sent as
     * JSON because a client default header leaked through.
     */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleUnsupportedMediaType(
            HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        return build(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "Unsupported content type"
                        + (ex.getSupportedMediaTypes().isEmpty()
                        ? "."
                        : " - this endpoint expects " + ex.getSupportedMediaTypes().get(0) + "."),
                request.getRequestURI());
    }

    /** A viva posted without its audio part is a bad request, not a server error. */
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<Map<String, Object>> handleMissingPart(MissingServletRequestPartException ex,
                                                                HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST,
                "An audio recording is required for the viva.",
                request.getRequestURI());
    }

    /** A recording above the multipart limit is a 413, not a generic 500. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleUploadTooLarge(MaxUploadSizeExceededException ex,
                                                                   HttpServletRequest request) {
        return build(HttpStatus.PAYLOAD_TOO_LARGE,
                "That recording is too large. Keep viva answers under 80 seconds.",
                request.getRequestURI());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex,
                                                                HttpServletRequest request) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage());
        }
        String message = fieldErrors.isEmpty()
                ? "Validation failed"
                : fieldErrors.entrySet().iterator().next().getValue();

        Map<String, Object> body = body(HttpStatus.BAD_REQUEST, message, request.getRequestURI());
        body.put("fieldErrors", fieldErrors);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    /** Unmapped URLs (including typos like /modules/3/quiz/attempt) must be 404, not 500. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNoResource(NoResourceFoundException ex,
                                                               HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, "No endpoint found for this URL", request.getRequestURI());
    }

    /** Unparseable request bodies are a client mistake, so report 400 instead of 500. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadableBody(HttpMessageNotReadableException ex,
                                                                   HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "Malformed request body", request.getRequestURI());
    }

    /** A non-numeric id in the path (e.g. /modules/abc) is a bad request. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex,
                                                                 HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST,
                "Invalid value for '" + ex.getName() + "'", request.getRequestURI());
    }

    /** A missing required query parameter (e.g. /publish without ?published=) is a bad request. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParameter(
            MissingServletRequestParameterException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST,
                "Required parameter '" + ex.getParameterName() + "' is missing",
                request.getRequestURI());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex,
                                                                  HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN,
                "You do not have permission to perform this action",
                request.getRequestURI());
    }

    /**
     * Last resort. The detail goes to the server log, never to the client: exception
     * messages leak table names, SQL fragments and internal class paths.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex,
                                                               HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        // The trace filter records this request as a server error with the real cause,
        // so the admin view does not have to say only "Unhandled server error".
        request.setAttribute(RequestTraceFilter.ERROR_DETAIL_ATTRIBUTE,
                ex.getClass().getSimpleName() + ": " + ex.getMessage());
        return build(HttpStatus.INTERNAL_SERVER_ERROR,
                "Unexpected server error. The incident has been logged.",
                request.getRequestURI());
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String message, String path) {
        return ResponseEntity.status(status).body(body(status, message, path));
    }

    private Map<String, Object> body(HttpStatus status, String message, String path) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);
        body.put("path", path);
        String requestId = MDC.get(RequestTraceFilter.MDC_KEY);
        if (requestId != null) {
            body.put("requestId", requestId);
        }
        return body;
    }
}
