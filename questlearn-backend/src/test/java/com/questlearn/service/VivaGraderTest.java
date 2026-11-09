package com.questlearn.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The examiner's reply is untrusted model output: scores can be out of range and
 * keys can be missing. The game must still record a sane verdict.
 */
class VivaGraderTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final VivaGrader grader = new VivaGrader();

    @Test
    void readsAFullVerdict() {
        ObjectNode verdict = objectMapper.createObjectNode();
        verdict.put("score", 85);
        verdict.put("verdict", "Solid answer.");
        verdict.putArray("strengths").add("Clear structure").add("Correct complexity");
        verdict.putArray("gaps").add("No cache locality discussion");
        verdict.put("feedback", "Name the exact operations next time.");
        verdict.put("followUpQuestion", "Why is appending O(1) amortised?");

        VivaGrader.VivaVerdict result = grader.parse(verdict, 70);

        assertThat(result.score()).isEqualTo(85);
        assertThat(result.passed()).isTrue();
        assertThat(result.verdict()).isEqualTo("Solid answer.");
        assertThat(result.strengths()).containsExactly("Clear structure", "Correct complexity");
        assertThat(result.gaps()).containsExactly("No cache locality discussion");
        assertThat(result.feedback()).isEqualTo("Name the exact operations next time.");
        assertThat(result.followUpQuestion()).isEqualTo("Why is appending O(1) amortised?");
    }

    @Test
    void clampsScoresAboveAndBelowTheRange() {
        ObjectNode high = objectMapper.createObjectNode().put("score", 143);
        ObjectNode negative = objectMapper.createObjectNode().put("score", -12);

        assertThat(grader.parse(high, 70).score()).isEqualTo(100);
        assertThat(grader.parse(high, 70).passed()).isTrue();
        assertThat(grader.parse(negative, 70).score()).isZero();
        assertThat(grader.parse(negative, 70).passed()).isFalse();
    }

    @Test
    void treatsTheThresholdAsInclusive() {
        ObjectNode verdict = objectMapper.createObjectNode().put("score", 70);

        assertThat(grader.parse(verdict, 70).passed()).isTrue();
        assertThat(grader.parse(verdict, 71).passed()).isFalse();
    }

    @Test
    void fallsBackWhenFieldsAreMissing() {
        VivaGrader.VivaVerdict result = grader.parse(objectMapper.createObjectNode(), 70);

        assertThat(result.score()).isZero();
        assertThat(result.passed()).isFalse();
        assertThat(result.verdict()).isNotBlank();
        assertThat(result.feedback()).isNotBlank();
        assertThat(result.strengths()).isEmpty();
        assertThat(result.gaps()).isEmpty();
    }

    @Test
    void survivesANullPayload() {
        VivaGrader.VivaVerdict result = grader.parse(null, 60);

        assertThat(result.score()).isZero();
        assertThat(result.passed()).isFalse();
    }

    @Test
    void promptIncludesTopicsThresholdAndTranscript() {
        var config = new com.questlearn.dto.VivaConfig(
                "The Warden",
                "Defend your design.",
                java.util.List.of("hash maps", "amortised cost"),
                70,
                100);

        String prompt = grader.buildPrompt(
                "Data Structures", "Hash Maps", config, "I would use a hash map because lookup is O(1).");

        assertThat(prompt)
                .contains("Data Structures")
                .contains("Hash Maps")
                .contains("- hash maps")
                .contains("- amortised cost")
                .contains("Defend your design.")
                .contains("Pass threshold: 70%")
                .contains("I would use a hash map because lookup is O(1).");
    }
}
