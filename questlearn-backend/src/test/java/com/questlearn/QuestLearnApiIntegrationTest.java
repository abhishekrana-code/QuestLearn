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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
    private User admin;
    private Course course;
    private Course draft;
    private Module root;
    private Module child;
    private String studentToken;

    @BeforeEach
    void seed() throws Exception {
        // The suite owns the whole database, so start from nothing every time.
        jdbc.execute("TRUNCATE TABLE admin_audit_log, cohort_memberships, cohorts, enrollments, "
                + "module_attempts, user_module_progress, quizzes, modules, courses, users "
                + "RESTART IDENTITY CASCADE");

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

        admin = users.save(User.builder()
                .name("Registrar")
                .email("admin@it.test")
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(Role.ADMIN)
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
        return skillTree(studentToken);
    }

    private JsonNode skillTree(String token) throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/courses/" + course.getId() + "/skill-tree")
                        .header("Authorization", "Bearer " + token))
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
    void aMissingRequiredQueryParameterIsABadRequest() throws Exception {
        String token = login("teacher@it.test");

        mvc.perform(patch("/api/v1/courses/" + course.getId() + "/publish")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Required parameter 'published' is missing"));
    }

    // --------------------------------------------------- sessions and auditing

    @Test
    void changingYourPasswordKeepsThisBrowserAndRevokesTheOthers() throws Exception {
        String oldToken = login("learner@it.test");

        MvcResult result = mvc.perform(patch("/api/v1/auth/password")
                        .header("Authorization", "Bearer " + oldToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of(
                                "currentPassword", PASSWORD,
                                "newPassword", "a-different-password"))))
                .andExpect(status().isOk())
                .andReturn();

        String freshToken = json.readTree(result.getResponse().getContentAsString())
                .path("token").asText();

        // The token that made the change is replaced by the response token.
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + oldToken))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + freshToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("learner@it.test"));
    }

    @Test
    void aTeacherCanResetOneNodeInTheirOwnCourse() throws Exception {
        String teacherToken = login("teacher@it.test");
        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk());
        skillTree();
        complete(studentToken, root.getId(), 1);

        mvc.perform(delete("/api/v1/admin/users/" + student.getId() + "/modules/" + root.getId()
                        + "/progress")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalXp").value(0));

        // The node is open again and the XP is gone, not doubled back.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster/" + student.getId())
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clearedNodes").value(0))
                .andExpect(jsonPath("$.nodes[0].status").value("UNLOCKED"))
                .andExpect(jsonPath("$.nodes[0].attempts").value(0));

        mvc.perform(delete("/api/v1/admin/users/" + student.getId() + "/modules/" + root.getId()
                        + "/progress")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void anAdminPasswordResetRevokesLiveSessions() throws Exception {
        String adminToken = login("admin@it.test");
        String liveToken = login("learner@it.test");

        mvc.perform(post("/api/v1/admin/users/" + student.getId() + "/reset-password")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + liveToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void roleChangesTakeEffectOnTheNextRequest() throws Exception {
        String adminToken = login("admin@it.test");
        String studentLiveToken = login("learner@it.test");

        mvc.perform(patch("/api/v1/admin/users/" + student.getId() + "/role")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("role", "INSTRUCTOR"))))
                .andExpect(status().isOk());

        // The token still says STUDENT; the server reads the live role instead.
        mvc.perform(get("/api/v1/admin/users")
                        .header("Authorization", "Bearer " + studentLiveToken))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/courses")
                        .header("Authorization", "Bearer " + studentLiveToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of(
                                "title", "Promoted", "description", "Now a teacher."))))
                .andExpect(status().isCreated());
    }

    @Test
    void privilegedActionsAreRecordedInTheAuditTrail() throws Exception {
        String adminToken = login("admin@it.test");

        mvc.perform(patch("/api/v1/admin/users/" + student.getId() + "/role")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("role", "INSTRUCTOR"))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/admin/users/" + student.getId() + "/reset-password")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/admin/audit").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'user.role_changed')]").exists())
                .andExpect(jsonPath("$[?(@.action == 'user.password_reset')]").exists())
                .andExpect(jsonPath("$[?(@.actorEmail == 'admin@it.test')]").exists());
    }

    @Test
    void adminUserSearchMatchesNameOrEmail() throws Exception {
        String adminToken = login("admin@it.test");

        mvc.perform(get("/api/v1/admin/users").param("query", "learn")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.users[0].email").value("learner@it.test"));

        mvc.perform(get("/api/v1/admin/users").param("query", "TEACHER@")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.users[0].email").value("teacher@it.test"));
    }

    @Test
    void theAccountListIsPagedRatherThanWhole() throws Exception {
        String adminToken = login("admin@it.test");
        // Three fixture accounts: registrar, teacher, learner.
        mvc.perform(get("/api/v1/admin/users").param("page", "0").param("size", "2")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(2))
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.users[0].email").value("teacher@it.test"));

        mvc.perform(get("/api/v1/admin/users").param("page", "1").param("size", "2")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.users[0].email").value("admin@it.test"));

        // An absurd size is clamped instead of honoured.
        mvc.perform(get("/api/v1/admin/users").param("size", "100000")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(100));
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

    // ------------------------------------------------------------- enrollment

    @Test
    void joiningIsIdempotentAndShowsUpAsMyCourse() throws Exception {
        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(true))
                .andExpect(jsonPath("$.enrolledCount").value(1));

        // A second click, or a second tab, must not duplicate the roster row.
        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolledCount").value(1));

        mvc.perform(get("/api/v1/courses/mine").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("Integration Quest"));

        // The catalogue marks it too, so the card can say "Continue".
        mvc.perform(get("/api/v1/courses/" + course.getId())
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(true));
        mvc.perform(get("/api/v1/courses").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.enrolled == true)]").exists());

        mvc.perform(delete("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/courses/mine").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void theRosterCountIsVisibleToTheCourseOwner() throws Exception {
        String teacherToken = login("teacher@it.test");

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/courses/" + course.getId())
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(false))
                .andExpect(jsonPath("$.enrolledCount").value(1));
    }

    @Test
    void theRosterShowsWhoJoinedWithTheirPerNodeProgress() throws Exception {
        String teacherToken = login("teacher@it.test");

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk());

        // Opening the tree creates the progress rows; clearing the root gives the
        // roster a completed node and an unlocked child to report.
        skillTree();
        complete(studentToken, root.getId(), 1);

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.moduleCount").value(2))
                .andExpect(jsonPath("$.learners.length()").value(1))
                .andExpect(jsonPath("$.learners[0].email").value("learner@it.test"))
                .andExpect(jsonPath("$.learners[0].clearedNodes").value(1))
                .andExpect(jsonPath("$.learners[0].enrolledAt").exists())
                .andExpect(jsonPath("$.learners[0].lastActivity").exists())
                .andExpect(jsonPath("$.learners[0].nodes.length()").value(2))
                .andExpect(jsonPath("$.learners[0].nodes[0].title").value("Root node"))
                .andExpect(jsonPath("$.learners[0].nodes[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$.learners[0].nodes[0].score").value(100))
                .andExpect(jsonPath("$.learners[0].nodes[1].status").value("UNLOCKED"));

        // Other people's work is not a student's to read.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void aLearnerDetailShowsTheirAttemptTrail() throws Exception {
        String teacherToken = login("teacher@it.test");

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk());

        skillTree();
        complete(studentToken, root.getId(), 0); // wrong answer, then the right one
        complete(studentToken, root.getId(), 1);

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster/" + student.getId())
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("learner@it.test"))
                .andExpect(jsonPath("$.clearedNodes").value(1))
                .andExpect(jsonPath("$.nodes[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$.nodes[0].history.length()").value(2))
                .andExpect(jsonPath("$.nodes[0].history[0].passed").value(false))
                .andExpect(jsonPath("$.nodes[0].history[1].passed").value(true))
                .andExpect(jsonPath("$.nodes[0].history[1].source").value("QUIZ"));

        // A teacher cannot read someone who never joined this course.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster/" + admin.getId())
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isNotFound());

        // Nor can a learner read anyone's history, including their own.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster/" + student.getId())
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void theOverallBoardAddsUpEveryCourse() throws Exception {
        skillTree();
        complete(studentToken, root.getId(), 1);

        mvc.perform(get("/api/v1/leaderboard/overall")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].rank").value(1))
                .andExpect(jsonPath("$[0].combinedXp").value(100))
                .andExpect(jsonPath("$[0].nodesCleared").value(1))
                .andExpect(jsonPath("$[0].coursesCleared").value(1))
                .andExpect(jsonPath("$[0].topCourses[0].title").value("Integration Quest"))
                .andExpect(jsonPath("$[0].currentUser").value(true));

        // A teacher is not on the board and cannot read it.
        mvc.perform(get("/api/v1/leaderboard/overall")
                        .header("Authorization", "Bearer " + login("teacher@it.test")))
                .andExpect(status().isForbidden());
    }

    @Test
    void theCourseBoardRanksByXpEarnedInThatCourse() throws Exception {
        skillTree();
        complete(studentToken, root.getId(), 1);

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/leaderboard")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].rank").value(1))
                .andExpect(jsonPath("$[0].name").value("Learner"))
                .andExpect(jsonPath("$[0].courseXp").value(100))
                .andExpect(jsonPath("$[0].modulesCleared").value(1))
                .andExpect(jsonPath("$[0].moduleCount").value(2))
                .andExpect(jsonPath("$[0].currentUser").value(true));

        // A draft course stays out of a student's reach, board included.
        mvc.perform(get("/api/v1/courses/" + draft.getId() + "/leaderboard")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void theCourseBoardCanRankJustOneClass() throws Exception {
        String teacherToken = login("teacher@it.test");

        users.save(User.builder()
                .name("Other Learner")
                .email("other@it.test")
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(Role.STUDENT)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .build());
        String otherToken = login("other@it.test");

        MvcResult created = mvc.perform(post("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("name", "10B"))))
                .andExpect(status().isOk())
                .andReturn();
        long cohortId = json.readTree(created.getResponse().getContentAsString()).path("id").asLong();
        String code = json.readTree(created.getResponse().getContentAsString()).path("joinCode").asText();

        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isOk());

        // The second learner works in the same course but never joined the class.
        skillTree(otherToken);
        complete(otherToken, root.getId(), 1);
        skillTree(studentToken);
        complete(studentToken, root.getId(), 1);

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/leaderboard")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/leaderboard?cohortId=" + cohortId)
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].rank").value(1))
                .andExpect(jsonPath("$[0].name").value("Learner"));

        // A class from another course cannot scope this board.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/leaderboard?cohortId=999999")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isNotFound());

        // The teacher who owns the course can rank it; that is who the class scope
        // is for.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/leaderboard")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk());
    }

    @Test
    void aClassCodeEnrollsTheStudentAndListsThemInTheClass() throws Exception {
        String teacherToken = login("teacher@it.test");

        MvcResult created = mvc.perform(post("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("name", "10B"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("10B"))
                .andExpect(jsonPath("$.memberCount").value(0))
                .andReturn();
        String code = json.readTree(created.getResponse().getContentAsString()).path("joinCode").asText();
        assertThat(code).hasSize(8);

        // One code does both jobs: class list and course enrollment.
        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.courseId").value(course.getId().intValue()))
                .andExpect(jsonPath("$.cohortName").value("10B"))
                .andExpect(jsonPath("$.alreadyMember").value(false));

        // Typing the code twice is not an error and does not duplicate the row.
        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alreadyMember").value(true));

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].memberCount").value(1));

        mvc.perform(get("/api/v1/courses/mine").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        // Codes are case-insensitive, unknown codes are 404, and roles are enforced.
        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code.toLowerCase()))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", "NOPENOPE"))))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isForbidden());
    }

    @Test
    void deletingAClassKeepsItsMembersEnrolled() throws Exception {
        String teacherToken = login("teacher@it.test");

        MvcResult created = mvc.perform(post("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("name", "10C"))))
                .andExpect(status().isOk())
                .andReturn();
        long cohortId = json.readTree(created.getResponse().getContentAsString()).path("id").asLong();
        String code = json.readTree(created.getResponse().getContentAsString()).path("joinCode").asText();

        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isOk());

        mvc.perform(delete("/api/v1/cohorts/" + cohortId)
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // Tidying up a term must not cost a student their course.
        mvc.perform(get("/api/v1/courses/mine").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void aGatedCourseStaysHiddenUntilItsClassCodeIsUsed() throws Exception {
        String teacherToken = login("teacher@it.test");

        MvcResult created = mvc.perform(post("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("name", "10B"))))
                .andExpect(status().isOk())
                .andReturn();
        String code = json.readTree(created.getResponse().getContentAsString()).path("joinCode").asText();

        mvc.perform(patch("/api/v1/courses/" + course.getId() + "/members-only?membersOnly=true")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.membershipRequired").value(true));

        // Gone from the catalogue and refused on a direct link.
        mvc.perform(get("/api/v1/courses").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + course.getId() + ")]").doesNotExist());
        mvc.perform(get("/api/v1/courses/" + course.getId())
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());

        // The class code is the invitation, so it still works while gated.
        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/courses").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + course.getId() + ")]").exists());
        mvc.perform(get("/api/v1/courses/" + course.getId())
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk());

        // Only the owner may flip the switch.
        mvc.perform(patch("/api/v1/courses/" + course.getId() + "/members-only?membersOnly=false")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void theRosterCanNarrowToOneClass() throws Exception {
        String teacherToken = login("teacher@it.test");

        // A second learner in the course who never typed a class code.
        User other = users.save(User.builder()
                .name("Other Learner")
                .email("other@it.test")
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(Role.STUDENT)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .build());
        jdbc.update("INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, now())",
                other.getId(), course.getId());

        MvcResult created = mvc.perform(post("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("name", "10B"))))
                .andExpect(status().isOk())
                .andReturn();
        long cohortId = json.readTree(created.getResponse().getContentAsString()).path("id").asLong();
        String code = json.readTree(created.getResponse().getContentAsString()).path("joinCode").asText();

        mvc.perform(post("/api/v1/cohorts/join")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("code", code))))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.learners.length()").value(2));

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster?cohortId=" + cohortId)
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.learners.length()").value(1))
                .andExpect(jsonPath("$.learners[0].email").value("learner@it.test"));

        // A class from another course is not a valid filter for this one.
        mvc.perform(get("/api/v1/courses/" + draft.getId() + "/roster?cohortId=" + cohortId)
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void aPastedClassListEnrolsItsStudentsAndReportsStrangers() throws Exception {
        String teacherToken = login("teacher@it.test");

        MvcResult created = mvc.perform(post("/api/v1/courses/" + course.getId() + "/cohorts")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("name", "10B"))))
                .andExpect(status().isOk())
                .andReturn();
        long cohortId = json.readTree(created.getResponse().getContentAsString()).path("id").asLong();

        String body = json.writeValueAsString(java.util.Map.of(
                "emails", java.util.List.of("learner@it.test", "ghost@it.test", "Learner@IT.test"),
                "cohortId", cohortId));

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/roster/import")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported.length()").value(1))
                .andExpect(jsonPath("$.imported[0]").value("learner@it.test"))
                // The same address twice in different case counts once.
                .andExpect(jsonPath("$.unknown.length()").value(1))
                .andExpect(jsonPath("$.unknown[0]").value("ghost@it.test"));

        // Running it again adds nobody and says so.
        mvc.perform(post("/api/v1/courses/" + course.getId() + "/roster/import")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported.length()").value(0))
                .andExpect(jsonPath("$.alreadyMember.length()").value(1))
                .andExpect(jsonPath("$.unknown.length()").value(1));

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster?cohortId=" + cohortId)
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.learners.length()").value(1))
                .andExpect(jsonPath("$.learners[0].email").value("learner@it.test"));

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/roster/import")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    @Test
    void anImportWithNothingUsefulInItIsRejected() throws Exception {
        String teacherToken = login("teacher@it.test");

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/roster/import")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/roster/import")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                java.util.Map.of("emails", java.util.List.of("  ", "")))))
                .andExpect(status().isBadRequest());

        // A whole year group in one paste is refused rather than held open.
        java.util.List<String> tooMany = new java.util.ArrayList<>();
        for (int index = 0; index < 501; index += 1) {
            tooMany.add("student" + index + "@it.test");
        }
        mvc.perform(post("/api/v1/courses/" + course.getId() + "/roster/import")
                        .header("Authorization", "Bearer " + teacherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("emails", tooMany))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void theRosterCanShowWhoIsStuckOnOneNode() throws Exception {
        String teacherToken = login("teacher@it.test");
        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk());
        skillTree();
        complete(studentToken, root.getId(), 1);

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster?nodeId=" + root.getId()
                        + "&nodeCleared=true")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.learners.length()").value(1));

        // The child is still open, so the "stuck here" view names them.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster?nodeId=" + child.getId()
                        + "&nodeCleared=false")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.learners.length()").value(1));

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster?nodeId=" + root.getId()
                        + "&nodeCleared=false")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.learners.length()").value(0));

        // A node from another course is not a valid filter.
        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster?nodeId=999999")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void aRosterWithNobodyJoinedIsEmptyRatherThanMissing() throws Exception {
        String teacherToken = login("teacher@it.test");

        mvc.perform(get("/api/v1/courses/" + course.getId() + "/roster")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.moduleCount").value(2))
                .andExpect(jsonPath("$.learners.length()").value(0));
    }

    @Test
    void onlyStudentsJoinAndOnlyLiveCoursesCanBeJoined() throws Exception {
        String teacherToken = login("teacher@it.test");

        mvc.perform(post("/api/v1/courses/" + course.getId() + "/enroll")
                        .header("Authorization", "Bearer " + teacherToken))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/courses/" + draft.getId() + "/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/courses/999999/enroll")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isNotFound());
    }
}
