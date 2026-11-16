package com.questlearn.util;

import java.util.Locale;

/**
 * One way to normalise an email address.
 *
 * <p>Lookups, the login lockout key, roster imports and password reset all compare
 * addresses, so they have to agree on the form. They were previously written out by
 * hand in six places and two of them lowercased without a locale, which turns "I"
 * into a dotless "ı" under a Turkish default locale and silently fails to match.</p>
 */
public final class Emails {

    private Emails() {
    }

    /** Trimmed and lowercased, or an empty string for null. */
    public static String normalise(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
