package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

/**
 * The HTTP boundary between QuestLearn and the separate VerityAI service.
 *
 * <p>VerityAI authenticates a browser with a SESSION cookie plus a CSRF token,
 * and every document is scoped to that account. QuestLearn therefore signs in
 * once with a dedicated service account and keeps the cookie warm. Nothing about
 * that account is ever sent to a browser; students only ever talk to this
 * application.</p>
 *
 * <p>Two consequences are deliberate:</p>
 * <ul>
 *   <li>the service account owns every course document, so course scoping is
 *       enforced here by only ever sending that course's document ids;</li>
 *   <li>VerityAI allows one live session per account, so this client keeps one
 *       session and reuses it instead of logging in per request.</li>
 * </ul>
 */
@Service
@Slf4j
public class VerityAiClient {

    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final Duration SESSION_REFRESH_AFTER = Duration.ofMinutes(20);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final boolean enabled;
    private final String baseUrl;
    private final String email;
    private final String password;
    private final long maxFileBytes;

    private final Object sessionLock = new Object();
    private volatile Session session;

    @Autowired
    public VerityAiClient(
            @Value("${questlearn.verity.enabled:false}") boolean enabled,
            @Value("${questlearn.verity.base-url:http://localhost:8080/api/v1}") String baseUrl,
            @Value("${questlearn.verity.email:}") String email,
            @Value("${questlearn.verity.password:}") String password,
            @Value("${questlearn.verity.max-file-bytes:26214400}") long maxFileBytes,
            @Value("${questlearn.verity.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${questlearn.verity.read-timeout-ms:120000}") int readTimeoutMs,
            ObjectMapper objectMapper) {
        this(buildBuilder(connectTimeoutMs, readTimeoutMs), objectMapper,
                enabled, baseUrl, email, password, maxFileBytes);
    }

    /** Visible for tests that swap the HTTP layer for a mock server. */
    VerityAiClient(RestClient.Builder builder,
                   ObjectMapper objectMapper,
                   boolean enabled,
                   String baseUrl,
                   String email,
                   String password,
                   long maxFileBytes) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.objectMapper = objectMapper;
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.email = email;
        this.password = password;
        this.maxFileBytes = Math.max(1024, maxFileBytes);
    }

    private static RestClient.Builder buildBuilder(int connectTimeoutMs, int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Math.max(1, connectTimeoutMs));
        factory.setReadTimeout(Math.max(1, readTimeoutMs));
        return RestClient.builder().requestFactory(factory);
    }

    public boolean isConfigured() {
        return enabled
                && StringUtils.hasText(baseUrl)
                && StringUtils.hasText(email)
                && StringUtils.hasText(password);
    }

    public long maxFileBytes() {
        return maxFileBytes;
    }

    /**
     * Uploads one PDF and returns its VerityAI id and initial processing status.
     */
    public UploadedDocument upload(String filename, byte[] bytes) {
        requireConfigured();
        try {
            return call(current -> {
                var body = new org.springframework.http.client.MultipartBodyBuilder();
                body.part("file", new ByteArrayResource(bytes) {
                    @Override
                    public String getFilename() {
                        return filename;
                    }
                }).contentType(MediaType.APPLICATION_PDF);

                JsonNode response = restClient.post()
                        .uri("/documents")
                        .header(HttpHeaders.COOKIE, current.cookieHeader())
                        .header(CSRF_HEADER, current.csrf())
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(body.build())
                        .retrieve()
                        .body(JsonNode.class);

                return new UploadedDocument(
                        uuid(response, "id"),
                        text(response, "originalFilename", filename),
                        text(response, "status", "UPLOADED"));
            });
        } catch (RestClientResponseException ex) {
            throw mapFailure(ex, "upload the file");
        }
    }

    /** Current processing state for one document. */
    public DocumentState state(UUID documentId) {
        requireConfigured();
        try {
            return call(current -> {
                JsonNode response = restClient.get()
                        .uri("/documents/{id}/status", documentId)
                        .header(HttpHeaders.COOKIE, current.cookieHeader())
                        .retrieve()
                        .body(JsonNode.class);
                return new DocumentState(
                        text(response, "status", "UNKNOWN"),
                        nullableText(response, "errorMessage"));
            });
        } catch (RestClientResponseException ex) {
            throw mapFailure(ex, "check the file");
        }
    }

    /**
     * Asks one question over exactly the supplied documents.
     *
     * <p>A short-lived conversation is created for the request and removed
     * afterwards: QuestLearn owns the course conversation, and VerityAI's
     * history should not fill up with one thread per question.</p>
     */
    public Answer ask(String title, List<UUID> documentIds, String question) {
        requireConfigured();
        UUID conversationId = createConversation(title, documentIds);
        try {
            return call(current -> {
                JsonNode response = restClient.post()
                        .uri("/conversations/{id}/messages", conversationId)
                        .header(HttpHeaders.COOKIE, current.cookieHeader())
                        .header(CSRF_HEADER, current.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of(
                                "question", question,
                                "documentIds", documentIds))
                        .retrieve()
                        .body(JsonNode.class);
                return toAnswer(response);
            });
        } catch (RestClientResponseException ex) {
            throw mapFailure(ex, "answer that question");
        } finally {
            deleteConversationQuietly(conversationId);
        }
    }

    /**
     * Deletes a document in VerityAI.
     *
     * @return true when it was deleted, false when VerityAI already did not have it
     */
    public boolean delete(UUID documentId) {
        requireConfigured();
        try {
            call(current -> {
                restClient.delete()
                        .uri("/documents/{id}", documentId)
                        .header(HttpHeaders.COOKIE, current.cookieHeader())
                        .header(CSRF_HEADER, current.csrf())
                        .retrieve()
                        .toBodilessEntity();
                return null;
            });
            return true;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == HttpStatus.NOT_FOUND.value()) {
                return false;
            }
            throw mapFailure(ex, "remove the file");
        }
    }

    private UUID createConversation(String title, List<UUID> documentIds) {
        try {
            return call(current -> {
                JsonNode response = restClient.post()
                        .uri("/conversations")
                        .header(HttpHeaders.COOKIE, current.cookieHeader())
                        .header(CSRF_HEADER, current.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of(
                                "title", title,
                                "documentIds", documentIds))
                        .retrieve()
                        .body(JsonNode.class);
                return uuid(response, "id");
            });
        } catch (RestClientResponseException ex) {
            throw mapFailure(ex, "start that question");
        }
    }

    private void deleteConversationQuietly(UUID conversationId) {
        if (conversationId == null) {
            return;
        }
        try {
            call(current -> {
                restClient.delete()
                        .uri("/conversations/{id}", conversationId)
                        .header(HttpHeaders.COOKIE, current.cookieHeader())
                        .header(CSRF_HEADER, current.csrf())
                        .retrieve()
                        .toBodilessEntity();
                return null;
            });
        } catch (RuntimeException ex) {
            // A leftover conversation is untidy, never a reason to fail the answer
            // the learner already received.
            log.debug("Could not remove the temporary VerityAI conversation", ex);
        }
    }

    // ------------------------------------------------------------------
    // Session handling
    // ------------------------------------------------------------------

    private <T> T call(Function<Session, T> action) {
        Session current = currentSession();
        try {
            return action.apply(current);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == HttpStatus.UNAUTHORIZED.value()) {
                return action.apply(reauthenticate(current));
            }
            if (status == HttpStatus.FORBIDDEN.value()) {
                return action.apply(refreshCsrf(current));
            }
            throw ex;
        } catch (ResourceAccessException ex) {
            // No HTTP status exists here: the request never became a response.
            throw unreachable(ex);
        }
    }

    private Session currentSession() {
        Session current = session;
        if (current != null && current.issuedAt().plus(SESSION_REFRESH_AFTER).isAfter(Instant.now())) {
            return current;
        }
        synchronized (sessionLock) {
            if (session != null
                    && session.issuedAt().plus(SESSION_REFRESH_AFTER).isAfter(Instant.now())) {
                return session;
            }
            return login();
        }
    }

    /** Reuses a session another thread already refreshed, rather than fighting it. */
    private Session reauthenticate(Session failed) {
        synchronized (sessionLock) {
            if (session != null && session != failed
                    && session.issuedAt().plus(SESSION_REFRESH_AFTER).isAfter(Instant.now())) {
                return session;
            }
            return login();
        }
    }

    private Session refreshCsrf(Session current) {
        synchronized (sessionLock) {
            if (session != null && session != current) {
                return session;
            }
            Csrf csrf = fetchCsrf(current.cookie());
            Session refreshed = new Session(current.cookie(), csrf.token(), csrf.cookie(), Instant.now());
            session = refreshed;
            return refreshed;
        }
    }

    /** Caller must hold {@link #sessionLock}. */
    private Session login() {
        try {
            ResponseEntity<JsonNode> response = restClient.post()
                    .uri("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("email", email, "password", password))
                    .retrieve()
                    .toEntity(JsonNode.class);

            String cookie = sessionCookie(response.getHeaders());
            if (!StringUtils.hasText(cookie)) {
                throw new IllegalStateException("VerityAI did not return a session cookie");
            }
            Csrf csrf = fetchCsrf(cookie);
            Session created = new Session(cookie, csrf.token(), csrf.cookie(), Instant.now());
            session = created;
            return created;
        } catch (RestClientResponseException ex) {
            // Never log the request body: it carries the service account password.
            log.warn("VerityAI sign-in failed with HTTP {}", ex.getStatusCode().value());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The course materials service is not available right now.");
        } catch (ResourceAccessException ex) {
            log.warn("VerityAI sign-in could not reach the service");
            throw unreachable(ex);
        }
    }

    /**
     * Reads the CSRF token and the matching XSRF-TOKEN cookie from one response.
     *
     * <p>VerityAI validates the header against the token stored in that cookie, so
     * keeping only the JSON token is not enough: every mutating request has to send
     * both cookies. A response that does not set the cookie is unusable.</p>
     */
    private Csrf fetchCsrf(String cookie) {
        try {
            ResponseEntity<JsonNode> response = restClient.get()
                    .uri("/auth/csrf")
                    .header(HttpHeaders.COOKIE, cookie)
                    .retrieve()
                    .toEntity(JsonNode.class);
            String token = nullableText(response.getBody(), "token");
            if (!StringUtils.hasText(token)) {
                throw new IllegalStateException("VerityAI did not return a CSRF token");
            }
            String csrfCookie = cookieValue(response.getHeaders(), "XSRF-TOKEN");
            if (!StringUtils.hasText(csrfCookie)) {
                throw new IllegalStateException("VerityAI did not return an XSRF-TOKEN cookie");
            }
            return new Csrf(token, csrfCookie);
        } catch (RestClientResponseException ex) {
            log.warn("VerityAI CSRF request failed with HTTP {}", ex.getStatusCode().value());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The course materials service is not available right now.");
        } catch (ResourceAccessException ex) {
            log.warn("VerityAI CSRF request could not reach the service");
            throw unreachable(ex);
        }
    }

    private static String sessionCookie(HttpHeaders headers) {
        return cookieValue(headers, "SESSION");
    }

    /** Returns one {@code name=value} cookie from the response, or null. */
    private static String cookieValue(HttpHeaders headers, String name) {
        List<String> cookies = headers.getOrDefault(HttpHeaders.SET_COOKIE, List.of());
        for (String header : cookies) {
            for (String part : header.split(";")) {
                String trimmed = part.trim();
                if (trimmed.startsWith(name + "=")) {
                    return trimmed;
                }
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Parsing and failures
    // ------------------------------------------------------------------

    private Answer toAnswer(JsonNode response) {
        List<Citation> citations = new ArrayList<>();
        JsonNode raw = response == null ? null : response.get("citations");
        if (raw != null && raw.isArray()) {
            for (JsonNode citation : raw) {
                citations.add(new Citation(
                        uuid(citation, "documentId"),
                        text(citation, "documentName", ""),
                        citation.hasNonNull("pageNumber") ? citation.get("pageNumber").asInt() : null,
                        text(citation, "excerpt", "")));
            }
        }
        return new Answer(
                response == null ? "" : text(response, "content", ""),
                response == null ? "NONE" : text(response, "evidenceStatus", "NONE"),
                List.copyOf(citations));
    }

    private ApiException mapFailure(RestClientResponseException ex, String action) {
        int status = ex.getStatusCode().value();
        String upstream = upstreamMessage(ex);
        log.warn("VerityAI could not {} (HTTP {})", action, status);

        if (status == HttpStatus.BAD_REQUEST.value() || status == 422) {
            return ApiException.badRequest(upstream != null ? upstream : "That file could not be read.");
        }
        if (status == HttpStatus.NOT_FOUND.value()) {
            return ApiException.notFound("That material is no longer available.");
        }
        if (status == HttpStatus.TOO_MANY_REQUESTS.value()) {
            return ApiException.tooManyRequests(
                    "The document service is busy. Wait a moment, then try again.");
        }
        if (status == HttpStatus.SERVICE_UNAVAILABLE.value()) {
            return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    upstream != null ? upstream
                            : "The document service is briefly unavailable. Try again shortly.");
        }
        return ApiException.badGateway(
                "The document service could not " + action + ". Try again shortly.");
    }

    /**
     * A connection that never opened, or one that opened and then stalled, is a
     * gateway failure rather than a QuestLearn bug. Without this mapping the
     * catch-all handler reported an unreachable VerityAI as a generic 500, so a
     * caller could not tell "the service is down" from "this app is broken".
     */
    private ApiException unreachable(ResourceAccessException ex) {
        Throwable cause = ex.getCause() == null ? ex : ex.getCause();
        log.warn("VerityAI could not be reached: {}", cause.toString());

        boolean couldNotConnect = cause instanceof ConnectException
                || cause instanceof UnknownHostException
                || (cause instanceof SocketTimeoutException
                        && cause.getMessage() != null
                        && cause.getMessage().toLowerCase(Locale.ROOT).contains("connect"));
        if (couldNotConnect) {
            return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The document service is not reachable right now. Try again shortly.");
        }
        return ApiException.badGateway(
                "The document service did not answer in time. Try again shortly.");
    }

    private String upstreamMessage(RestClientResponseException ex) {
        try {
            String raw = ex.getResponseBodyAsString();
            if (!StringUtils.hasText(raw)) {
                return null;
            }
            JsonNode body = objectMapper.readTree(raw);
            String message = nullableText(body, "message");
            if (message == null) {
                return null;
            }
            return message.length() <= 300 ? message : message.substring(0, 299) + "…";
        } catch (Exception ignored) {
            return null;
        }
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Course materials are not configured on this server.");
        }
    }

    private static UUID uuid(JsonNode node, String field) {
        String value = nullableText(node, field);
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String nullableText(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static String text(JsonNode node, String field, String fallback) {
        String value = nullableText(node, field);
        return StringUtils.hasText(value) ? value : fallback;
    }

    // ------------------------------------------------------------------
    // Small value types
    // ------------------------------------------------------------------

    private record Session(String cookie, String csrf, String csrfCookie, Instant issuedAt) {

        /** Both cookies must travel together or VerityAI rejects a mutating call. */
        String cookieHeader() {
            return cookie + "; " + csrfCookie;
        }
    }

    private record Csrf(String token, String cookie) {
    }

    public record UploadedDocument(UUID id, String filename, String status) {
    }

    public record DocumentState(String status, String errorMessage) {
    }

    public record Citation(UUID documentId, String documentName, Integer pageNumber, String excerpt) {
    }

    public record Answer(String content, String evidenceStatus, List<Citation> citations) {
    }
}
