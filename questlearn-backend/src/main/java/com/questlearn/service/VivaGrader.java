package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.dto.VivaConfig;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Turns a Groq examination response into a verdict the gameplay layer can persist.
 *
 * <p>Kept free of repositories and HTTP so the grading contract (clamping,
 * defaults, partial responses) is unit-testable without a database or an API key.</p>
 */
@Component
public class VivaGrader {

    public static final String EXAMINER_SYSTEM_PROMPT = """
            You are The Warden, a strict but fair oral examiner for a computer science
            course. You receive a student's spoken answer transcript and the topics the
            viva covers. Grade only what the transcript actually shows.

            Reply with a single JSON object and nothing else, using exactly these keys:
            {
              "score": <number 0-100>,
              "verdict": <one sentence, in character>,
              "strengths": [<2-3 short strings>],
              "gaps": [<1-3 short strings>],
              "feedback": <2-3 sentences of actionable feedback>,
              "followUpQuestion": <one probing question>
            }

            Scoring guide: 90+ rigorous with correct terminology, 70-89 correct with minor
            imprecision, 40-69 partial or vague, below 40 wrong or off-topic.
            """;

    /** Grades a system-prompt reply; never throws on thin or missing fields. */
    public VivaVerdict parse(JsonNode verdict, int passThreshold) {
        int score = clampScore(verdict == null ? 0 : verdict.path("score").asDouble(0));
        boolean passed = score >= passThreshold;

        return new VivaVerdict(
                score,
                passed,
                textOr(verdict, "verdict",
                        passed ? "The Warden lowers its guard." : "The Warden is unconvinced."),
                stringList(verdict, "strengths"),
                stringList(verdict, "gaps"),
                textOr(verdict, "feedback",
                        "No examiner feedback came back. Answer again and be more specific."),
                textOr(verdict, "followUpQuestion", ""));
    }

    /** The user prompt handed to the examiner alongside the transcript. */
    public String buildPrompt(String courseTitle, String moduleTitle,
                              VivaConfig config, String transcript) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Course: ").append(courseTitle).append('\n');
        prompt.append("Node under examination: ").append(moduleTitle).append('\n');
        prompt.append("Topics this viva covers:\n");
        for (String topic : config.topics()) {
            prompt.append("- ").append(topic).append('\n');
        }

        prompt.append("\nQuestion asked:\n").append(config.openingQuestion()).append('\n');
        prompt.append("\nPass threshold: ").append(config.passThreshold()).append("%\n");
        prompt.append("\nStudent transcript:\n\"\"\"\n")
                .append(transcript)
                .append("\n\"\"\"\n");
        return prompt.toString();
    }

    private static int clampScore(double score) {
        if (!Double.isFinite(score)) {
            return 0;
        }
        return (int) Math.max(0, Math.min(100, Math.round(score)));
    }

    private static String textOr(JsonNode node, String field, String fallback) {
        String value = node == null ? "" : node.path(field).asText("").trim();
        return value.isEmpty() ? fallback : value;
    }

    private static List<String> stringList(JsonNode node, String field) {
        List<String> values = new ArrayList<>();
        JsonNode array = node == null ? null : node.path(field);
        if (array != null && array.isArray()) {
            for (JsonNode item : array) {
                String value = item.asText("").trim();
                if (!value.isEmpty()) {
                    values.add(value);
                }
            }
        }
        return values;
    }

    /** The examiner's verdict, as persisted and returned to the client. */
    public record VivaVerdict(
            int score,
            boolean passed,
            String verdict,
            List<String> strengths,
            List<String> gaps,
            String feedback,
            String followUpQuestion
    ) {
    }
}
