package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.dto.AnswerRequest;
import com.questlearn.dto.QuizDto;
import com.questlearn.model.Quiz;
import com.questlearn.model.QuizType;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuizServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final QuizService quizService = new QuizService(objectMapper);

    private Quiz quiz(QuizType type, String json) throws Exception {
        return Quiz.builder()
                .id(1L)
                .type(type)
                .passingScore(60)
                .payload(objectMapper.readTree(json))
                .build();
    }

    // ---------------------------------------------------------------- sanitize

    @Test
    void multipleChoiceResponsesNeverCarryTheAnswer() throws Exception {
        Quiz source = quiz(QuizType.MULTIPLE_CHOICE, """
                {"questions":[
                  {"id":"q1","prompt":"Pick one","options":["a","b"],"correctIndex":1,
                   "explanation":"b is right"}
                ]}""");

        QuizDto dto = quizService.sanitize(source);
        JsonNode question = dto.payload().path("questions").get(0);

        assertFalse(question.has("correctIndex"), "correctIndex must not reach the browser");
        assertFalse(question.has("explanation"), "explanation would give the answer away");
        assertTrue(question.has("prompt"));
        assertEquals(2, question.path("options").size());

        // The stored payload is untouched, so grading still works.
        assertTrue(source.getPayload().path("questions").get(0).has("correctIndex"));
    }

    @Test
    void codeOrderResponsesAreShuffledButKeepEveryLine() throws Exception {
        List<String> canonical = List.of("const a = 1;", "if (a) {", "  run();", "}");
        Quiz source = quiz(QuizType.CODE_ORDER, """
                {"prompt":"Order these","explanation":"hidden",
                 "lines":["const a = 1;","if (a) {","  run();","}"]}""");

        JsonNode payload = quizService.sanitize(source).payload();
        List<String> served = new ArrayList<>();
        payload.path("lines").forEach(node -> served.add(node.asText()));

        assertFalse(payload.has("explanation"));
        assertEquals(canonical.size(), served.size());
        assertEquals(canonical.stream().sorted().toList(), served.stream().sorted().toList(),
                "same lines, no edits");
        assertFalse(served.equals(canonical), "the solution order must not be served");
    }

    @Test
    void dragDropResponsesAreSplitIntoItemsAndTargets() throws Exception {
        Quiz source = quiz(QuizType.DRAG_DROP, """
                {"prompt":"Match","pairs":[
                  {"left":"flex","right":"one axis"},
                  {"left":"grid","right":"two axes"}
                ]}""");

        JsonNode payload = quizService.sanitize(source).payload();

        assertFalse(payload.has("pairs"));
        assertEquals(2, payload.path("items").size());
        assertEquals(2, payload.path("targets").size());
    }

    // ---------------------------------------------------------------- scoring

    @Test
    void multipleChoiceScoresByCorrectCount() throws Exception {
        Quiz source = quiz(QuizType.MULTIPLE_CHOICE, """
                {"questions":[
                  {"id":"q1","prompt":"a","options":["x","y"],"correctIndex":1},
                  {"id":"q2","prompt":"b","options":["x","y"],"correctIndex":0}
                ]}""");

        assertEquals(100, quizService.evaluate(source, List.of(
                new AnswerRequest("q1", 1, null, null),
                new AnswerRequest("q2", 0, null, null))));

        assertEquals(50, quizService.evaluate(source, List.of(
                new AnswerRequest("q1", 1, null, null),
                new AnswerRequest("q2", 1, null, null))));

        assertEquals(0, quizService.evaluate(source, List.of()));
    }

    @Test
    void codeOrderComparesAgainstTheStoredCanonicalOrder() throws Exception {
        Quiz source = quiz(QuizType.CODE_ORDER, """
                {"prompt":"Order","lines":["one","two","three","four"]}""");

        assertEquals(100, quizService.evaluate(source, List.of(
                new AnswerRequest(null, null, List.of("one", "two", "three", "four"), null))));

        assertEquals(50, quizService.evaluate(source, List.of(
                new AnswerRequest(null, null, List.of("one", "two", "four", "three"), null))));

        // A partial submission is not a guess that scores anything.
        assertEquals(0, quizService.evaluate(source, List.of(
                new AnswerRequest(null, null, List.of("one", "two"), null))));
    }

    @Test
    void dragDropScoresCompletePairs() throws Exception {
        Quiz source = quiz(QuizType.DRAG_DROP, """
                {"pairs":[{"left":"a","right":"1"},{"left":"b","right":"2"}]}""");

        assertEquals(100, quizService.evaluate(source, List.of(
                new AnswerRequest(null, null, null, Map.of("a", "1", "b", "2")))));

        assertEquals(50, quizService.evaluate(source, List.of(
                new AnswerRequest(null, null, null, Map.of("a", "1", "b", "9")))));

        assertEquals(0, quizService.evaluate(source, List.of()));
    }

    @Test
    void nodeWithoutAQuizStillCompletes() {
        Quiz noPayload = Quiz.builder().type(QuizType.MULTIPLE_CHOICE).passingScore(60).build();
        assertEquals(100, quizService.evaluate(noPayload, List.of()));
    }

    @Test
    void sanitizeOfMissingQuizIsNull() {
        assertNull(quizService.sanitize(null));
    }

    @Test
    void extractsExplanationsForMultipleChoiceAndSinglePayloads() throws Exception {
        Quiz mcq = quiz(QuizType.MULTIPLE_CHOICE, """
                {"questions":[
                  {"id":"q1","prompt":"P1","options":["a","b"],"explanation":"First explanation"},
                  {"id":"q2","prompt":"P2","options":["c","d"],"explanation":"Second explanation"},
                  {"id":"q3","prompt":"P3","options":["e","f"]}
                ]}""");
        List<String> mcqExps = quizService.explanations(mcq);
        assertEquals(List.of("First explanation", "Second explanation"), mcqExps);

        Quiz codeOrder = quiz(QuizType.CODE_ORDER, """
                {"prompt":"Order","lines":["a","b"],"explanation":"Lifecycle explanation"}""");
        assertEquals(List.of("Lifecycle explanation"), quizService.explanations(codeOrder));

        assertEquals(List.of(), quizService.explanations(null));
    }
}
