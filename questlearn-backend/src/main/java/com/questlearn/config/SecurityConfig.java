package com.questlearn.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.security.JwtAuthenticationFilter;
import com.questlearn.security.RequestTraceFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ObjectMapper objectMapper;

    @Value("${questlearn.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/v1/auth/register", "/api/v1/auth/login",
                        "/api/v1/auth/password-reset/request",
                        "/api/v1/auth/password-reset/confirm").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/verify-email").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/h2-console/**", "/actuator/health").permitAll()
                // Metrics describe the whole server, so only an operator may read them.
                .requestMatchers("/actuator/**").hasRole("ADMIN")
                // Lesson videos: a <video src> request cannot send a bearer token, and the
                // stored names are random UUIDs, so the URL itself is the capability.
                .requestMatchers(HttpMethod.GET, "/api/v1/media/videos/**").permitAll()
                // A signed direct upload carries its own name, expiry and signature,
                // checked by MediaStorageService; the signature is the credential.
                .requestMatchers(HttpMethod.PUT, "/api/v1/media/uploads/**").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) ->
                        writeJson(response, HttpServletResponse.SC_UNAUTHORIZED,
                                "Authentication required", request))
                .accessDeniedHandler((request, response, deniedException) ->
                        writeJson(response, HttpServletResponse.SC_FORBIDDEN,
                                "You do not have permission to perform this action", request)))
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private void writeJson(HttpServletResponse response, int status, String message,
                           jakarta.servlet.http.HttpServletRequest request) {
        try {
            response.setStatus(status);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            Map<String, Object> body = new java.util.LinkedHashMap<>();
            body.put("status", status);
            body.put("error", status == 401 ? "Unauthorized" : "Forbidden");
            body.put("message", message);
            body.put("path", request.getRequestURI());
            // The same id is on the response header and in the log line, so a
            // support report of a 401 or 403 can be traced too.
            Object requestId = request.getAttribute(RequestTraceFilter.REQUEST_ID_ATTRIBUTE);
            if (requestId != null) {
                body.put("requestId", requestId);
            }
            objectMapper.writeValue(response.getOutputStream(), body);
        } catch (Exception ignored) {
            // response stream already committed - nothing else we can do
        }
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setExposedHeaders(List.of("Authorization", "X-Request-Id"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
