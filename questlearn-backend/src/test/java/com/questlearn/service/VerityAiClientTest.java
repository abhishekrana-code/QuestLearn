package com.questlearn.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpMethod.DELETE;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class VerityAiClientTest {

    private static final String BASE = "http://verity.test/api/v1";
    private static final String CONVERSATION = "11111111-1111-1111-1111-111111111111";
    private static final String DOCUMENT = "22222222-2222-2222-2222-222222222222";

    private MockRestServiceServer server;
    private VerityAiClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new VerityAiClient(builder, new ObjectMapper(), true, BASE,
                "service@questlearn.test", "secret", 25L * 1024 * 1024);
    }

    private void expectLogin() {
        server.expect(requestTo(BASE + "/auth/login"))
                .andExpect(method(POST))
                .andRespond(withSuccess("{\"authenticated\":true}", MediaType.APPLICATION_JSON)
                        .header("Set-Cookie", "SESSION=session-1; Path=/; HttpOnly"));
        server.expect(requestTo(BASE + "/auth/csrf"))
                .andExpect(method(GET))
                .andExpect(header("Cookie", "SESSION=session-1"))
                .andRespond(withSuccess("{\"token\":\"csrf-1\"}", MediaType.APPLICATION_JSON)
                        .header("Set-Cookie", "XSRF-TOKEN=xsrf-1; Path=/"));
    }

    @Test
    void anIncompleteConfigurationIsNotUsable() {
        VerityAiClient missingPassword = new VerityAiClient(RestClient.builder(), new ObjectMapper(),
                true, BASE, "service@questlearn.test", "", 1024);
        assertThat(missingPassword.isConfigured()).isFalse();
        assertThat(client.isConfigured()).isTrue();
    }

    @Test
    void uploadSignsInOnceAndReturnsTheVerityDocument() {
        expectLogin();
        server.expect(requestTo(BASE + "/documents"))
                .andExpect(method(POST))
                .andExpect(header("Cookie", "SESSION=session-1; XSRF-TOKEN=xsrf-1"))
                .andExpect(header("X-XSRF-TOKEN", "csrf-1"))
                .andRespond(withSuccess("""
                        {"id":"%s","originalFilename":"notes.pdf","status":"UPLOADED"}
                        """.formatted(DOCUMENT), MediaType.APPLICATION_JSON));

        VerityAiClient.UploadedDocument uploaded = client.upload(
                "notes.pdf", "%PDF-1.4\ncontent".getBytes(StandardCharsets.UTF_8));

        assertThat(uploaded.id()).isEqualTo(UUID.fromString(DOCUMENT));
        assertThat(uploaded.filename()).isEqualTo("notes.pdf");
        assertThat(uploaded.status()).isEqualTo("UPLOADED");
        server.verify();
    }

    @Test
    void askUsesAShortLivedConversationAndReturnsCitations() {
        expectLogin();
        server.expect(requestTo(BASE + "/conversations"))
                .andExpect(method(POST))
                .andExpect(header("Cookie", "SESSION=session-1; XSRF-TOKEN=xsrf-1"))
                .andExpect(header("X-XSRF-TOKEN", "csrf-1"))
                .andRespond(withSuccess("{\"id\":\"" + CONVERSATION + "\"}",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/conversations/" + CONVERSATION + "/messages"))
                .andExpect(method(POST))
                .andExpect(header("Cookie", "SESSION=session-1; XSRF-TOKEN=xsrf-1"))
                .andExpect(header("X-XSRF-TOKEN", "csrf-1"))
                .andRespond(withSuccess("""
                        {"content":"Revenue rose [S1].","evidenceStatus":"SUFFICIENT",
                         "citations":[{"documentId":"%s","documentName":"notes.pdf",
                         "pageNumber":4,"excerpt":"Revenue rose 12%%."}]}
                        """.formatted(DOCUMENT), MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/conversations/" + CONVERSATION))
                .andExpect(method(DELETE))
                .andExpect(header("Cookie", "SESSION=session-1; XSRF-TOKEN=xsrf-1"))
                .andExpect(header("X-XSRF-TOKEN", "csrf-1"))
                .andRespond(withSuccess());

        VerityAiClient.Answer answer = client.ask(
                "QuestLearn: Economics",
                List.of(UUID.fromString(DOCUMENT)),
                "How did revenue change?");

        assertThat(answer.content()).isEqualTo("Revenue rose [S1].");
        assertThat(answer.evidenceStatus()).isEqualTo("SUFFICIENT");
        assertThat(answer.citations()).hasSize(1);
        assertThat(answer.citations().get(0).pageNumber()).isEqualTo(4);
        assertThat(answer.citations().get(0).excerpt()).isEqualTo("Revenue rose 12%.");
        server.verify();
    }

    @Test
    void aSessionThatExpiredIsReplacedOnce() {
        expectLogin();
        server.expect(requestTo(BASE + "/documents/" + DOCUMENT + "/status"))
                .andExpect(method(GET))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        server.expect(requestTo(BASE + "/auth/login"))
                .andExpect(method(POST))
                .andRespond(withSuccess("{\"authenticated\":true}", MediaType.APPLICATION_JSON)
                        .header("Set-Cookie", "SESSION=session-2; Path=/; HttpOnly"));
        server.expect(requestTo(BASE + "/auth/csrf"))
                .andRespond(withSuccess("{\"token\":\"csrf-2\"}", MediaType.APPLICATION_JSON)
                        .header("Set-Cookie", "XSRF-TOKEN=xsrf-2; Path=/"));
        server.expect(requestTo(BASE + "/documents/" + DOCUMENT + "/status"))
                .andExpect(method(GET))
                .andExpect(header("Cookie", "SESSION=session-2; XSRF-TOKEN=xsrf-2"))
                .andRespond(withSuccess("{\"status\":\"READY\"}", MediaType.APPLICATION_JSON));

        VerityAiClient.DocumentState state = client.state(UUID.fromString(DOCUMENT));

        assertThat(state.status()).isEqualTo("READY");
        server.verify();
    }

    @Test
    void aForbiddenResponseRefreshesTheCsrfCookieAndRetries() {
        expectLogin();
        server.expect(requestTo(BASE + "/documents"))
                .andExpect(method(POST))
                .andExpect(header("Cookie", "SESSION=session-1; XSRF-TOKEN=xsrf-1"))
                .andExpect(header("X-XSRF-TOKEN", "csrf-1"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));
        server.expect(requestTo(BASE + "/auth/csrf"))
                .andExpect(method(GET))
                .andExpect(header("Cookie", "SESSION=session-1"))
                .andRespond(withSuccess("{\"token\":\"csrf-2\"}", MediaType.APPLICATION_JSON)
                        .header("Set-Cookie", "XSRF-TOKEN=xsrf-2; Path=/"));
        server.expect(requestTo(BASE + "/documents"))
                .andExpect(method(POST))
                .andExpect(header("Cookie", "SESSION=session-1; XSRF-TOKEN=xsrf-2"))
                .andExpect(header("X-XSRF-TOKEN", "csrf-2"))
                .andRespond(withSuccess("""
                        {"id":"%s","originalFilename":"notes.pdf","status":"UPLOADED"}
                        """.formatted(DOCUMENT), MediaType.APPLICATION_JSON));

        VerityAiClient.UploadedDocument uploaded = client.upload(
                "notes.pdf", "%PDF-1.4\ncontent".getBytes(StandardCharsets.UTF_8));

        assertThat(uploaded.id()).isEqualTo(UUID.fromString(DOCUMENT));
        server.verify();
    }

}
