package com.questlearn.service;

import com.questlearn.exception.ApiException;
import com.questlearn.service.media.DiskMediaStore;
import com.questlearn.service.media.UploadSignature;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaStorageServiceTest {

    @TempDir
    Path dir;

    private final UploadSignature signatures = new UploadSignature("test-secret-for-media-signatures");

    private MediaStorageService service(long maxBytes) {
        return new MediaStorageService(new DiskMediaStore(dir), signatures, maxBytes, 15, 60);
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

    @Test
    void aTicketUploadsStraightToTheServerAndPlaysFromTheStableUrl() throws Exception {
        MediaStorageService storage = service(10_000);

        var ticket = storage.beginUpload("lesson.mp4", "video/mp4");

        assertThat(ticket.name()).matches("[0-9a-f-]{36}\\.mp4");
        assertThat(ticket.uploadUrl()).startsWith(MediaStorageService.UPLOAD_PREFIX);
        assertThat(ticket.uploadUrl()).contains("expires=").contains("signature=");
        assertThat(ticket.mediaUrl()).isEqualTo(MediaStorageService.PUBLIC_PREFIX + ticket.name());
        assertThat(storage.existsStored(ticket.name())).isFalse();

        storage.acceptUpload(ticket.name(), ticket.uploadUrl().replaceAll(".*signature=", ""),
                ticket.expiresAt().getEpochSecond(), "video/mp4", 4096,
                new ByteArrayInputStream(new byte[4096]));

        assertThat(storage.existsStored(ticket.name())).isTrue();
        assertThat(Files.size(dir.resolve(ticket.name()))).isEqualTo(4096);
    }

    @Test
    void anExpiredOrForgedTicketCannotWriteAnything() {
        MediaStorageService storage = service(10_000);
        var ticket = storage.beginUpload("lesson.webm", "video/webm");
        String signature = signatures.sign(ticket.name(), ticket.expiresAt());
        Instant past = Instant.now().minusSeconds(60);

        assertThatThrownBy(() -> storage.acceptUpload(ticket.name(), signature,
                past.getEpochSecond(), "video/webm", 10, new ByteArrayInputStream(new byte[10])))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("expired");

        assertThatThrownBy(() -> storage.acceptUpload(ticket.name(), "deadbeef",
                ticket.expiresAt().getEpochSecond(), "video/webm", 10,
                new ByteArrayInputStream(new byte[10])))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("not valid");

        assertThat(storage.existsStored(ticket.name())).isFalse();
    }

    @Test
    void aTicketForAnotherFormatIsRefused() {
        MediaStorageService storage = service(10_000);

        assertThatThrownBy(() -> storage.beginUpload("installer.exe", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Unsupported video format");
    }
}
