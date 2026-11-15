package com.questlearn.config;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DemoPasswordTest {

    @Test
    void configuredPasswordWinsAndIsNotMarkedGenerated() {
        DemoPassword.Resolution resolution = DemoPassword.resolve("  from-the-env  ", true);

        assertEquals("from-the-env", resolution.password());
        assertFalse(resolution.generated());
        assertFalse(resolution.untouched());
    }

    @Test
    void freshDatabaseWithoutAConfiguredPasswordGetsAGeneratedOne() {
        DemoPassword.Resolution resolution = DemoPassword.resolve("", true);

        assertTrue(resolution.generated());
        assertTrue(resolution.password().length() >= 12);
    }

    @Test
    void existingDatabaseWithoutAConfiguredPasswordIsLeftAlone() {
        DemoPassword.Resolution resolution = DemoPassword.resolve(null, false);

        assertTrue(resolution.untouched(), "an unset DEMO_PASSWORD must never rewrite a live demo password");
        assertEquals(null, resolution.password());
    }

    @Test
    void generatedPasswordIsLongEnoughAndUsesReadableCharacters() {
        String password = DemoPassword.generate();

        assertEquals(14, password.length());
        assertTrue(password.matches("[abcdefghijkmnpqrstuvwxyz23456789]+"),
                "ambiguous characters would be mistyped when copied from a console");
    }

    @Test
    void generatedPasswordsDiffer() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 50; i += 1) {
            assertTrue(seen.add(DemoPassword.generate()), "two fresh databases got the same password");
        }
        assertNotEquals(seen.size(), 0);
    }
}
