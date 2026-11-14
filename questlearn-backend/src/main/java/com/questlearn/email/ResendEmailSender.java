package com.questlearn.email;

import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Sends through Resend's HTTP API ({@code POST /emails}).
 *
 * <p>A plain HTTP call rather than an SDK: one request shape, no dependency to keep
 * in step with the framework, and the provider can be swapped by writing another
 * {@link EmailSender}. The base URL is configurable so a test can point it at a
 * local stub and inspect the exact payload.</p>
 */
public class ResendEmailSender implements EmailSender {

    private final RestClient client;
    private final String apiKey;

    public ResendEmailSender(RestClient.Builder builder, String baseUrl, String apiKey) {
        this.client = builder.baseUrl(baseUrl).build();
        this.apiKey = apiKey;
    }

    @Override
    public void send(EmailMessage message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", message.from());
        body.put("to", List.of(message.to()));
        body.put("subject", message.subject());
        body.put("text", message.text());
        if (message.html() != null) {
            body.put("html", message.html());
        }

        try {
            client.post()
                    .uri("/emails")
                    .header("Authorization", "Bearer " + apiKey)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RuntimeException ex) {
            throw new EmailDeliveryException(
                    "Resend rejected the message for " + message.to() + ": " + ex.getMessage(), ex);
        }
    }

    @Override
    public boolean isDeliveryConfigured() {
        return true;
    }
}
