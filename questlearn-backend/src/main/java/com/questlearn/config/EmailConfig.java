package com.questlearn.config;

import com.questlearn.email.EmailSender;
import com.questlearn.email.LogEmailSender;
import com.questlearn.email.ResendEmailSender;
import com.questlearn.email.SmtpEmailSender;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Locale;

/**
 * Picks the email transport.
 *
 * <p>{@code EMAIL_PROVIDER} can force {@code resend}, {@code smtp} or {@code log};
 * the default {@code auto} uses Resend when {@code RESEND_API_KEY} is set, SMTP
 * when {@code MAIL_HOST} is set, and otherwise the log fallback. Asking for a
 * provider without configuring it fails at startup instead of silently dropping
 * mail.</p>
 */
@Configuration
public class EmailConfig {

    @Bean
    public EmailSender emailSender(
            @Value("${questlearn.email.provider:auto}") String provider,
            @Value("${questlearn.email.resend-api-key:}") String resendApiKey,
            @Value("${questlearn.email.resend-base-url:https://api.resend.com}") String resendBaseUrl,
            @Value("${spring.mail.host:}") String mailHost,
            ObjectProvider<JavaMailSender> mailSenderProvider) {

        String choice = provider == null ? "auto" : provider.trim().toLowerCase(Locale.ROOT);
        boolean hasResendKey = resendApiKey != null && !resendApiKey.isBlank();
        boolean hasSmtpHost = mailHost != null && !mailHost.isBlank();

        if (choice.equals("resend") || (choice.equals("auto") && hasResendKey)) {
            if (!hasResendKey) {
                throw new IllegalStateException(
                        "EMAIL_PROVIDER=resend needs RESEND_API_KEY to be set.");
            }
            return new ResendEmailSender(resendClientBuilder(), resendBaseUrl, resendApiKey);
        }

        if (choice.equals("smtp") || (choice.equals("auto") && hasSmtpHost)) {
            JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
            if (!hasSmtpHost || mailSender == null) {
                throw new IllegalStateException(
                        "EMAIL_PROVIDER=smtp needs MAIL_HOST (and its credentials) to be set.");
            }
            return new SmtpEmailSender(mailSender);
        }

        if (!choice.equals("auto") && !choice.equals("log")) {
            throw new IllegalStateException(
                    "Unknown EMAIL_PROVIDER '" + provider + "'. Use resend, smtp, log or auto.");
        }
        return new LogEmailSender();
    }

    /**
     * A short read timeout: a mail provider having a bad day must not hold a
     * registration request open.
     */
    private RestClient.Builder resendClientBuilder() {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        return RestClient.builder().requestFactory(requestFactory);
    }
}
