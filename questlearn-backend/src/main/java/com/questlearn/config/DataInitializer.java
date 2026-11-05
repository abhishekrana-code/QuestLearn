package com.questlearn.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Quiz;
import com.questlearn.model.QuizType;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import com.questlearn.service.GamificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Demo seeder so the project is immediately playable during an evaluation.
 * Runs only when the database is empty.
 */
@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private static final String DEMO_PASSWORD = "password123";

    private final UserRepository userRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuizRepository quizRepository;
    private final UserModuleProgressRepository progressRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        if (userRepository.count() > 0) {
            return;
        }

        User admin = seedUser("Aria the Architect", "admin@questlearn.dev", Role.ADMIN, 0, 0, null);
        User instructor = seedUser("Professor Kade", "instructor@questlearn.dev", Role.INSTRUCTOR, 0, 0, null);
        User student = seedUser("Leo the Learner", "student@questlearn.dev", Role.STUDENT, 220, 4,
                LocalDate.now().minusDays(1));
        seedUser("Mira the Mage", "mira@questlearn.dev", Role.STUDENT, 480, 7, LocalDate.now());
        seedUser("Sam the Ranger", "sam@questlearn.dev", Role.STUDENT, 160, 2,
                LocalDate.now().minusDays(2));

        Course course = courseRepository.save(Course.builder()
                .title("Full-Stack Web Engineering Quest")
                .description("Six linked skill nodes that take you from semantic HTML to a deployed "
                        + "full-stack application. Complete a node, earn XP and unlock the next branch.")
                .category("Web Development")
                .emoji("⚔️")
                .published(true)
                .instructor(instructor)
                .build());

        Module html = seedModule(course, null, "HTML Foundations", 100, 1, 0, 0,
                "Build pages that both browsers and screen readers understand.",
                sections(
                        "Semantic scaffolding",
                        "Semantic elements describe meaning, not appearance. A <header>, <nav>, <main> "
                                + "and <footer> give assistive technology a map of your page.",
                        "Accessibility is a feature",
                        "Every image needs an alt attribute, every form input needs a label, and heading "
                                + "levels must not be skipped.")
                        .toString(),
                "Semantic HTML is the foundation every later node builds on.");
        Module css = seedModule(course, html, "CSS Layout Magic", 120, 0, 1, 1,
                "Flexbox, Grid and fluid sizing without fighting the browser.",
                sections(
                        "One dimension vs two",
                        "Flexbox distributes items along a single axis. Grid controls rows and columns at "
                                + "the same time - pick the tool that matches the shape of your layout.",
                        "Fluid values",
                        "clamp(min, preferred, max) keeps typography readable from phone to ultrawide.")
                        .toString(),
                "Layout is where most UI bugs are born. Own the axes.");
        Module js = seedModule(course, html, "JavaScript Essentials", 140, 2, 1, 2,
                "Async data, promises and the fetch lifecycle.",
                sections(
                        "The event loop",
                        "JavaScript is single threaded. Promises queue microtasks so long network calls do "
                                + "not freeze the interface.",
                        "Always check response.ok",
                        "fetch only rejects on network errors - a 500 response still resolves.")
                        .toString(),
                "Modern frontends live or die by async data handling.");
        Module react = seedModule(course, css, "React Components", 160, 0, 2, 3,
                "Compose stateful, reusable UI out of small pieces.",
                sections(
                        "State is a snapshot",
                        "useState returns the value for the current render plus a setter that schedules a "
                                + "re-render with the next value.",
                        "Effects have dependencies",
                        "useEffect re-runs whenever a value in its dependency array changes - omit it and you "
                                + "run on every render.")
                        .toString(),
                "Components are the building blocks of the whole product.");
        Module spring = seedModule(course, js, "Spring Boot REST APIs", 180, 2, 2, 4,
                "Expose JSON endpoints with layered, testable controllers.",
                sections(
                        "Layers",
                        "Controller -> Service -> Repository keeps HTTP concerns away from business rules.",
                        "Transactions",
                        "Wrap multi-step writes in @Transactional so XP awards and node unlocks commit "
                                + "together or not at all.")
                        .toString(),
                "Your React app is only as good as the API behind it.");
        Module deploy = seedModule(course, react, "Deploy the Final Boss", 200, 1, 3, 5,
                "Wire configuration, secrets and production builds together.",
                sections(
                        "Secrets never ship",
                        "JWT signing keys and database passwords live in environment variables, never in the "
                                + "bundle.",
                        "Ship a build, not a dev server",
                        "npm run build produces static assets; Spring Boot packages an executable jar with "
                                + "mvn clean package.")
                        .toString(),
                "The last node proves the whole quest works end to end.");

        quizRepository.save(quiz(html, QuizType.MULTIPLE_CHOICE, 60, """
                {
                  "questions": [
                    {
                      "id": "html-q1",
                      "prompt": "Which element is intended for a self-contained piece of content such as a blog post?",
                      "options": ["<div>", "<article>", "<span>", "<table>"],
                      "correctIndex": 1,
                      "explanation": "<article> marks content that would still make sense on its own."
                    },
                    {
                      "id": "html-q2",
                      "prompt": "What is the main purpose of the alt attribute on an image?",
                      "options": [
                        "It adds a hover tooltip",
                        "It supplies a text alternative for screen readers",
                        "It compresses the image",
                        "It sets the image caption"
                      ],
                      "correctIndex": 1,
                      "explanation": "Assistive technology announces alt text when the image cannot be seen."
                    }
                  ]
                }
                """));

        quizRepository.save(quiz(css, QuizType.DRAG_DROP, 60, """
                {
                  "prompt": "Match each CSS tool to its superpower.",
                  "pairs": [
                    {"left": "display: flex", "right": "One-dimensional row or column layout"},
                    {"left": "display: grid", "right": "Two-dimensional rows and columns"},
                    {"left": "position: sticky", "right": "Sticks while scrolling inside its container"},
                    {"left": "clamp()", "right": "Fluid values between a minimum and a maximum"}
                  ]
                }
                """));

        quizRepository.save(quiz(js, QuizType.CODE_ORDER, 60, """
                {
                  "prompt": "Order the lines so the fetch call handles HTTP errors correctly.",
                  "lines": [
                    "const response = await fetch('/api/v1/courses');",
                    "if (!response.ok) {",
                    "  throw new Error('Request failed: ' + response.status);",
                    "}",
                    "const data = await response.json();"
                  ],
                  "explanation": "Check response.ok before parsing the body."
                }
                """));

        quizRepository.save(quiz(react, QuizType.MULTIPLE_CHOICE, 60, """
                {
                  "questions": [
                    {
                      "id": "react-q1",
                      "prompt": "Which hook stores local component state?",
                      "options": ["useEffect", "useState", "useMemo", "useRef"],
                      "correctIndex": 1,
                      "explanation": "useState returns the current value and a setter."
                    },
                    {
                      "id": "react-q2",
                      "prompt": "What does the dependency array of useEffect control?",
                      "options": [
                        "The CSS transition speed",
                        "When the effect re-runs",
                        "The component's key",
                        "The render order of children"
                      ],
                      "correctIndex": 1,
                      "explanation": "The effect re-runs when a dependency changes."
                    }
                  ]
                }
                """));

        quizRepository.save(quiz(spring, QuizType.MULTIPLE_CHOICE, 60, """
                {
                  "questions": [
                    {
                      "id": "spring-q1",
                      "prompt": "Which annotation marks a class that returns JSON responses?",
                      "options": ["@Controller", "@RestController", "@Service", "@Repository"],
                      "correctIndex": 1,
                      "explanation": "@RestController = @Controller + @ResponseBody."
                    },
                    {
                      "id": "spring-q2",
                      "prompt": "Which annotation makes a method commit atomically?",
                      "options": ["@Async", "@Transactional", "@Secured", "@Cacheable"],
                      "correctIndex": 1,
                      "explanation": "@Transactional wraps the call in a single database transaction."
                    }
                  ]
                }
                """));

        quizRepository.save(quiz(deploy, QuizType.DRAG_DROP, 60, """
                {
                  "prompt": "Match each production concept to what it protects or does.",
                  "pairs": [
                    {"left": "JWT_SECRET", "right": "Signs and verifies access tokens"},
                    {"left": "ddl-auto", "right": "Generates the schema from JPA entities"},
                    {"left": "CORS origin", "right": "Restricts which frontend may call the API"},
                    {"left": "Connection pool", "right": "Reuses database connections"}
                  ]
                }
                """));

        seedProgress(student, html, ProgressStatus.COMPLETED, 100);
        seedProgress(student, css, ProgressStatus.COMPLETED, 75);
        seedProgress(student, js, ProgressStatus.UNLOCKED, 0);
        seedProgress(student, react, ProgressStatus.UNLOCKED, 0);
        seedProgress(student, spring, ProgressStatus.LOCKED, 0);
        seedProgress(student, deploy, ProgressStatus.LOCKED, 0);

        System.out.printf("""
                %nQuestLearn demo data ready%n
                  Admin       admin@questlearn.dev / %s%n
                  Instructor  instructor@questlearn.dev / %s%n
                  Student     student@questlearn.dev / %s%n
                  Course      "%s" with 6 skill nodes%n
                """, DEMO_PASSWORD, DEMO_PASSWORD, DEMO_PASSWORD, course.getTitle());

        // touch admin/instructor so they are not reported as unused by the compiler
        List<User> staff = new ArrayList<>(List.of(admin, instructor));
        staff.size();
    }

    private User seedUser(String name, String email, Role role, int totalXp, int streak, LocalDate lastActivity) {
        return userRepository.save(User.builder()
                .name(name)
                .email(email)
                .passwordHash(passwordEncoder.encode(DEMO_PASSWORD))
                .role(role)
                .totalXp(totalXp)
                .currentLevel(GamificationService.levelForXp(totalXp))
                .streakDays(streak)
                .lastActivityDate(lastActivity)
                .build());
    }

    private Module seedModule(Course course, Module parent, String title, int xp,
                              int positionX, int positionY, int orderIndex,
                              String summary, String contentJson, String takeaway) throws Exception {
        JsonNode content = objectMapper.readTree(contentJson);
        return moduleRepository.save(Module.builder()
                .title(title)
                .summary(summary)
                .content(content)
                .xpReward(xp)
                .positionX(positionX)
                .positionY(positionY)
                .orderIndex(orderIndex)
                .course(course)
                .parentModule(parent)
                .build());
    }

    private Quiz quiz(Module module, QuizType type, int passingScore, String payloadJson) throws Exception {
        return Quiz.builder()
                .module(module)
                .type(type)
                .passingScore(passingScore)
                .payload(objectMapper.readTree(payloadJson))
                .build();
    }

    private void seedProgress(User user, Module module, ProgressStatus status, int score) {
        progressRepository.save(UserModuleProgress.builder()
                .user(user)
                .module(module)
                .status(status)
                .score(score)
                .attempts(status == ProgressStatus.COMPLETED ? 1 : 0)
                .completedAt(status == ProgressStatus.COMPLETED ? Instant.now() : null)
                .build());
    }

    private JsonNode sections(String headingOne, String bodyOne, String headingTwo, String bodyTwo) {
        var root = objectMapper.createObjectNode();
        var array = root.putArray("sections");
        array.addObject().put("heading", headingOne).put("body", bodyOne);
        array.addObject().put("heading", headingTwo).put("body", bodyTwo);
        return root;
    }
}
