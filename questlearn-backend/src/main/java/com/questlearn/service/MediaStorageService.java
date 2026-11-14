package com.questlearn.service;

import com.questlearn.exception.ApiException;
import com.questlearn.service.media.MediaStore;
import com.questlearn.service.media.UploadSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The rules for lesson videos, in front of whichever store the deployment chose.
 *
 * <p>A lesson can be uploaded two ways and both end at the same stable URL. A small
 * file can still be posted to this server, which streams it to the store. A large one
 * gets a ticket: the browser puts the bytes straight into the bucket (or, on disk,
 * into a signed one-shot URL here) and the server only records the result. Playback
 * is a URL under {@code /api/v1/media/videos/}, so a node's lesson content never
 * contains an expiring link.</p>
 */
@Service
public class MediaStorageService {

    private static final Logger log = LoggerFactory.getLogger(MediaStorageService.class);

    /** Everything a browser can play natively; anything else cannot be previewed. */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("mp4", "webm", "mov", "m4v", "ogv");

    /** The stable path a lesson plays from, whatever the store is. */
    public static final String PUBLIC_PREFIX = "/api/v1/media/videos/";

    /** Where a signed disk upload is received; separate so playback stays a GET. */
    public static final String UPLOAD_PREFIX = "/api/v1/media/uploads/";

    /**
     * A stored name is a slug plus a video extension: no dots, slashes or spaces, so a
     * name can never climb out of the directory or the bucket prefix. Uploads use a
     * UUID; the bundled demo lesson keeps a readable name.
     */
    private static final Pattern SAFE_NAME =
            Pattern.compile("^[0-9a-z][0-9a-z-]{0,79}\\.[a-z0-9]{2,5}$");

    private final MediaStore store;
    private final UploadSignature signatures;
    private final long maxVideoBytes;
    private final Duration uploadTtl;
    private final Duration playbackTtl;

    public MediaStorageService(MediaStore store,
                               UploadSignature signatures,
                               @Value("${questlearn.media.max-video-bytes:104857600}") long maxVideoBytes,
                               @Value("${questlearn.media.upload-ttl-minutes:15}") long uploadTtlMinutes,
                               @Value("${questlearn.media.playback-ttl-minutes:60}") long playbackTtlMinutes) {
        this.store = store;
        this.signatures = signatures;
        this.maxVideoBytes = Math.max(1024, maxVideoBytes);
        this.uploadTtl = Duration.ofMinutes(Math.max(1, uploadTtlMinutes));
        this.playbackTtl = Duration.ofMinutes(Math.max(1, playbackTtlMinutes));
        log.info("Lesson videos are stored on {} (max {} MB)", store.description(),
                maxVideoBytes / (1024 * 1024));
    }

    public long maxVideoBytes() {
        return maxVideoBytes;
    }

    public String storageDescription() {
        return store.description();
    }

    /**
     * Saves one uploaded video through this server and returns the URL a lesson plays.
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

        String storedName = videoName(extension);
        try (InputStream input = file.getInputStream()) {
            store.put(storedName, input, file.getSize(), contentTypeOf(extension));
        } catch (IOException | UncheckedIOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "The video could not be saved. Check the storage settings and try again.");
        }
        log.info("Stored lesson video {} ({} MB) on {}", storedName,
                megabytes(file.getSize()), store.description());
        return PUBLIC_PREFIX + storedName;
    }

    /**
     * A one-shot place to put a file, so a 100 MB lesson need not pass through this
     * server. The ticket names the object and expires; it grants nothing else.
     */
    public UploadTicket beginUpload(String originalFilename, String contentType) {
        String extension = extensionOf(originalFilename);
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw ApiException.badRequest(
                    "Unsupported video format. Upload MP4, WebM, MOV, M4V or OGV, or attach a link.");
        }
        String name = videoName(extension);
        Instant expiresAt = Instant.now().plus(uploadTtl);
        String type = contentType == null || contentType.isBlank()
                ? contentTypeOf(extension)
                : contentType;

        String uploadUrl = store.signedUploadUrl(name, type, uploadTtl)
                .orElseGet(() -> UPLOAD_PREFIX + name
                        + "?expires=" + expiresAt.getEpochSecond()
                        + "&signature=" + signatures.sign(name, expiresAt));

        return new UploadTicket(name, uploadUrl, "PUT", Map.of("Content-Type", type),
                PUBLIC_PREFIX + name, expiresAt, maxVideoBytes);
    }

    /**
     * Takes the bytes of a signed disk upload. On a bucket the browser uploaded
     * directly, so this is never called there.
     */
    public void acceptUpload(String name, String signature, long expiresEpoch, String contentType,
                             long size, InputStream content) {
        if (storedNameOf(PUBLIC_PREFIX + name) == null) {
            throw ApiException.badRequest("That filename is not allowed.");
        }
        Instant expiresAt = Instant.ofEpochSecond(expiresEpoch);
        if (expiresAt.isBefore(Instant.now())) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "That upload link has expired. Choose the file again.");
        }
        if (!signatures.matches(name, expiresAt, signature)) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "That upload link is not valid. Choose the file again.");
        }
        if (size <= 0) {
            throw ApiException.badRequest("That file was empty.");
        }
        if (size > maxVideoBytes) {
            throw ApiException.badRequest("That video is " + megabytes(size)
                    + " MB. The limit is " + megabytes(maxVideoBytes) + " MB.");
        }
        store.put(name, content, size, contentType == null ? "application/octet-stream" : contentType);
        log.info("Accepted signed upload {} ({} MB) on {}", name, megabytes(size), store.description());
    }

    /**
     * Stores a bundled asset under a fixed name. Only the demo seed uses this: an
     * uploaded file always gets a random name.
     */
    public String storeNamed(String name, InputStream content, long size, String contentType) {
        if (storedNameOf(PUBLIC_PREFIX + name) == null) {
            throw ApiException.badRequest("That filename is not allowed.");
        }
        if (size > maxVideoBytes) {
            throw ApiException.badRequest("That video is " + megabytes(size)
                    + " MB. The limit is " + megabytes(maxVideoBytes) + " MB.");
        }
        store.put(name, content, size, contentType);
        return PUBLIC_PREFIX + name;
    }

    /** Whether a name issued by {@link #beginUpload} actually arrived. */
    public boolean existsStored(String name) {
        return storedNameOf(PUBLIC_PREFIX + name) != null && store.exists(name);
    }

    /** Removes a previously stored video; external links and anything unexpected are ignored. */
    public void deleteStored(String url) {
        String name = storedNameOf(url);
        if (name == null) {
            return;
        }
        store.delete(name);
        log.info("Deleted lesson video {}", name);
    }

    /** A short-lived play URL when the bucket needs one; empty when this server serves the file. */
    public Optional<String> signedPlaybackUrl(String name) {
        return store.signedPlaybackUrl(name, playbackTtl);
    }

    /** The file name if this URL points at a video we stored, otherwise null. */
    public static String storedNameOf(String url) {
        if (url == null || !url.startsWith(PUBLIC_PREFIX)) {
            return null;
        }
        String name = url.substring(PUBLIC_PREFIX.length());
        return SAFE_NAME.matcher(name).matches() ? name : null;
    }

    private static String videoName(String extension) {
        return UUID.randomUUID() + "." + extension;
    }

    /** What a browser needs to play a lesson: the format decides the header. */
    private static String contentTypeOf(String extension) {
        return switch (extension) {
            case "mp4", "m4v" -> "video/mp4";
            case "webm" -> "video/webm";
            case "mov" -> "video/quicktime";
            case "ogv" -> "video/ogg";
            default -> "application/octet-stream";
        };
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

    /** What the browser needs to upload a file directly, and where it will play from. */
    public record UploadTicket(String name, String uploadUrl, String method,
                               Map<String, String> headers, String mediaUrl,
                               Instant expiresAt, long maxBytes) {
    }
}
