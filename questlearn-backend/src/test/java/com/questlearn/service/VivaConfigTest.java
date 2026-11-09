package com.questlearn.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.dto.VivaConfig;
import com.questlearn.model.Module;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every node must be able to run a viva, including courses authored before the
 * feature existed, so the fallback derivation is the important case here.
 */
class VivaConfigTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void derivesTopicsFromLessonSectionsWhenNoneAreAuthored() throws Exception {
        Module module = moduleWith("""
                {
                  "sections": [
                    {"heading": "The event loop", "body": "Promises queue microtasks."},
                    {"heading": "Always check response.ok", "body": "fetch resolves on 500."}
                  ],
                  "keyTakeaways": ["Async errors are silent unless caught"]
                }
                """);

        VivaConfig config = VivaConfig.forModule(module);

        assertThat(config.bossName()).isEqualTo("The Warden");
        assertThat(config.topics())
                .contains("JavaScript Essentials")
                .contains("The event loop")
                .contains("Always check response.ok")
                .contains("Async errors are silent unless caught");
        assertThat(config.topics()).hasSizeLessThanOrEqualTo(6);
        assertThat(config.passThreshold()).isEqualTo(70);
        assertThat(config.maxHp()).isEqualTo(100);
        assertThat(config.openingQuestion()).contains("JavaScript Essentials");
    }

    @Test
    void usesTheAuthoredBlockAndClampsItsNumbers() throws Exception {
        Module module = moduleWith("""
                {
                  "sections": [{"heading": "Ignored heading", "body": "text"}],
                  "viva": {
                    "bossName": "The Complexity Warden",
                    "openingQuestion": "Defend why a hash map beats a sorted array.",
                    "topics": ["hash maps", "amortised cost"],
                    "passThreshold": 250,
                    "maxHp": 80
                  }
                }
                """);

        VivaConfig config = VivaConfig.forModule(module);

        assertThat(config.bossName()).isEqualTo("The Complexity Warden");
        assertThat(config.openingQuestion()).isEqualTo("Defend why a hash map beats a sorted array.");
        assertThat(config.topics()).containsExactly("hash maps", "amortised cost");
        assertThat(config.passThreshold()).isEqualTo(100);
        assertThat(config.maxHp()).isEqualTo(80);
    }

    @Test
    void worksForANodeWithoutContent() {
        Module module = Module.builder()
                .title("Deploy the Final Boss")
                .summary("Wire configuration, secrets and production builds together.")
                .build();

        VivaConfig config = VivaConfig.forModule(module);

        assertThat(config.bossName()).isNotBlank();
        assertThat(config.topics()).containsExactly("Deploy the Final Boss");
        assertThat(config.openingQuestion()).contains("Deploy the Final Boss");
    }

    private Module moduleWith(String contentJson) throws Exception {
        return Module.builder()
                .title("JavaScript Essentials")
                .summary("Async data, promises and the fetch lifecycle.")
                .content(objectMapper.readTree(contentJson))
                .build();
    }
}
