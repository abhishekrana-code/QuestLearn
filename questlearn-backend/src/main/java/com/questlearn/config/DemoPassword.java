package com.questlearn.config;

import java.security.SecureRandom;

/**
 * The password the demo accounts get when {@code DEMO_PASSWORD} is not set.
 *
 * <p>A published default is a stranger's way in on any machine that can be
 * reached, so a fresh database now gets a random one, printed once at first
 * start. The alphabet leaves out characters that are easy to misread aloud or
 * mistype (0/O, 1/l/I), because the value is meant to be copied off a console.
 */
public final class DemoPassword {

    private static final String ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
    private static final int LENGTH = 14;
    private static final SecureRandom RANDOM = new SecureRandom();

    private DemoPassword() {
    }

    /**
     * What the demo accounts should get on this start.
     *
     * @param password the value to use, or null when existing rows must be left alone
     * @param generated true when this value was just made up for a new database
     */
    public record Resolution(String password, boolean generated) {
        public boolean untouched() {
            return password == null;
        }
    }

    public static Resolution resolve(String configured, boolean freshDatabase) {
        if (configured != null && !configured.isBlank()) {
            return new Resolution(configured.trim(), false);
        }
        if (freshDatabase) {
            return new Resolution(generate(), true);
        }
        return new Resolution(null, false);
    }

    public static String generate() {
        StringBuilder password = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i += 1) {
            password.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return password.toString();
    }
}
