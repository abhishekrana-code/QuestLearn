package com.questlearn;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.Quiz;
import com.questlearn.model.QuizType;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end checks against a real PostgreSQL database.
 *
 * <p>H2 would not catch JSONB, Flyway or constraint drift, so this suite runs the
 * production schema. It is skipped unless {@code IT_DB_URL} is set, which keeps
 * {@code mvn verify} green on a machine without PostgreSQL.</p>
 *
 * <p>Every test creates its own instructor, course, two linked nodes and a quiz;
 * nothing here depends on the demo seeder or its ids.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("it")
@EnabledIfEnvironmentVariable(named = "IT_DB_URL", matches = ".+")
class QuestLearnApiIntegrationTest {

    private static final String PASSWORD = "it-password-123";
    private static final String STUDENT_CODE = "TEST-CODE-1234";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private UserRepository users;

    @Autowired
    private CourseRepository courses;

    @Autowired
    private ModuleRepository modules;

    @Autowired
    private QuizRepository quizzes;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User instructor;
    private User student;
    private Course course;
    private Course draft;
    private Module root;
    private Module child;
    private String studentToken;

    @BeforeEach
    void seed() throws Exception {
        // The suite owns the whole database, so start from nothing every time.
        jdbc.execute("TRUNCATE TABLE module_attempts, user_module_progress, quizzes, modules, "
                + "courses, users RESTART IDENTITY CASCADE");

        instructor = users.save(User.builder()
                .name("Teacher")
                .email("teacher@it.test")
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(Role.INSTRUCTOR)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .build());

        student = users.save(User.builder()
                .name("Learner")
                .email("learner@it.test")
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(Role.STUDENT)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .build());

        course = courses.save(Course.builder()
                .title("Integration Quest")
                .description("Two linked nodes for the API suite.")
                .category("Testing")
                .emoji("🧪")
                .published(true)
                .instructor(instructor)
                .build());

        draft = courses.save(Course.builder()
                .title("Unpublished Quest")
                .description("Should stay invisible to students.")
                .category("Testing")
                .emoji("🔒")
                .published(false)
                .instructor(instructor)
                .build());

        JsonNode content = json.readTree("""
                {"sections":[{"heading":"Why it matters","body":"Because tests catch drift."}]}""");

        root = modules.save(Module.builder()
                .title("Root node")
                .summary("The first node.")
                .content(content)
                .xpReward(100)
                .positionX(0)
                .positionY(0)
                .orderIndex(0)
                .course(course)
                .build());

        child = modules.save(Module.builder()
                .title("Child node")
                .summary("Unlocked by the root.")
                .content(content)
                .xpReward(120)
                .positionX(1)
                .positionY(1)
                .orderIndex(1)
                .course(course)
                .parentModule(root)
                .build());

        quizzes.save(Quiz.builder()
                .module(root)
                .type(QuizType.MULTIPLE_CHOICE)
                .passingScore(60)
                .payload(json.readTree("""
                        {"questions":[{"id":"q1","prompt":"Which one is semantic?",
                          "options":["<div>","<article>"],"correctIndex":1,
                          "explanation":"article describes meaning"}]}"""))
                .build());

        studentToken = login("learner@it.test");
    }

    // ---------------------------------------------------------------- helpers

    private String login(String email) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                java.util.Map.of("email", email, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString()).path("token").asText();
    }

    private MvcResult complete(String token, long moduleId, int selectedIndex) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of(
                "answers", java.util.List.of(java.util.Map.of(
                        "questionId", "q1", "selectedIndex", selectedIndex))));
        return mvc.perform(post("/api/v1/modules/" + moduleId + "/complete")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
    }

    private JsonNode skillTree() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/courses/" + course.getId() + "/skill-tree")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode node(JsonNode tree, String title) {
        for (JsonNode node : tree.path("nodes")) {
            if (title.equals(node.path("title").asText())) {
                return node;
            }
        }
        throw new AssertionError("No node titled " + title + " in the skill tree");
    }

    // ------------------------------------------------------------ registration

    @Test
    void studentSignUpNeedsTheInstitutionCode() throws Exception {
        String wrong = json.writeValueAsString(java.util.Map.of(
                "name", "Wrong Code", "email", "wrong@it.test", "password", "secret123",
                "role", "STUDENT", "inviteCode", "not-the-code"));

        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON).content(wrong))
                .andExpect(status().isForbidden());

        String right = json.writeValueAsString(java.util.Map.of(
                "name", "Right Code", "email", "right@it.test", "password", "secret123",
                "role", "STUDENT", "inviteCode", STUDENT_CODE));

        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON).content(right))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.role").value("STUDENT"));

        assertThat(users.findByEmailIgnoreCase("wrong@it.test")).isEmpty();
        assertThat(users.findByEmailIgnoreCase("right@it.test")).isPresent();
    }

    @Test
    void loginIssuesATokenAndMeRequiresOne() throws Exception {
        assertThat(studentToken).isNotBlank();

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("learner@it.test"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------- progression

    @Test
    void theSkillTreeStartsWithRootUnlockedAndChildLocked() throws Exception {
        JsonNode tree = skillTree();

        assertThat(node(tree, "Root node").path("status").asText()).isEqualTo("UNLOCKED");
        assertThat(node(tree, "Child node").path("status").asText()).isEqualTo("LOCKED");
    }

    @Test
    void aLockedChildCannotBeCompleted() throws Exception {
        skillTree(); // creates the progress rows

        MvcResult result = complete(studentToken, child.getId(), 1);

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
        assertThat(users.findById(student.getId()).orElseThrow().getTotalXp()).isZero();
        assertThat(node(skillTree(), "Child node").path("status").asText()).isEqualTo("LOCKED");
    }

    @Test
    void wrongAnswersAwardNothing() throws Exception {
        skillTree();

        MvcResult result = complete(studentToken, root.getId(), 0);

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = json.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("passed").asBoolean()).isFalse();
        assertThat(body.path("score").asInt()).isZero();
        assertThat(body.path("xpGained").asInt()).isZero();
        assertThat(body.path("newTotalXp").asInt()).isZero();

        assertThat(users.findById(student.getId()).orElseThrow().getTotalXp()).isZero();
        assertThat(node(skillTree(), "Root node").path("status").asText()).isEqualTo("UNLOCKED");
    }

    @Test
    void correctAnswersAwardXpAndUnlockTheChild() throws Exception {
        skillTree();

        MvcResult result = complete(studentToken, root.getId(), 1);

        JsonNode body = json.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("passed").asBoolean()).isTrue();
        assertThat(body.path("score").asInt()).isEqualTo(100);
        assertThat(body.path("xpGained").asInt()).isEqualTo(100);
        assertThat(body.path("unlockedModuleIds").toString()).contains(String.valueOf(child.getId()));

        User reloaded = users.findById(student.getId()).orElseThrow();
        assertThat(reloaded.getTotalXp()).isEqualTo(100);

        JsonNode tree = skillTree();
        assertThat(node(tree, "Root node").path("status").asText()).isEqualTo("COMPLETED");
        assertThat(node(tree, "Child node").path("status").asText()).isEqualTo("UNLOCKED");
    }

    @Test
    void replayingAClearedNodeKeepsTheBestScoreAndPaysNoSecondXp() throws Exception {
        skillTree();
        complete(studentToken, root.getId(), 1);

        MvcResult replay = complete(studentToken, root.getId(), 0);
        JsonNode body = json.readTree(replay.getResponse().getContentAsString());

        assertThat(body.path("xpGained").asInt()).isZero();
        assertThat(body.path("newTotalXp").asInt()).isEqualTo(100);
        assertThat(body.path("passed").asBoolean()).isFalse();

        User reloaded = users.findById(student.getId()).orElseThrow();
        assertThat(reloaded.getTotalXp()).isEqualTo(100);

        JsonNode rootNode = node(skillTree(), "Root node");
        assertThat(rootNode.path("score").asInt()).isEqualTo(100);
        assertThat(rootNode.path("status").asText()).isEqualTo("COMPLETED");
    }

    @Test
    void moduleDetailNeverShipsTheAnswers() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/modules/" + root.getId())
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andReturn();

        String payload = result.getResponse().getContentAsString();
        assertThat(payload).doesNotContain("correctIndex");
        assertThat(payload).doesNotContain("explanation");
        assertThat(payload).contains("Which one is semantic?");

        // The stored payload still has them, so grading is unaffected.
        Quiz stored = quizzes.findByModuleId(root.getId()).orElseThrow();
        assertThat(stored.getPayload().path("questions").get(0).has("correctIndex")).isTrue();
    }

    // ------------------------------------------------------------ permissions

    @Test
    void aStudentCannotUseInstructorOrAdminEndpoints() throws Exception {
        String newCourse = json.writeValueAsString(java.util.Map.of(
                "title", "Student Course", "description", "nope"));

        mvc.perform(post("/api/v1/courses")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(newCourse))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/admin/users")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void anUnpublishedCourseIsInvisibleToStudents() throws Exception {
        mvc.perform(get("/api/v1/courses/" + draft.getId())
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/courses/" + draft.getId() + "/skill-tree")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());

        // The published one is fine, and the list only shows what they may read.
        mvc.perform(get("/api/v1/courses").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.title == 'Integration Quest')]").exists())
                .andExpect(jsonPath("$[?(@.title == 'Unpublished Quest')]").doesNotExist());
    }
}
