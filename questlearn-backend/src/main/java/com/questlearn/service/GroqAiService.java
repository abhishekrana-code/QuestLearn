package com.questlearn.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.exception.GroqAiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin wrapper around Groq's OpenAI-compatible REST API.
 *
 * <p>Two capabilities are exposed:</p>
 * <ul>
 *   <li>{@link #generateJson(String, String)} &rarr; the configured reasoning model with
 *       {@code response_format: json_object}, always returned as a strict JSON object.</li>
 *   <li>{@link #transcribe(byte[], String, String)} &rarr; whisper multipart transcription
 *       of a recorded viva answer.</li>
 * </ul>
 *
 * <p>The API key is read from {@code QUESTLEARN_AI_GROQ_API_KEY} (see
 * {@code application.properties}) and never leaves the server: the browser only ever
 * talks to this application.</p>
 */
@Service
@Slf4j
public class GroqAiService {

    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 120_000;
    private static final int MAX_COMPLETION_TOKENS = 8_192;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String reasoningModel;
    private final String transcriptionModel;

    public GroqAiService(
            @Value("${questlearn.ai.groq-api-key:}") String apiKey,
            @Value("${questlearn.ai.base-url:https://api.groq.com/openai/v1}") String baseUrl,
            @Value("${questlearn.ai.reasoning-model:openai/gpt-oss-120b}") String reasoningModel,
            @Value("${questlearn.ai.transcription-model:whisper-large-v3-turbo}") String transcriptionModel,
            ObjectMapper objectMapper) {

        this.apiKey = apiKey;
        this.objectMapper = objectMapper;
        this.reasoningModel = reasoningModel;
        this.transcriptionModel = transcriptionModel;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        requestFactory.setReadTimeout(READ_TIMEOUT_MS);

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory);

        if (StringUtils.hasText(apiKey)) {
            builder.defaultHeader("Authorization", "Bearer " + apiKey.trim());
        }
        this.restClient = builder.build();
    }

    public boolean isConfigured() {
        return StringUtils.hasText(apiKey);
    }

    public String reasoningModel() {
        return reasoningModel;
    }

    public String transcriptionModel() {
        return transcriptionModel;
    }

    /**
     * Sends a chat completion forcing a JSON object response.
     *
     * @return the parsed JSON object returned by the model (never a prose string)
     */
    public JsonNode generateJson(String systemPrompt, String userPrompt) {
        requireApiKey();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", reasoningModel);
        body.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
        ));
        body.put("response_format", Map.of("type", "json_object"));
        body.put("temperature", 0.2);
        body.put("max_tokens", MAX_COMPLETION_TOKENS);

        try {
            JsonNode response = restClient.post()
                    .uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            return parseJsonContent(response, "chat completion");
        } catch (RestClientResponseException ex) {
            throw upstreamFailure("chat completion", ex);
        } catch (RestClientException ex) {
            throw upstreamFailure("chat completion", ex);
        }
    }

    /**
     * Transcribes a recorded viva answer.
     *
     * @param audio       raw audio bytes (webm/wav/mp3/m4a/ogg, max 25 MB per Groq)
     * @param filename    original client filename, used to sniff the container format
     * @param contentType MIME type reported by the browser
     * @return plain transcript text
     */
    public String transcribe(byte[] audio, String filename, String contentType) {
        requireApiKey();
        if (audio == null || audio.length == 0) {
            throw GroqAiException.upstream("No audio was supplied for transcription");
        }

        ByteArrayResource fileResource = new ByteArrayResource(audio) {
            @Override
            public String getFilename() {
                return normaliseFilename(filename);
            }
        };

        MultipartBodyBuilder multipart = new MultipartBodyBuilder();
        multipart.part("file", fileResource).contentType(audioMediaType(filename, contentType));
        multipart.part("model", transcriptionModel);
        multipart.part("response_format", "json");
        multipart.part("temperature", "0");

        try {
            JsonNode response = restClient.post()
                    .uri("/audio/transcriptions")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(multipart.build())
                    .retrieve()
                    .body(JsonNode.class);

            String transcript = response == null ? "" : response.path("text").asText("").trim();
            if (!StringUtils.hasText(transcript)) {
                throw GroqAiException.upstream(
                        "The transcription came back empty - try answering a little longer.");
            }
            return transcript;
        } catch (RestClientResponseException ex) {
            throw upstreamFailure("transcription", ex);
        } catch (RestClientException ex) {
            throw upstreamFailure("transcription", ex);
        }
    }

    private JsonNode parseJsonContent(JsonNode response, String operation) {
        String content = response == null
                ? ""
                : response.path("choices").path(0).path("message").path("content").asText("");
        if (!StringUtils.hasText(content)) {
            throw GroqAiException.upstream("The model returned an empty " + operation + " response");
        }

        String cleaned = stripCodeFence(content.trim());
        try {
            JsonNode parsed = objectMapper.readTree(cleaned);
            if (parsed == null || !(parsed.isObject() || parsed.isArray())) {
                throw GroqAiException.upstream(
                        "The model's " + operation + " response was not JSON");
            }
            return parsed;
        } catch (JsonProcessingException ex) {
            log.error("Groq {} returned non-JSON content: {}", operation, abbreviate(content));
            throw GroqAiException.upstream(
                    "The model returned malformed JSON for the " + operation, ex);
        }
    }

    private static String stripCodeFence(String content) {
        if (!content.startsWith("```")) {
            return content;
        }
        int firstLineEnd = content.indexOf('\n');
        int lastFence = content.lastIndexOf("```");
        if (firstLineEnd < 0 || lastFence <= firstLineEnd) {
            return content;
        }
        return content.substring(firstLineEnd + 1, lastFence).trim();
    }

    private void requireApiKey() {
        if (!isConfigured()) {
            throw GroqAiException.notConfigured();
        }
    }

    private GroqAiException upstreamFailure(String operation, Exception ex) {
        if (ex instanceof RestClientResponseException responseException) {
            String upstreamMessage = upstreamMessage(responseException.getResponseBodyAsString());
            log.error("Groq {} failed with HTTP {}: {}",
                    operation, responseException.getStatusCode().value(), upstreamMessage);
            return GroqAiException.upstream("Groq " + operation + " failed with HTTP "
                    + responseException.getStatusCode().value() + ": " + upstreamMessage, ex);
        }
        log.error("Groq {} could not be reached: {}", operation, ex.getMessage());
        return GroqAiException.upstream(
                "Groq " + operation + " is unreachable: " + ex.getMessage(), ex);
    }

    private String upstreamMessage(String responseBody) {
        if (!StringUtils.hasText(responseBody)) {
            return "no details provided";
        }
        try {
            JsonNode body = objectMapper.readTree(responseBody);
            String message = body.path("error").path("message").asText("");
            if (StringUtils.hasText(message)) {
                return abbreviate(message);
            }
        } catch (JsonProcessingException ignored) {
            // fall through to the raw body
        }
        return abbreviate(responseBody);
    }

    private static String abbreviate(String value) {
        String singleLine = value.replaceAll("\\s+", " ").trim();
        return singleLine.length() > 300 ? singleLine.substring(0, 300) + "..." : singleLine;
    }

    private static String normaliseFilename(String filename) {
        String candidate = StringUtils.hasText(filename) ? filename.trim() : "viva.webm";
        candidate = candidate.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!candidate.contains(".")) {
            candidate = candidate + ".webm";
        }
        return candidate;
    }

    private static MediaType audioMediaType(String filename, String contentType) {
        if (StringUtils.hasText(contentType)) {
            try {
                return MediaType.parseMediaType(contentType);
            } catch (InvalidMediaTypeException ignored) {
                // fall back to extension sniffing
            }
        }
        String name = filename == null ? "" : filename.toLowerCase();
        if (name.endsWith(".wav")) {
            return MediaType.parseMediaType("audio/wav");
        }
        if (name.endsWith(".mp3")) {
            return MediaType.parseMediaType("audio/mpeg");
        }
        if (name.endsWith(".m4a") || name.endsWith(".mp4")) {
            return MediaType.parseMediaType("audio/mp4");
        }
        if (name.endsWith(".ogg") || name.endsWith(".oga")) {
            return MediaType.parseMediaType("audio/ogg");
        }
        return MediaType.parseMediaType("audio/webm");
    }
}
