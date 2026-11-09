package com.questlearn.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.model.Module;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Configuration for a node's voice viva (boss battle).
 *
 * <p>Instructors can override it by adding a {@code viva} object to the node's
 * {@code content} JSONB:</p>
 * <pre>
 * {
 *   "sections": [{"heading": "...", "body": "..."}],
 *   "viva": {
 *     "bossName": "The Complexity Warden",
 *     "openingQuestion": "Defend why a hash map beats a sorted array here.",
 *     "topics": ["hash maps", "amortised cost"],
 *     "passThreshold": 70,
 *     "maxHp": 100
 *   }
 * }
 * </pre>
 *
 * <p>When that block is absent the viva still works: the examiner derives its
 * topics from the node's own lesson content, so every existing course gains a
 * boss battle without any authoring or migration.</p>
 */
public record VivaConfig(
        String bossName,
        String openingQuestion,
        List<String> topics,
        int passThreshold,
        int maxHp
) {

    private static final int DEFAULT_PASS_THRESHOLD = 70;
    private static final int DEFAULT_MAX_HP = 100;

    public static VivaConfig forModule(Module module) {
        JsonNode viva = module.getContent() == null ? null : module.getContent().path("viva");
        boolean authored = viva != null && viva.isObject();

        String bossName = authored ? text(viva.get("bossName")) : "";
        if (bossName.isEmpty()) {
            bossName = "The Warden";
        }

        String openingQuestion = authored ? text(viva.get("openingQuestion")) : "";
        if (openingQuestion.isEmpty()) {
            openingQuestion = defaultOpeningQuestion(module);
        }

        List<String> topics = authored ? strings(viva.get("topics")) : List.of();
        if (topics.isEmpty()) {
            topics = derivedTopics(module);
        }

        int passThreshold = DEFAULT_PASS_THRESHOLD;
        if (authored && viva.path("passThreshold").isNumber()) {
            passThreshold = clamp(viva.path("passThreshold").asInt(DEFAULT_PASS_THRESHOLD), 1, 100);
        }

        int maxHp = DEFAULT_MAX_HP;
        if (authored && viva.path("maxHp").isNumber()) {
            maxHp = clamp(viva.path("maxHp").asInt(DEFAULT_MAX_HP), 10, 10_000);
        }

        return new VivaConfig(bossName, openingQuestion, topics, passThreshold, maxHp);
    }

    private static String defaultOpeningQuestion(Module module) {
        String summary = module.getSummary() == null ? "" : module.getSummary().trim();
        if (summary.isEmpty()) {
            return "Talk me through \"" + module.getTitle()
                    + "\" as if I were a skeptical reviewer. Defend your reasoning.";
        }
        return "You claim you understand \"" + module.getTitle() + "\" - " + summary
                + " Explain the reasoning behind it, out loud.";
    }

    /** Falls back to the node's lesson structure so no course needs extra authoring. */
    private static List<String> derivedTopics(Module module) {
        Set<String> topics = new LinkedHashSet<>();
        topics.add(module.getTitle());

        JsonNode content = module.getContent();
        if (content != null) {
            for (JsonNode section : content.path("sections")) {
                String heading = text(section.get("heading"));
                if (!heading.isEmpty()) {
                    topics.add(heading);
                }
            }
            topics.addAll(strings(content.get("keyTakeaways")));
        }

        List<String> result = new ArrayList<>(topics);
        return result.size() > 6 ? result.subList(0, 6) : result;
    }

    private static List<String> strings(JsonNode array) {
        List<String> values = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode item : array) {
                String value = text(item);
                if (!value.isEmpty()) {
                    values.add(value);
                }
            }
        }
        return values;
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? "" : node.asText("").trim();
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
