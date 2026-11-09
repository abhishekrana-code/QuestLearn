package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.GenerateCourseRequest;
import com.questlearn.dto.GeneratedCourseDto;
import com.questlearn.exception.ApiException;
import com.questlearn.exception.GroqAiException;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.Quiz;
import com.questlearn.model.QuizType;
import com.questlearn.model.User;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Drafts a complete quest (course + linked nodes + JSONB quizzes) from a topic
 * prompt using Groq.
 *
 * <p>Model output is treated as untrusted: strings are clamped to the column
 * widths, node counts are capped, prerequisites are restricted to earlier nodes
 * (so a cycle cannot be created) and every quiz is re-validated with
 * {@link QuizService} before it is persisted. Small shape variations
 * ({@code name} instead of {@code title}, an object instead of an array, option
 * objects instead of strings) are normalised rather than discarded, and one
 * corrective retry is made when a response comes back too thin to be a quest.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiAuthoringService {

    private static final int MAX_NODES = 8;
    private static final int DEFAULT_PASSING_SCORE = 70;

    private static final String SYSTEM_PROMPT = """
            You design gamified skill trees for an online course platform. Reply with a
            single JSON object and nothing else. Use exactly this shape:

            {
              "title": "short course title",
              "description": "2 sentences describing what the learner can do afterwards",
              "category": "one or two words",
              "emoji": "one emoji",
              "nodes": [
                {
                  "title": "short node title",
                  "summary": "one sentence shown on the skill tree",
                  "xpReward": 100,
                  "prerequisiteIndex": null,
                  "sections": [
                    {"heading": "short heading", "body": "3-4 sentences teaching the concept"}
                  ],
                  "keyTakeaways": ["short takeaway", "short takeaway"],
                  "quiz": {
                    "type": "MULTIPLE_CHOICE",
                    "questions": [
                      {
                        "id": "q1",
                        "prompt": "question text",
                        "options": ["option a", "option b", "option c", "option d"],
                        "correctIndex": 1,
                        "explanation": "why that answer is right"
                      }
                    ]
                  }
                }
              ]
            }

            Rules:
            - "nodes" is a JSON ARRAY with exactly the requested number of objects.
            - Every node has a non-empty "title".
            - Nodes are ordered from foundation to mastery; the first node has
              "prerequisiteIndex": null, every later node points at an earlier index.
            - 2 sections per node, 2-3 key takeaways, 2 multiple-choice questions per quiz.
            - xpReward between 80 and 200.
            - Teach real, accurate content. No filler and no placeholders.
            """;

    private final GroqAiService groqAiService;
    private final ObjectMapper objectMapper;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuizRepository quizRepository;
    private final UserRepository userRepository;
    private final QuizService quizService;
    private final AiQuotaService aiQuotaService;

    @Transactional
    public GeneratedCourseDto generate(GenerateCourseRequest request, AppUserPrincipal principal) {
        User instructor = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        aiQuotaService.consume(instructor.getId());

        int requestedNodes = Math.min(request.resolvedNodeCount(), MAX_NODES);
        JsonNode draft = normaliseDraft(groqAiService.generateJson(
                SYSTEM_PROMPT, userPrompt(request, requestedNodes, null)));

        List<String> warnings = new ArrayList<>();
        List<NodeDraft> nodes = parseNodes(draft, requestedNodes, warnings);

        // A response with one thin node is not a quest. One corrective retry fixes
        // the common transient failure without multiplying cost for good answers.
        if (nodes.size() < Math.min(2, requestedNodes)) {
            log.warn("AI course draft was too thin ({} usable nodes); retrying once", nodes.size());
            JsonNode retryDraft = normaliseDraft(groqAiService.generateJson(
                    SYSTEM_PROMPT,
                    userPrompt(request, requestedNodes, nodes.size())));
            List<String> retryWarnings = new ArrayList<>();
            List<NodeDraft> retryNodes = parseNodes(retryDraft, requestedNodes, retryWarnings);
            if (retryNodes.size() > nodes.size()) {
                draft = retryDraft;
                nodes = retryNodes;
                warnings = retryWarnings;
            }
        }

        if (nodes.isEmpty()) {
            log.warn("AI course draft had no usable nodes: {}",
                    abbreviate(draft == null ? "null" : draft.toString(), 1500));
            throw GroqAiException.upstream(
                    "The model did not return any usable skill nodes. Try a more specific topic.");
        }

        String title = clamp(text(draft.get("title")), 160);
        if (title.isEmpty()) {
            title = clamp(request.topic(), 160);
        }

        Course course = courseRepository.save(Course.builder()
                .title(title)
                .description(clamp(text(draft.get("description")), 1200))
                .category(clamp(firstNonBlank(text(draft.get("category")), request.category()), 60))
                .emoji(emoji(text(draft.get("emoji"))))
                .published(false)
                .instructor(instructor)
                .build());

        List<GeneratedCourseDto.NodeSummary> summaries = new ArrayList<>();
        List<Module> saved = new ArrayList<>();

        for (int index = 0; index < nodes.size(); index++) {
            NodeDraft node = nodes.get(index);
            Module parent = node.prerequisiteIndex() >= 0
                    && node.prerequisiteIndex() < saved.size()
                    ? saved.get(node.prerequisiteIndex())
                    : null;
            int positionX = parent == null ? 0 : parent.getPositionX() + 1;

            Module module = moduleRepository.save(Module.builder()
                    .title(node.title())
                    .summary(node.summary().isEmpty() ? null : node.summary())
                    .content(node.content())
                    .xpReward(node.xpReward())
                    .positionX(positionX)
                    .positionY(index)
                    .orderIndex(index)
                    .course(course)
                    .parentModule(parent)
                    .build());
            saved.add(module);

            QuizType quizType = null;
            if (node.quiz() != null) {
                quizRepository.save(Quiz.builder()
                        .module(module)
                        .type(node.quiz().type())
                        .passingScore(DEFAULT_PASSING_SCORE)
                        .payload(node.quiz().payload())
                        .build());
                quizType = node.quiz().type();
            }

            summaries.add(new GeneratedCourseDto.NodeSummary(
                    module.getId(),
                    module.getTitle(),
                    module.getXpReward(),
                    parent == null ? null : parent.getId(),
                    quizType));
        }

        log.info("AI generated course '{}' ({} nodes, {} warnings) for {}",
                course.getTitle(), saved.size(), warnings.size(), instructor.getEmail());

        return new GeneratedCourseDto(
                course.getId(),
                course.getTitle(),
                course.getDescription(),
                course.getCategory(),
                course.getEmoji(),
                saved.size(),
                summaries,
                warnings);
    }

    /**
     * Accepts the shapes models actually produce: a bare node array, or the whole
     * quest wrapped in an object such as {@code {"course": {...}}}.
     */
    private JsonNode normaliseDraft(JsonNode raw) {
        if (raw == null) {
            return null;
        }
        if (raw.isArray()) {
            ObjectNode wrapper = objectMapper.createObjectNode();
            wrapper.set("nodes", raw);
            return wrapper;
        }
        if (raw.isObject() && !raw.has("nodes")) {
            for (String key : List.of("course", "quest", "result", "data")) {
                JsonNode inner = raw.get(key);
                if (inner != null && inner.isObject()) {
                    return inner;
                }
            }
        }
        return raw;
    }

    private String userPrompt(GenerateCourseRequest request, int nodeCount, Integer previousAttempt) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Design a ").append(nodeCount).append("-node quest about: ")
                .append(request.topic().trim()).append('\n');
        prompt.append("Audience: ").append(request.resolvedAudience()).append('\n');
        if (request.category() != null && !request.category().isBlank()) {
            prompt.append("Preferred category: ").append(request.category().trim()).append('\n');
        }
        if (previousAttempt != null) {
            prompt.append("\nYour previous reply only contained ").append(previousAttempt)
                    .append(" usable node(s). Reply again with a single JSON OBJECT (not an array)"
                            + " containing a \"nodes\" ARRAY of exactly ")
                    .append(nodeCount).append(" objects, each with a non-empty \"title\", ")
                    .append("\"sections\", \"keyTakeaways\" and a \"quiz\" containing ")
                    .append("\"questions\".");
        } else {
            prompt.append("Return exactly ").append(nodeCount)
                    .append(" nodes in the JSON shape described in the system message.");
        }
        return prompt.toString();
    }

    /** Reads the model's node array tolerantly and reports what had to be dropped. */
    private List<NodeDraft> parseNodes(JsonNode draft, int requestedNodes, List<String> warnings) {
        List<NodeDraft> nodes = new ArrayList<>();
        JsonNode rawNodes = draft == null ? null : draft.path("nodes");

        List<JsonNode> candidates = new ArrayList<>();
        if (rawNodes != null && rawNodes.isArray()) {
            rawNodes.forEach(candidates::add);
        } else if (rawNodes != null && rawNodes.isObject()) {
            // Some replies use {"nodes": {"0": {...}, "1": {...}}}
            rawNodes.forEach(candidates::add);
        }

        for (int index = 0; index < candidates.size() && nodes.size() < requestedNodes; index++) {
            JsonNode nodeJson = candidates.get(index);
            if (!nodeJson.isObject()) {
                warnings.add("Node " + (index + 1) + " was ignored: it was not an object.");
                continue;
            }

            String title = clamp(firstNonBlank(
                    text(nodeJson.get("title")),
                    text(nodeJson.get("name")),
                    text(nodeJson.get("heading")),
                    text(nodeJson.get("topic"))), 160);
            if (title.isEmpty()) {
                warnings.add("Node " + (index + 1) + " was skipped: the model gave it no title.");
                continue;
            }

            String summary = clamp(firstNonBlank(
                    text(nodeJson.get("summary")),
                    text(nodeJson.get("description"))), 800);
            int xpReward = clampInt(nodeJson.path("xpReward").asInt(100), 50, 300);

            int prerequisiteIndex = nodeJson.path("prerequisiteIndex").isNumber()
                    ? nodeJson.path("prerequisiteIndex").asInt(-1)
                    : -1;

            ObjectNode content = buildContent(nodeJson, title, summary);
            QuizPayload quiz = normaliseQuiz(
                    nodeJson.has("quiz") ? nodeJson.get("quiz") : nodeJson.get("assessment"),
                    title, warnings);

            nodes.add(new NodeDraft(title, summary, xpReward, prerequisiteIndex, content, quiz));
        }

        if (nodes.size() < requestedNodes) {
            log.warn("AI course draft: asked for {} nodes, kept {}, warnings={}",
                    requestedNodes, nodes.size(), warnings);
        }
        return nodes;
    }

    /** Lesson sections, takeaways and a default boss-viva block for the node. */
    private ObjectNode buildContent(JsonNode nodeJson, String nodeTitle, String summary) {
        ObjectNode content = objectMapper.createObjectNode();

        ArrayNode sections = content.putArray("sections");
        for (JsonNode section : nodeJson.path("sections")) {
            String heading = clamp(firstNonBlank(
                    text(section.get("heading")), text(section.get("title"))), 120);
            String body = clamp(firstNonBlank(
                    text(section.get("body")), text(section.get("content")),
                    text(section.get("text"))), 2000);
            if (!heading.isEmpty() && !body.isEmpty()) {
                sections.addObject().put("heading", heading).put("body", body);
            }
        }

        ArrayNode takeaways = content.putArray("keyTakeaways");
        for (JsonNode takeaway : nodeJson.path("keyTakeaways")) {
            String value = clamp(text(takeaway), 240);
            if (!value.isEmpty()) {
                takeaways.add(value);
            }
        }

        ObjectNode viva = content.putObject("viva");
        viva.put("bossName", "The Warden");
        viva.put("openingQuestion",
                "Defend your understanding of \"" + nodeTitle + "\". "
                        + (summary.isEmpty() ? "Explain how it works and why it matters." : summary));
        ArrayNode topics = viva.putArray("topics");
        topics.add(nodeTitle);
        int topicCount = 0;
        for (JsonNode section : sections) {
            if (topicCount >= 3) {
                break;
            }
            topics.add(section.path("heading").asText());
            topicCount++;
        }
        viva.put("passThreshold", DEFAULT_PASSING_SCORE);
        viva.put("maxHp", 100);

        return content;
    }

    /** Sanitises a generated quiz; returns empty when nothing usable survived. */
    private QuizPayload normaliseQuiz(JsonNode quiz, String nodeTitle, List<String> warnings) {
        if (quiz == null || !quiz.isObject()) {
            return null;
        }

        QuizType type = quizType(text(quiz.get("type")));
        ObjectNode payload = objectMapper.createObjectNode();
        String prompt = clamp(text(quiz.get("prompt")), 400);
        if (!prompt.isEmpty()) {
            payload.put("prompt", prompt);
        }

        switch (type) {
            case MULTIPLE_CHOICE -> {
                JsonNode questionsRaw = quiz.has("questions") ? quiz.get("questions") : quiz.get("items");
                ArrayNode questions = payload.putArray("questions");
                for (JsonNode question : safeArray(questionsRaw)) {
                    String questionPrompt = clamp(firstNonBlank(
                            text(question.get("prompt")),
                            text(question.get("question")),
                            text(question.get("text"))), 400);
                    JsonNode optionsRaw = question.has("options")
                            ? question.get("options")
                            : question.get("choices");
                    List<String> options = optionTexts(optionsRaw);
                    int correctIndex = correctIndexFor(question, options);
                    if (questionPrompt.isEmpty() || options.size() < 2
                            || correctIndex < 0 || correctIndex >= options.size()) {
                        continue;
                    }
                    ObjectNode built = questions.addObject();
                    built.put("id", "q" + (questions.size()));
                    built.put("prompt", questionPrompt);
                    ArrayNode builtOptions = built.putArray("options");
                    options.forEach(option -> builtOptions.add(clamp(option, 300)));
                    built.put("correctIndex", correctIndex);
                    String explanation = clamp(text(question.get("explanation")), 400);
                    if (!explanation.isEmpty()) {
                        built.put("explanation", explanation);
                    }
                }
                if (questions.isEmpty()) {
                    warnings.add("\"" + nodeTitle + "\" kept its lesson but lost an unusable quiz.");
                    return null;
                }
            }
            case CODE_ORDER -> {
                ArrayNode lines = payload.putArray("lines");
                JsonNode linesRaw = quiz.has("lines") ? quiz.get("lines") : quiz.get("code");
                for (JsonNode line : safeArray(linesRaw)) {
                    String value = clamp(firstNonBlank(
                            text(line), text(line.get("line")), text(line.get("code"))), 300);
                    if (!value.isEmpty()) {
                        lines.add(value);
                    }
                }
                if (lines.size() < 2) {
                    warnings.add("\"" + nodeTitle + "\" kept its lesson but lost an unusable quiz.");
                    return null;
                }
            }
            case DRAG_DROP -> {
                ArrayNode pairs = payload.putArray("pairs");
                JsonNode pairsRaw = quiz.has("pairs") ? quiz.get("pairs") : quiz.get("matches");
                for (JsonNode pair : safeArray(pairsRaw)) {
                    String left = clamp(firstNonBlank(
                            text(pair.get("left")), text(pair.get("item")), text(pair.get("term"))), 200);
                    String right = clamp(firstNonBlank(
                            text(pair.get("right")), text(pair.get("target")),
                            text(pair.get("definition"))), 200);
                    if (!left.isEmpty() && !right.isEmpty()) {
                        pairs.addObject().put("left", left).put("right", right);
                    }
                }
                if (pairs.size() < 2) {
                    warnings.add("\"" + nodeTitle + "\" kept its lesson but lost an unusable quiz.");
                    return null;
                }
            }
            default -> {
                return null;
            }
        }

        try {
            quizService.validate(type, payload);
        } catch (ApiException ex) {
            warnings.add("\"" + nodeTitle + "\" kept its lesson but lost an unusable quiz ("
                    + ex.getMessage() + ").");
            return null;
        }
        return new QuizPayload(type, payload);
    }

    private List<String> optionTexts(JsonNode optionsRaw) {
        List<String> options = new ArrayList<>();
        for (JsonNode option : safeArray(optionsRaw)) {
            String value = option.isObject()
                    ? firstNonBlank(text(option.get("text")), text(option.get("label")),
                    text(option.get("value")), text(option.get("option")))
                    : text(option);
            if (!value.isEmpty()) {
                options.add(value);
            }
        }
        return options;
    }

    /** Accepts a 0-based index or the text of the correct option. */
    private int correctIndexFor(JsonNode question, List<String> options) {
        JsonNode indexNode = question.has("correctIndex")
                ? question.get("correctIndex")
                : question.get("answerIndex");
        if (indexNode != null && indexNode.isNumber()) {
            return indexNode.asInt(-1);
        }
        if (indexNode != null && indexNode.isTextual()) {
            try {
                return Integer.parseInt(indexNode.asText().trim());
            } catch (NumberFormatException ignored) {
                // fall through to matching the answer text
            }
        }

        String answer = firstNonBlank(
                text(question.get("correctAnswer")),
                text(question.get("answer")),
                text(question.get("correctOption")));
        for (int index = 0; index < options.size(); index++) {
            if (!answer.isEmpty() && options.get(index).equalsIgnoreCase(answer)) {
                return index;
            }
        }
        return -1;
    }

    private static List<JsonNode> safeArray(JsonNode node) {
        List<JsonNode> values = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(values::add);
        }
        return values;
    }

    private static QuizType quizType(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (value.contains("CODE") || value.contains("ORDER")) {
            return QuizType.CODE_ORDER;
        }
        if (value.contains("DRAG") || value.contains("MATCH") || value.contains("PAIR")) {
            return QuizType.DRAG_DROP;
        }
        return QuizType.MULTIPLE_CHOICE;
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? "" : node.asText("").trim();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    /** Truncates on code points so a surrogate pair is never split. */
    private static String clamp(String value, int maxCodePoints) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        int count = trimmed.codePointCount(0, trimmed.length());
        if (count <= maxCodePoints) {
            return trimmed;
        }
        return trimmed.substring(0, trimmed.offsetByCodePoints(0, maxCodePoints)).trim();
    }

    private static String emoji(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty() || value.codePointCount(0, value.length()) > 2) {
            return "🗺️";
        }
        return value;
    }

    private static int clampInt(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static String abbreviate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max) + "...";
    }

    private record NodeDraft(
            String title,
            String summary,
            int xpReward,
            int prerequisiteIndex,
            ObjectNode content,
            QuizPayload quiz
    ) {
    }

    private record QuizPayload(QuizType type, ObjectNode payload) {
    }
}
