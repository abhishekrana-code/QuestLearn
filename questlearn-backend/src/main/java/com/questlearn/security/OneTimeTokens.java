package com.questlearn.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * One way to mint and store the tokens that arrive by email, shared by password
 * reset and address verification so the two cannot drift apart.
 *
 * <p>A token is 32 random bytes in URL-safe base64. Only its SHA-256 hash is ever
 * written down, so a database dump cannot be replayed as a working link.</p>
 */
public final class OneTimeTokens {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private OneTimeTokens() {
    }

    public static String mint() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String sha256(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required by the platform", ex);
        }
    }
}
