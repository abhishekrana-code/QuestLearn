package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.exception.GroqAiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.POST;

class GroqAiServiceTest {

    private static final String BASE = "https://groq.test/openai/v1";
    private static final String REASONING = "openai/gpt-oss-120b";
    private static final String FALLBACK = "openai/gpt-oss-20b";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockRestServiceServer server;
    private GroqAiService service;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE);
        server = MockRestServiceServer.bindTo(builder).build();
        service = new GroqAiService(builder.build(), objectMapper, "test-key",
                REASONING, FALLBACK, "whisper-large-v3-turbo");
    }

    private static String completionBody(String json) {
        return "{\"choices\":[{\"message\":{\"content\":" + quote(json) + "}}]}";
    }

    private static String quote(String value) {
        try {
            return new ObjectMapper().writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Test
    void aRateLimitedReasoningModelIsRetriedOnceWithTheFallbackModel() {
        server.expect(requestTo(BASE + "/chat/completions"))
                .andExpect(method(POST))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"" + REASONING + "\"")))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"rate limit exceeded\"}}"));

        server.expect(requestTo(BASE + "/chat/completions"))
                .andExpect(method(POST))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"" + FALLBACK + "\"")))
                .andRespond(withSuccess(completionBody("{\"score\":80,\"passed\":true}"),
                        MediaType.APPLICATION_JSON));

        JsonNode verdict = service.generateJson("system", "user");

        assertThat(verdict.path("score").asInt()).isEqualTo(80);
        server.verify();
    }

    @Test
    void bothModelsRateLimitedBecomesATemporary429ForTheClient() {
        server.expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"rate limit exceeded\"}}"));
        server.expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"rate limit exceeded\"}}"));

        assertThatThrownBy(() -> service.generateJson("system", "user"))
                .isInstanceOf(GroqAiException.class)
                .satisfies(error -> {
                    assertThat(((GroqAiException) error).getStatus())
                            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(error.getMessage()).contains("busy").contains("quiz");
                });
        server.verify();
    }

    @Test
    void aServerErrorIsNotRetriedAndStays502() {
        server.expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"upstream boom\"}}"));

        assertThatThrownBy(() -> service.generateJson("system", "user"))
                .isInstanceOf(GroqAiException.class)
                .satisfies(error -> assertThat(((GroqAiException) error).getStatus())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));

        // Exactly one request: a 500 will not be fixed by a smaller model.
        server.verify();
    }

    @Test
    void rateLimitedTranscriptionSuggestsTypingInstead() {
        server.expect(requestTo(BASE + "/audio/transcriptions"))
                .andExpect(method(POST))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"rate limit exceeded\"}}"));

        assertThatThrownBy(() -> service.transcribe(new byte[]{1, 2, 3}, "viva.webm", "audio/webm"))
                .isInstanceOf(GroqAiException.class)
                .satisfies(error -> {
                    assertThat(((GroqAiException) error).getStatus())
                            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(error.getMessage()).contains("Type your answer instead");
                });
        server.verify();
    }

    @Test
    void anUnconfiguredKeyIsStill503() {
        GroqAiService withoutKey = new GroqAiService(
                RestClient.builder().baseUrl(BASE).build(), objectMapper, "",
                REASONING, FALLBACK, "whisper-large-v3-turbo");

        assertThatThrownBy(() -> withoutKey.generateJson("system", "user"))
                .isInstanceOf(GroqAiException.class)
                .satisfies(error -> assertThat(((GroqAiException) error).getStatus())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }
}
