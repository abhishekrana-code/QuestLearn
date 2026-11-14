package com.questlearn.service.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Lets a browser upload a lesson video straight to this server without a login.
 *
 * <p>A {@code <video>} cannot send an Authorization header, and the same is true of a
 * plain PUT from a file picker, so the upload URL carries its own proof: the object
 * name and an expiry, signed with the deployment's secret. The signature covers the
 * name, so one ticket cannot be reused for another file, and the expiry keeps a
 * leaked URL from working tomorrow.</p>
 */
@Component
public class UploadSignature {

    private final byte[] secret;

    public UploadSignature(@Value("${questlearn.jwt.secret}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String sign(String name, Instant expiresAt) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] digest = mac.doFinal((name + "\n" + expiresAt.getEpochSecond())
                    .getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot sign an upload URL", ex);
        }
    }

    public boolean matches(String name, Instant expiresAt, String signature) {
        if (signature == null) {
            return false;
        }
        byte[] expected = sign(name, expiresAt).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, signature.getBytes(StandardCharsets.UTF_8));
    }
}
