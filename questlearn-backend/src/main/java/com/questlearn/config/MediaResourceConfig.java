package com.questlearn.config;

import com.questlearn.service.MediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the uploaded lesson videos.
 *
 * <p>A {@link org.springframework.web.servlet.resource.ResourceHttpRequestHandler}
 * is used rather than a controller so the browser gets byte-range support: without
 * it a student cannot scrub or resume a video. Files are named with a random UUID,
 * so the URL is unguessable, and the handler is allow-listed in {@code SecurityConfig}
 * because a {@code <video src>} request cannot carry an Authorization header.</p>
 */
@Configuration
@RequiredArgsConstructor
public class MediaResourceConfig implements WebMvcConfigurer {

    private final MediaStorageService mediaStorageService;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler(MediaStorageService.PUBLIC_PREFIX + "**")
                .addResourceLocations(mediaStorageService.videoDir().toUri().toString())
                .setCachePeriod(60 * 60 * 24);
    }
}
