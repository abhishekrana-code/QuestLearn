package com.questlearn.service.media;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Optional;

/** Lesson videos on the application server's own disk: the default, no account needed. */
public class DiskMediaStore implements MediaStore {

    private final Path directory;

    public DiskMediaStore(Path directory) {
        this.directory = directory.toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.directory);
        } catch (IOException ex) {
            throw new IllegalStateException(
                    "Cannot create the video directory " + this.directory, ex);
        }
    }

    public Path directory() {
        return directory;
    }

    /** Rejects any name that would leave the directory, whatever the caller passed. */
    public Path resolve(String name) {
        Path target = directory.resolve(name).normalize();
        if (!target.startsWith(directory)) {
            throw new IllegalArgumentException("That filename is not allowed.");
        }
        return target;
    }

    @Override
    public void put(String name, InputStream content, long size, String contentType) {
        Path target = resolve(name);
        try {
            Files.copy(content, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not write " + target, ex);
        }
    }

    @Override
    public boolean exists(String name) {
        return Files.isRegularFile(resolve(name));
    }

    @Override
    public void delete(String name) {
        try {
            Files.deleteIfExists(resolve(name));
        } catch (IOException ignored) {
            // A stale file is harmless; never fail a lesson edit because of it.
        }
    }

    @Override
    public Optional<String> signedUploadUrl(String name, String contentType, Duration ttl) {
        // Disk uploads are signed by this server and streamed in by
        // MediaStorageService, so the driver never hands out a URL itself.
        return Optional.empty();
    }

    @Override
    public Optional<String> signedPlaybackUrl(String name, Duration ttl) {
        return Optional.empty();
    }

    @Override
    public String description() {
        return "disk at " + directory;
    }
}
