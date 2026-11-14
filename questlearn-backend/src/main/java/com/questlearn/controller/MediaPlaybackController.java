package com.questlearn.controller;

import com.questlearn.service.MediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Optional;

/**
 * Plays a lesson from a private bucket.
 *
 * <p>The URL a node stores is stable; this handler turns it into a short-lived signed
 * GET and redirects, so the bucket stays private while a teacher can replace the
 * bucket or its credentials without rewriting lessons. The redirect is not cached:
 * the signature inside it would go stale.</p>
 */
@RestController
@RequiredArgsConstructor
@ConditionalOnProperty(name = "questlearn.media.storage", havingValue = "s3")
public class MediaPlaybackController {

    private final MediaStorageService mediaStorageService;

    @GetMapping(MediaStorageService.PUBLIC_PREFIX + "{name}")
    public ResponseEntity<Void> play(@PathVariable String name) {
        String safeName = MediaStorageService.storedNameOf(MediaStorageService.PUBLIC_PREFIX + name);
        if (safeName == null) {
            return ResponseEntity.notFound().build();
        }
        Optional<String> signed = mediaStorageService.signedPlaybackUrl(safeName);
        if (signed.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(signed.get()))
                .cacheControl(CacheControl.noStore())
                .build();
    }
}
