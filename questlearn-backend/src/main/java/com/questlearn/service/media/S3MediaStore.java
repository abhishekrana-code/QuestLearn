package com.questlearn.service.media;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

/**
 * Lesson videos in an S3-compatible bucket: AWS S3, Cloudflare R2 or MinIO.
 *
 * <p>The bucket is checked once at startup: a deployment that selects S3 and gets the
 * bucket or credentials wrong stops there with a sentence an operator can act on,
 * rather than failing on a teacher's first upload.</p>
 *
 * <p>Uploads and playback are both signed. The browser puts the file straight into
 * the bucket, so a 100 MB lesson never passes through this server, and playback is a
 * redirect to a short-lived signed GET, so a node's stored URL can stay stable while
 * the bucket stays private.</p>
 */
public class S3MediaStore implements MediaStore {

    private final S3Client client;
    private final S3Presigner presigner;
    private final String bucket;

    public S3MediaStore(String bucket, String region, String endpoint,
                        String accessKey, String secretKey, boolean pathStyle) {
        this.bucket = bucket;

        AwsBasicCredentials credentials = AwsBasicCredentials.create(accessKey, secretKey);
        var clientBuilder = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(credentials))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(pathStyle)
                        .build());
        var presignerBuilder = S3Presigner.builder()
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(credentials))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(pathStyle)
                        .build());
        if (endpoint != null && !endpoint.isBlank()) {
            URI uri = URI.create(endpoint.trim());
            clientBuilder.endpointOverride(uri);
            presignerBuilder.endpointOverride(uri);
        }
        this.client = clientBuilder.build();
        this.presigner = presignerBuilder.build();

        try {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (RuntimeException ex) {
            throw new IllegalStateException(
                    "Media storage is set to s3 but bucket '" + bucket + "' is not reachable ("
                            + ex.getMessage() + "). Check MEDIA_S3_BUCKET, MEDIA_S3_REGION, "
                            + "MEDIA_S3_ENDPOINT and the access key, or set MEDIA_STORAGE=disk.",
                    ex);
        }
    }

    @Override
    public void put(String name, InputStream content, long size, String contentType) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(name)
                .contentLength(size)
                .contentType(contentType)
                .build();
        client.putObject(request, RequestBody.fromInputStream(content, size));
    }

    @Override
    public boolean exists(String name) {
        try {
            client.headObject(HeadObjectRequest.builder().bucket(bucket).key(name).build());
            return true;
        } catch (NoSuchKeyException ex) {
            return false;
        } catch (S3Exception ex) {
            if (ex.statusCode() == 404) {
                return false;
            }
            throw ex;
        }
    }

    @Override
    public void delete(String name) {
        try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(name).build());
        } catch (S3Exception ignored) {
            // Deleting a missing object is not worth failing a lesson edit over.
        }
    }

    @Override
    public Optional<String> signedUploadUrl(String name, String contentType, Duration ttl) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(name)
                .contentType(contentType)
                .build();
        return Optional.of(presigner.presignPutObject(PutObjectPresignRequest.builder()
                        .signatureDuration(ttl)
                        .putObjectRequest(request)
                        .build())
                .url()
                .toString());
    }

    @Override
    public Optional<String> signedPlaybackUrl(String name, Duration ttl) {
        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(name)
                .build();
        return Optional.of(presigner.presignGetObject(GetObjectPresignRequest.builder()
                        .signatureDuration(ttl)
                        .getObjectRequest(request)
                        .build())
                .url()
                .toString());
    }

    @Override
    public String description() {
        return "S3 bucket " + bucket;
    }
}
