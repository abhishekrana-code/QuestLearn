package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Stores lesson videos on the server's disk and hands back the URL to play them.
 *
 * <p>Videos are far too large to keep in the database or in memory, so the upload
 * is streamed straight to a file. The saved name is a random UUID: it is
 * unguessable, which is what lets the player fetch it without an Authorization
 * header (a {@code <video src>} cannot send one). Only the listed container
 * formats are accepted, and the original filename is never used on disk, so a
 * crafted name cannot escape the directory.</p>
 */
@Service
public class MediaStorageService {

    private static final Logger log = LoggerFactory.getLogger(MediaStorageService.class);

    /** Everything a browser can play natively; anything else cannot be previewed. */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("mp4", "webm", "mov", "m4v", "ogv");

    /** The public path the resource handler serves this directory from. */
    public static final String PUBLIC_PREFIX = "/api/v1/media/videos/";

    private static final Pattern SAFE_NAME =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]{2,5}$");

    private final Path videoDir;
    private final long maxVideoBytes;

    public MediaStorageService(@Value("${questlearn.media.video-dir:./uploads/videos}") String directory,
                               @Value("${questlearn.media.max-video-bytes:104857600}") long maxVideoBytes) {
        this.videoDir = Paths.get(directory).toAbsolutePath().normalize();
        this.maxVideoBytes = Math.max(1024, maxVideoBytes);
        try {
            Files.createDirectories(videoDir);
        } catch (IOException ex) {
            throw new IllegalStateException("Cannot create the video directory " + videoDir, ex);
        }
        log.info("Lesson videos are stored in {} (max {} MB)", videoDir, maxVideoBytes / (1024 * 1024));
    }

    public long maxVideoBytes() {
        return maxVideoBytes;
    }

    public Path videoDir() {
        return videoDir;
    }

    /**
     * Saves one uploaded video and returns the URL the lesson should play.
     *
     * @throws ApiException 400 for an empty file, an unsupported format or an oversize file
     */
    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Choose a video file first.");
        }
        if (file.getSize() > maxVideoBytes) {
            throw ApiException.badRequest("That video is " + megabytes(file.getSize())
                    + " MB. The limit is " + megabytes(maxVideoBytes) + " MB - trim it or attach a link.");
        }

        String extension = extensionOf(file.getOriginalFilename());
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw ApiException.badRequest(
                    "Unsupported video format. Upload MP4, WebM, MOV, M4V or OGV, or attach a link.");
        }

        String storedName = UUID.randomUUID() + "." + extension;
        Path target = videoDir.resolve(storedName).normalize();
        if (!target.startsWith(videoDir)) {
            throw ApiException.badRequest("That filename is not allowed.");
        }

        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ex) {
            throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                    "The video could not be saved. Check the server's disk space and try again.");
        }
        log.info("Stored lesson video {} ({} MB)", storedName, megabytes(file.getSize()));
        return PUBLIC_PREFIX + storedName;
    }

    /** Removes a previously stored video; external links and anything unexpected are ignored. */
    public void deleteStored(String url) {
        String name = storedNameOf(url);
        if (name == null) {
            return;
        }
        try {
            boolean removed = Files.deleteIfExists(videoDir.resolve(name).normalize());
            if (removed) {
                log.info("Deleted lesson video {}", name);
            }
        } catch (IOException ex) {
            // A stale file is harmless; never fail a lesson edit because of it.
            log.warn("Could not delete lesson video {}: {}", name, ex.getMessage());
        }
    }

    /** The file name if this URL points at a video we stored, otherwise null. */
    public static String storedNameOf(String url) {
        if (url == null || !url.startsWith(PUBLIC_PREFIX)) {
            return null;
        }
        String name = url.substring(PUBLIC_PREFIX.length());
        return SAFE_NAME.matcher(name).matches() ? name : null;
    }

    private static String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "";
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static long megabytes(long bytes) {
        return Math.max(1, Math.round(bytes / (1024.0 * 1024.0)));
    }
}
