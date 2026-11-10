package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaStorageServiceTest {

    @TempDir
    Path dir;

    private MediaStorageService service(long maxBytes) {
        return new MediaStorageService(dir.toString(), maxBytes);
    }

    private MockMultipartFile video(String name, int bytes) {
        return new MockMultipartFile("file", name, "video/mp4", new byte[bytes]);
    }

    @Test
    void storesAVideoUnderARandomNameAndReturnsItsUrl() {
        MediaStorageService storage = service(10_000);

        String url = storage.store(video("lesson one.mp4", 2048));

        assertThat(url).startsWith(MediaStorageService.PUBLIC_PREFIX);
        String name = MediaStorageService.storedNameOf(url);
        assertThat(name).isNotNull();
        assertThat(name).doesNotContain("lesson one").endsWith(".mp4");
        assertThat(Files.exists(dir.resolve(name))).isTrue();
    }

    @Test
    void theOriginalFilenameNeverReachesTheDisk() {
        MediaStorageService storage = service(10_000);

        String url = storage.store(video("../../evil name.MP4", 64));

        String name = MediaStorageService.storedNameOf(url);
        assertThat(name).isNotNull();
        assertThat(name).matches("[0-9a-f-]{36}\\.mp4");
        assertThat(dir.resolve(name).normalize().getParent()).isEqualTo(dir);
    }

    @Test
    void rejectsAnUnsupportedFormat() {
        MediaStorageService storage = service(10_000);

        assertThatThrownBy(() -> storage.store(video("payload.exe", 64)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Unsupported video format")
                .satisfies(error -> assertThat(((ApiException) error).getStatus())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void rejectsAnEmptyFileAndAnOversizeFile() {
        MediaStorageService storage = service(1024);

        assertThatThrownBy(() -> storage.store(video("clip.mp4", 0)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Choose a video file");

        assertThatThrownBy(() -> storage.store(video("clip.mp4", 4096)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("The limit is 1 MB");
    }

    @Test
    void deletingOnlyTouchesFilesItStored() {
        MediaStorageService storage = service(10_000);
        String url = storage.store(video("clip.webm", 128));
        String name = MediaStorageService.storedNameOf(url);

        // An external link and a traversal attempt must both be ignored.
        storage.deleteStored("https://cdn.example.com/lesson.mp4");
        storage.deleteStored(MediaStorageService.PUBLIC_PREFIX + "../application.properties");

        assertThat(Files.exists(dir.resolve(name))).isTrue();

        storage.deleteStored(url);
        assertThat(Files.exists(dir.resolve(name))).isFalse();
    }
}
