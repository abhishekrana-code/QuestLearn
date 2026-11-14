package com.questlearn.config;

import com.questlearn.service.MediaStorageService;
import com.questlearn.service.media.DiskMediaStore;
import com.questlearn.service.media.MediaStore;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves lesson videos straight from disk.
 *
 * <p>A {@link org.springframework.web.servlet.resource.ResourceHttpRequestHandler}
 * is used rather than a controller so the browser gets byte-range support: without
 * it a student cannot scrub or resume a video. The bucket driver replaces this with a
 * redirect to a signed URL, so this handler only exists in disk mode. Files are named
 * with a random UUID, so the URL is unguessable, and the path is allow-listed in
 * {@code SecurityConfig} because a {@code <video src>} request cannot carry an
 * Authorization header.</p>
 */
@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(name = "questlearn.media.storage", havingValue = "disk", matchIfMissing = true)
public class MediaResourceConfig implements WebMvcConfigurer {

    private final MediaStore mediaStore;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        DiskMediaStore disk = (DiskMediaStore) mediaStore;
        registry.addResourceHandler(MediaStorageService.PUBLIC_PREFIX + "**")
                .addResourceLocations(disk.directory().toUri().toString())
                .setCachePeriod(60 * 60 * 24);
    }
}
