package com.questlearn.controller;

import com.questlearn.service.MediaStorageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Receives a signed disk upload.
 *
 * <p>The URL carries the object name, an expiry and a signature, which is the only
 * credential it needs: this is the disk equivalent of a presigned bucket PUT, and it
 * exists so a large file can be streamed once instead of buffered by the framework.
 * The bucket driver does not use this endpoint at all.</p>
 */
@RestController
@RequiredArgsConstructor
@ConditionalOnProperty(name = "questlearn.media.storage", havingValue = "disk", matchIfMissing = true)
public class MediaUploadController {

    private final MediaStorageService mediaStorageService;

    @PutMapping(path = MediaStorageService.UPLOAD_PREFIX + "{name}", consumes = MediaType.ALL_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public void upload(@PathVariable String name,
                       @RequestParam long expires,
                       @RequestParam String signature,
                       @RequestHeader(value = "Content-Type", required = false) String contentType,
                       HttpServletRequest request) throws java.io.IOException {
        mediaStorageService.acceptUpload(name, signature, expires, contentType,
                request.getContentLengthLong(), request.getInputStream());
    }
}
