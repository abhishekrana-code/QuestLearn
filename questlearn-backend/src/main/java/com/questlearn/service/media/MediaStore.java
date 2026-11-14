package com.questlearn.service.media;

import java.io.InputStream;
import java.time.Duration;
import java.util.Optional;

/**
 * Where lesson videos actually live.
 *
 * <p>Two drivers implement this: the application server's disk, which needs no
 * account and is the default, and any S3-compatible bucket (AWS S3, Cloudflare R2,
 * MinIO), selected by configuration. Everything above this interface sees one
 * stable URL shape and one set of rules, so switching storage never changes a node's
 * lesson content.</p>
 */
public interface MediaStore {

    /** Stores one object. The caller has already checked size and format. */
    void put(String name, InputStream content, long size, String contentType);

    boolean exists(String name);

    void delete(String name);

    /**
     * A URL the browser may upload to directly, when the driver can sign one.
     *
     * @return empty when uploads must go through this server (disk)
     */
    Optional<String> signedUploadUrl(String name, String contentType, Duration ttl);

    /**
     * A short-lived URL the browser may play from.
     *
     * @return empty when the driver's objects are already served through this server
     */
    Optional<String> signedPlaybackUrl(String name, Duration ttl);

    /** One line for the startup log, so an operator can see where files went. */
    String description();
}
