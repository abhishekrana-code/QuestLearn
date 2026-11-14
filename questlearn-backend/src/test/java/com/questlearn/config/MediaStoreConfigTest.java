package com.questlearn.config;

import com.questlearn.service.media.DiskMediaStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaStoreConfigTest {

    @TempDir
    Path dir;

    private final MediaStoreConfig config = new MediaStoreConfig();

    @Test
    void diskIsTheDefaultAndNeedsNothingElse() {
        var store = config.mediaStore("disk", dir.toString(), "", "auto", "", "", "", false);

        assertThat(store).isInstanceOf(DiskMediaStore.class);
        assertThat(store.description()).contains("disk at");
    }

    @Test
    void selectingS3WithoutABucketStopsStartupWithTheMissingName() {
        assertThatThrownBy(() -> config.mediaStore("s3", dir.toString(), "", "auto", "", "", "", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MEDIA_S3_BUCKET")
                .hasMessageContaining("MEDIA_STORAGE=disk");
    }

    @Test
    void selectingS3WithoutKeysStopsStartupToo() {
        assertThatThrownBy(() -> config.mediaStore("s3", dir.toString(), "bucket", "auto", "", "", "", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MEDIA_S3_ACCESS_KEY");
    }

    @Test
    void anUnknownDriverIsRejected() {
        assertThatThrownBy(() -> config.mediaStore("ftp", dir.toString(), "", "auto", "", "", "", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be 'disk' or 's3'");
    }
}
