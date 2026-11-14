package com.questlearn.config;

import com.questlearn.service.media.DiskMediaStore;
import com.questlearn.service.media.MediaStore;
import com.questlearn.service.media.S3MediaStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Paths;

/**
 * Picks the media driver from configuration.
 *
 * <p>Disk is the default so a fresh clone works with no account at all. Selecting
 * {@code s3} without a bucket, region or key pair stops startup with a message that
 * names the missing variable, because a half-configured bucket fails silently on the
 * first teacher upload otherwise.</p>
 */
@Configuration
public class MediaStoreConfig {

    @Bean
    public MediaStore mediaStore(
            @Value("${questlearn.media.storage:disk}") String storage,
            @Value("${questlearn.media.video-dir:./uploads/videos}") String videoDirectory,
            @Value("${questlearn.media.s3.bucket:}") String bucket,
            @Value("${questlearn.media.s3.region:auto}") String region,
            @Value("${questlearn.media.s3.endpoint:}") String endpoint,
            @Value("${questlearn.media.s3.access-key:}") String accessKey,
            @Value("${questlearn.media.s3.secret-key:}") String secretKey,
            @Value("${questlearn.media.s3.path-style:false}") boolean pathStyle) {

        // Case matters: the two Spring conditions that pick the disk resource handler
        // and the bucket redirect match on this exact value, so a sloppy 'S3' must
        // stop here instead of leaving the deployment with the wrong pair.
        String kind = storage == null ? "disk" : storage.trim();
        if (!kind.equals("disk") && !kind.equals("s3")) {
            throw new IllegalStateException(
                    "questlearn.media.storage must be 'disk' or 's3', not '" + storage + "'.");
        }
        if (kind.equals("disk")) {
            return new DiskMediaStore(Paths.get(videoDirectory));
        }
        if (kind.equals("s3")) {
            require(bucket, "MEDIA_S3_BUCKET");
            require(accessKey, "MEDIA_S3_ACCESS_KEY");
            require(secretKey, "MEDIA_S3_SECRET_KEY");
            require(region, "MEDIA_S3_REGION");
            return new S3MediaStore(bucket.trim(), region.trim(), endpoint, accessKey.trim(),
                    secretKey.trim(), pathStyle);
        }
        return new S3MediaStore(bucket.trim(), region.trim(), endpoint, accessKey.trim(),
                secretKey.trim(), pathStyle);
    }

    private static void require(String value, String variable) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Media storage is set to s3 but " + variable + " is empty. Set the bucket, "
                            + "region and key pair, or set MEDIA_STORAGE=disk.");
        }
    }
}
