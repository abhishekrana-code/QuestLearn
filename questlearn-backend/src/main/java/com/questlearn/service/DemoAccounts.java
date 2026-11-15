package com.questlearn.service;

import java.util.List;

/**
 * The accounts the demo seeder creates, in one place because two callers need
 * them: the seeder that writes them and the console that rotates their shared
 * password.
 */
public final class DemoAccounts {

    public static final List<String> EMAILS = List.of(
            "admin@questlearn.dev",
            "instructor@questlearn.dev",
            "student@questlearn.dev",
            "mira@questlearn.dev",
            "sam@questlearn.dev");

    private DemoAccounts() {
    }
}
