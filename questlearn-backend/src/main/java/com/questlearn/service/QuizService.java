package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.questlearn.dto.AnswerRequest;
import com.questlearn.dto.QuizDto;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Quiz;
import com.questlearn.model.QuizType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Evaluates quiz submissions on the server so XP can never be farmed from the browser.
 *
 * <p>Supported JSONB contracts:</p>
 * <pre>
 * MULTIPLE_CHOICE: {"questions":[{"id":"q1","prompt":"...","options":["a","b"],
 *                                "correctIndex":0,"explanation":"..."}]}
 * CODE_ORDER:      {"prompt":"...","lines":["line 1","line 2"],"explanation":"..."}
 * DRAG_DROP:       {"prompt":"...","pairs":[{"left":"...","right":"..."}]}
 * </pre>
 */
@Service
@RequiredArgsConstructor
public class QuizService {

    private final ObjectMapper objectMapper;

    /** Strips correct answers before the quiz is sent to the browser. */
    public QuizDto sanitize(Quiz quiz) {
        if (quiz == null) {
            return null;
        }
        JsonNode source = quiz.getPayload() == null
                ? objectMapper.createObjectNode()
                : quiz.getPayload().deepCopy();

        if (quiz.getType() == QuizType.MULTIPLE_CHOICE && source instanceof ObjectNode root) {
            for (JsonNode question : root.path("questions")) {
                if (question instanceof ObjectNode node) {
                    node.remove("correctIndex");
                    node.remove("explanation");
                }
            }
        } else if (quiz.getType() == QuizType.CODE_ORDER && source instanceof ObjectNode root) {
            root.remove("explanation");
            if (root.path("lines") instanceof ArrayNode lines) {
                root.set("lines", scrambledLines(lines));
            }
        } else if (quiz.getType() == QuizType.DRAG_DROP && source instanceof ObjectNode root) {
            ArrayNode items = objectMapper.createArrayNode();
            ArrayNode targets = objectMapper.createArrayNode();
            root.path("pairs").forEach(pair -> {
                items.add(pair.path("left").asText());
                targets.add(pair.path("right").asText());
            });
            root.remove("pairs");
            root.set("items", items);
            root.set("targets", targets);
        }

        return new QuizDto(quiz.getId(), quiz.getType(), quiz.getPassingScore(), source);
    }

    /**
     * Returns the lines in a random order so the canonical solution never reaches the browser.
     * Grading still compares the submitted order against the order stored in JSONB.
     */
    private ArrayNode scrambledLines(ArrayNode canonical) {
        List<String> values = new ArrayList<>();
        canonical.forEach(line -> values.add(line.asText()));

        ArrayNode scrambled = objectMapper.createArrayNode();
        if (values.size() < 2) {
            values.forEach(scrambled::add);
            return scrambled;
        }

        List<String> solutionOrder = List.copyOf(values);
        Collections.shuffle(values);
        if (values.equals(solutionOrder)) {
            Collections.swap(values, 0, 1);
        }
        values.forEach(scrambled::add);
        return scrambled;
    }

    /** Validates an instructor supplied payload before it is persisted. */
    public void validate(QuizType type, JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw ApiException.badRequest("Quiz payload must be a JSON object");
        }

        switch (type) {
            case MULTIPLE_CHOICE -> {
                JsonNode questions = payload.path("questions");
                if (!questions.isArray() || questions.isEmpty()) {
                    throw ApiException.badRequest("Multiple-choice quiz needs at least one question");
                }
                for (JsonNode question : questions) {
                    if (!question.hasNonNull("prompt")) {
                        throw ApiException.badRequest("Every multiple-choice question needs a prompt");
                    }
                    JsonNode options = question.path("options");
                    if (!options.isArray() || options.size() < 2) {
                        throw ApiException.badRequest("Every question needs at least two options");
                    }
                    int correct = question.path("correctIndex").asInt(-1);
                    if (correct < 0 || correct >= options.size()) {
                        throw ApiException.badRequest("correctIndex must point at one of the options");
                    }
                }
            }
            case CODE_ORDER -> {
                JsonNode lines = payload.path("lines");
                if (!lines.isArray() || lines.size() < 2) {
                    throw ApiException.badRequest("Code-order quiz needs at least two lines");
                }
            }
            case DRAG_DROP -> {
                JsonNode pairs = payload.path("pairs");
                if (!pairs.isArray() || pairs.size() < 2) {
                    throw ApiException.badRequest("Drag-and-drop quiz needs at least two pairs");
                }
                for (JsonNode pair : pairs) {
                    if (!pair.hasNonNull("left") || !pair.hasNonNull("right")) {
                        throw ApiException.badRequest("Every pair needs a left and a right value");
                    }
                }
            }
            default -> throw ApiException.badRequest("Unsupported quiz type");
        }
    }

    /** @return score as a percentage (0-100). */
    public int evaluate(Quiz quiz, List<AnswerRequest> answers) {
        List<AnswerRequest> safeAnswers = answers == null ? List.of() : answers;
        JsonNode payload = quiz.getPayload();
        if (payload == null) {
            return 100;
        }

        return switch (quiz.getType()) {
            case MULTIPLE_CHOICE -> evaluateMultipleChoice(payload, safeAnswers);
            case CODE_ORDER -> evaluateCodeOrder(payload, safeAnswers);
            case DRAG_DROP -> evaluateDragDrop(payload, safeAnswers);
        };
    }

    private int evaluateMultipleChoice(JsonNode payload, List<AnswerRequest> answers) {
        ArrayNode questions = (ArrayNode) payload.path("questions");
        if (questions.isEmpty()) {
            return 100;
        }
        Map<String, AnswerRequest> byQuestion = new HashMap<>();
        for (AnswerRequest answer : answers) {
            if (answer.questionId() != null) {
                byQuestion.put(answer.questionId(), answer);
            }
        }
        int correct = 0;
        for (JsonNode question : questions) {
            AnswerRequest answer = byQuestion.get(question.path("id").asText());
            if (answer != null && answer.selectedIndex() != null
                    && answer.selectedIndex() == question.path("correctIndex").asInt(-1)) {
                correct++;
            }
        }
        return percentage(correct, questions.size());
    }

    private int evaluateCodeOrder(JsonNode payload, List<AnswerRequest> answers) {
        JsonNode lines = payload.path("lines");
        if (lines.isEmpty()) {
            return 100;
        }
        AnswerRequest answer = answers.isEmpty() ? null : answers.get(0);
        if (answer == null || answer.order() == null || answer.order().size() != lines.size()) {
            return 0;
        }
        int correct = 0;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).asText().equals(answer.order().get(i))) {
                correct++;
            }
        }
        return percentage(correct, lines.size());
    }

    private int evaluateDragDrop(JsonNode payload, List<AnswerRequest> answers) {
        JsonNode pairs = payload.path("pairs");
        if (pairs.isEmpty()) {
            return 100;
        }
        AnswerRequest answer = answers.isEmpty() ? null : answers.get(0);
        Map<String, String> matches = answer == null || answer.matches() == null
                ? Map.of()
                : answer.matches();

        int correct = 0;
        for (JsonNode pair : pairs) {
            String left = pair.path("left").asText();
            String right = pair.path("right").asText();
            if (right.equals(matches.get(left))) {
                correct++;
            }
        }
        return percentage(correct, pairs.size());
    }

    /**
     * Extracts pedagogical explanations from the canonical quiz payload so they
     * can be shown to the learner after their attempt is evaluated.
     */
    public List<String> explanations(Quiz quiz) {
        if (quiz == null || quiz.getPayload() == null) {
            return List.of();
        }
        List<String> list = new ArrayList<>();
        JsonNode payload = quiz.getPayload();
        if (quiz.getType() == QuizType.MULTIPLE_CHOICE) {
            JsonNode questions = payload.path("questions");
            if (questions.isArray()) {
                for (JsonNode q : questions) {
                    String exp = q.path("explanation").asText("").trim();
                    if (!exp.isEmpty()) {
                        list.add(exp);
                    }
                }
            }
        } else {
            String exp = payload.path("explanation").asText("").trim();
            if (!exp.isEmpty()) {
                list.add(exp);
            }
        }
        return list;
    }

    private int percentage(int correct, int total) {
        if (total <= 0) {
            return 100;
        }
        return Math.round(correct * 100f / total);
    }
}
