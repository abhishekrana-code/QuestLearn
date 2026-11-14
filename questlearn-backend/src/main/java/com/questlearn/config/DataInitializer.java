package com.questlearn.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.questlearn.model.AttemptSource;
import com.questlearn.model.Course;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.ModuleAttempt;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Quiz;
import com.questlearn.model.QuizType;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import com.questlearn.service.GamificationService;
import com.questlearn.service.MediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Demo seeder so the project is immediately playable during an evaluation.
 * Runs only when the database is empty.
 *
 * <p>Never runs under the {@code prod} profile: the demo accounts share one known
 * password, so a fresh production database must get its first admin from
 * {@link BootstrapAdminRunner} instead. It is also skipped under {@code it}, so the
 * integration suite owns every row it asserts on.</p>
 */
@Component
@Profile("!prod & !it")
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private static final String DEMO_PASSWORD = "password123";

    private final UserRepository userRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ModuleRepository moduleRepository;
    private final QuizRepository quizRepository;
    private final UserModuleProgressRepository progressRepository;
    private final ModuleAttemptRepository attemptRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final MediaStorageService mediaStorageService;

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        if (userRepository.count() == 0) {
            seedDemoData();
        }
        seedRivalProgress();
        seedSecondCourse();
        attachDemoVideo();
        backfillDemoAttempts();
    }

    private void seedDemoData() throws Exception {
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

    private static final String SECOND_COURSE_TITLE = "Data Structures Detour";

    /**
     * A second course for the same learner.
     *
     * <p>Every board used to be measured inside one course, so a combined total was
     * indistinguishable from a single course's XP. Leo now has work in two courses,
     * which is what lets the overall board be checked rather than assumed.</p>
     *
     * <p>Written to run against a database that already has the demo data, so an
     * existing dev database gets the course on its next restart instead of needing a
     * wipe. It only ever adds: an existing copy of the course stops it.</p>
     */
    private void seedSecondCourse() throws Exception {
        boolean alreadyThere = courseRepository.findAll().stream()
                .anyMatch(course -> SECOND_COURSE_TITLE.equals(course.getTitle()));
        if (alreadyThere) {
            return;
        }

        var instructor = userRepository.findByEmailIgnoreCase("instructor@questlearn.dev").orElse(null);
        var student = userRepository.findByEmailIgnoreCase("student@questlearn.dev").orElse(null);
        if (instructor == null || student == null) {
            return;
        }

        Course course = courseRepository.save(Course.builder()
                .title(SECOND_COURSE_TITLE)
                .description("Three nodes on the structures underneath every list, index and search. "
                        + "A second course, so XP can be earned in more than one place.")
                .category("Computer Science")
                .emoji("\uD83E\uDDE9")
                .published(true)
                .instructor(instructor)
                .build());

        Module arrays = seedModule(course, null, "Arrays and Big-O", 90, 0, 0, 0,
                "Why reading an index is instant and inserting into the middle is not.",
                sections(
                        "Constant time reads",
                        "An array knows where it starts and how wide each slot is, so element n is one "
                                + "multiplication away. That is why indexing is O(1).",
                        "Linear time inserts",
                        "Pushing a value into the middle shifts every later element, which makes it O(n) "
                                + "no matter how fast the shift is.")
                        .toString(),
                "Pick a structure by the operation you do most, not by habit.");
        Module lists = seedModule(course, arrays, "Linked Lists", 110, 1, 1, 1,
                "Pointers trade instant access for instant insertion.",
                sections(
                        "Nodes and next",
                        "Each node holds a value and a reference to the next one. There is no index to "
                                + "jump to, so finding the tenth element means walking nine links.",
                        "Cheap surgery",
                        "Inserting after a known node is a pair of pointer writes, which is why a list "
                                + "beats an array when the middle changes constantly.")
                        .toString(),
                "A list is a promise about order, not about location.");
        Module trees = seedModule(course, lists, "Trees and Traversal", 130, 2, 2, 2,
                "Search a sorted tree in logarithmic steps instead of walking every node.",
                sections(
                        "Half the work each step",
                        "A balanced search tree compares once and discards half the remaining nodes, so a "
                                + "thousand values take about ten steps.",
                        "Depth first or breadth first",
                        "Depth-first traversal uses a stack and suits path questions; breadth-first uses a "
                                + "queue and finds the shortest route in an unweighted graph.")
                        .toString(),
                "The shape of the data decides the speed of the search.");

        quizRepository.save(quiz(trees, QuizType.MULTIPLE_CHOICE, 60, """
                {
                  "questions": [
                    {
                      "id": "trees-q1",
                      "prompt": "Why does a balanced binary search tree find a value quickly?",
                      "options": [
                        "It stores values in a hash table",
                        "Each comparison discards half the remaining nodes",
                        "It keeps values in insertion order",
                        "It caches the last lookup"
                      ],
                      "correctIndex": 1,
                      "explanation": "Halving the search space each step is what makes the cost logarithmic."
                    },
                    {
                      "id": "trees-q2",
                      "prompt": "Which structure does a breadth-first traversal use?",
                      "options": ["A stack", "A queue", "A heap", "A set"],
                      "correctIndex": 1,
                      "explanation": "A queue visits nodes in the order they were discovered."
                    }
                  ]
                }
                """));

        enrollmentRepository.save(Enrollment.builder()
                .userId(student.getId())
                .courseId(course.getId())
                .build());

        seedProgress(student, arrays, ProgressStatus.COMPLETED, 100);
        seedProgress(student, lists, ProgressStatus.COMPLETED, 80);
        seedProgress(student, trees, ProgressStatus.UNLOCKED, 0);

        // The account total was typed in when there was one course. Keep it equal to
        // the work actually finished, so lifetime XP and combined XP tell the same
        // story until a learner earns something new.
        int totalXp = progressRepository.findByUserId(student.getId()).stream()
                .filter(progress -> progress.getStatus() == ProgressStatus.COMPLETED)
                .mapToInt(progress -> progress.getModule().getXpReward())
                .sum();
        student.setTotalXp(totalXp);
        student.setCurrentLevel(GamificationService.levelForXp(totalXp));
        userRepository.save(student);
    }

    /**
     * Gives the demo student a short try history on every completed node.
     *
     * <p>Progress written before the attempts table existed carries a try count but
     * no rows, so the per-attempt view had nothing to show. Each node is checked
     * first, and one with real history is left untouched - this only fills a gap,
     * it never rewrites a learner's attempts.</p>
     */
    private void backfillDemoAttempts() {
        for (String email : List.of(
                "student@questlearn.dev", "mira@questlearn.dev", "sam@questlearn.dev")) {
            userRepository.findByEmailIgnoreCase(email).ifPresent(this::backfillAttempts);
        }
    }

    private void backfillAttempts(User student) {
        for (UserModuleProgress progress : progressRepository.findByUserId(student.getId())) {
            if (progress.getStatus() != ProgressStatus.COMPLETED) {
                continue;
            }

            Module module = progress.getModule();
            if (!attemptRepository
                    .findByUserIdAndModuleIdOrderByCreatedAtAsc(student.getId(), module.getId())
                    .isEmpty()) {
                continue;
            }

            int passing = module.getQuiz() == null ? 60 : module.getQuiz().getPassingScore();
            int finalScore = progress.getScore();
            // A believable climb: a rough first try, a near miss, then the score
            // the progress row already records as the best.
            int[] series = {
                    Math.max(5, finalScore - 45),
                    Math.max(15, finalScore - 20),
                    finalScore,
            };
            Instant finished = progress.getCompletedAt() == null
                    ? Instant.now()
                    : progress.getCompletedAt();

            for (int index = 0; index < series.length; index += 1) {
                attemptRepository.save(ModuleAttempt.builder()
                        .user(student)
                        .module(module)
                        .score(series[index])
                        .passed(series[index] >= passing)
                        .source(AttemptSource.QUIZ)
                        .createdAt(finished.minus(Duration.ofDays(
                                2L * (series.length - 1 - index))))
                        .build());
            }

            progress.setAttempts(series.length);
            progress.setCompletedAt(finished);
            progressRepository.save(progress);
        }
    }

    /**
     * One node carries a lesson video so the Videos step has something in it and the
     * student briefing can show playback. The clip ships with the app; a node that
     * already has a video is never overwritten.
     */
    private void attachDemoVideo() {
        ClassPathResource clip = new ClassPathResource("demo/html-foundations.mp4");
        if (!clip.exists()) {
            return;
        }

        Course course = courseRepository.findAll().stream().findFirst().orElse(null);
        if (course == null) {
            return;
        }

        Module node = moduleRepository.findByCourseIdOrderByOrderIndexAsc(course.getId()).stream()
                .filter(module -> "HTML Foundations".equals(module.getTitle()))
                .findFirst()
                .orElse(null);
        if (node == null) {
            return;
        }

        JsonNode raw = node.getContent();
        if (raw == null || !raw.isObject()) {
            return;
        }
        ObjectNode content = (ObjectNode) raw;
        if (content.hasNonNull("videoUrl")) {
            return;
        }

        String fileName = "demo-html-foundations.mp4";
        String videoUrl;
        try (InputStream stream = clip.getInputStream()) {
            // Through the store, so the demo lesson also works on a bucket.
            videoUrl = mediaStorageService.storeNamed(fileName, stream, clip.contentLength(),
                    "video/mp4");
        } catch (IOException | com.questlearn.exception.ApiException ex) {
            System.out.printf("Demo lesson video skipped: %s%n", ex.getMessage());
            return;
        }

        ObjectNode updated = content.deepCopy();
        updated.put("videoUrl", videoUrl);
        updated.put("videoLabel", "Intro \u00b7 semantic scaffolding \u00b7 0:12");
        node.setContent(updated);
        moduleRepository.save(node);
        System.out.printf("Demo lesson video attached to \"%s\"%n", node.getTitle());
    }

    /**
     * The leaderboard is more convincing when the students ahead of the demo account
     * earned their place, so the two rivals get progress rows for the nodes their
     * totals represent. A rival with any progress already is left alone.
     */
    private void seedRivalProgress() {
        Course course = courseRepository.findAll().stream().findFirst().orElse(null);
        if (course == null) {
            return;
        }

        List<Module> modules = moduleRepository.findByCourseIdOrderByOrderIndexAsc(course.getId());
        seedRival("mira@questlearn.dev", modules, Map.of(
                "HTML Foundations", 100,
                "CSS Layout Magic", 92,
                "JavaScript Essentials", 84,
                "React Components", 96));
        seedRival("sam@questlearn.dev", modules, Map.of("HTML Foundations", 100));
    }

    private void seedRival(String email, List<Module> modules, Map<String, Integer> scores) {
        userRepository.findByEmailIgnoreCase(email).ifPresent(rival -> {
            if (!progressRepository.findByUserId(rival.getId()).isEmpty()) {
                return;
            }

            Set<String> cleared = scores.keySet();
            int totalXp = 0;
            int clearedIndex = 0;
            Instant newest = Instant.now().minus(Duration.ofDays(4));

            for (Module module : modules) {
                Integer score = scores.get(module.getTitle());
                if (score != null) {
                    totalXp += module.getXpReward();
                    seedProgress(rival, module, ProgressStatus.COMPLETED, score,
                            newest.minus(Duration.ofDays(4L * (scores.size() - 1 - clearedIndex))));
                    clearedIndex += 1;
                    continue;
                }

                boolean unlocked = module.getParentModule() == null
                        || cleared.contains(module.getParentModule().getTitle());
                seedProgress(rival, module,
                        unlocked ? ProgressStatus.UNLOCKED : ProgressStatus.LOCKED, 0);
            }

            // The totals are the rewards of the cleared nodes, not a number typed in
            // beside them: 480 and 160 could not be reached by any legal node set.
            rival.setTotalXp(totalXp);
            rival.setCurrentLevel(GamificationService.levelForXp(totalXp));
            userRepository.save(rival);
        });
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
                .emailVerified(true)
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
        seedProgress(user, module, status, score, Instant.now());
    }

    private void seedProgress(User user, Module module, ProgressStatus status, int score,
                              Instant completedAt) {
        progressRepository.save(UserModuleProgress.builder()
                .user(user)
                .module(module)
                .status(status)
                .score(score)
                .attempts(status == ProgressStatus.COMPLETED ? 1 : 0)
                .completedAt(status == ProgressStatus.COMPLETED ? completedAt : null)
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
