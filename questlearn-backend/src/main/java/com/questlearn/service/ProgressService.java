package com.questlearn.service;

import com.questlearn.dto.AnswerRequest;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AttemptDto;
import com.questlearn.dto.CourseLeaderboardEntry;
import com.questlearn.dto.LeaderboardEntry;
import com.questlearn.dto.ModuleDetailDto;
import com.questlearn.dto.OverallLeaderboardEntry;
import com.questlearn.dto.SkillNodeDto;
import com.questlearn.dto.SkillTreeDto;
import com.questlearn.dto.VivaConfig;
import com.questlearn.dto.XpAwardResponse;
import com.questlearn.exception.ApiException;
import com.questlearn.model.AttemptSource;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.ModuleAttempt;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Quiz;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ProgressService {

    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final ModuleAttemptRepository attemptRepository;
    private final UserModuleProgressRepository progressRepository;
    private final UserRepository userRepository;
    private final QuizService quizService;
    private final GamificationService gamificationService;
    private final CourseService courseService;
    private final com.questlearn.repository.CohortRepository cohortRepository;
    private final com.questlearn.repository.CohortMembershipRepository cohortMembershipRepository;

    /**
     * Returns the course as a skill tree merged with the learner's progress.
     * Opening the tree for the first time enrols the learner: every node gets a
     * progress row, root nodes UNLOCKED and everything else LOCKED.
     */
    @Transactional
    public SkillTreeDto getSkillTree(Long courseId, AppUserPrincipal principal) {
        Course course = courseService.loadCourse(courseId);
        courseService.assertCanView(course, principal);

        boolean tracksProgress = principal.role() != Role.INSTRUCTOR;
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        List<Module> modules = moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        Map<Long, UserModuleProgress> progressByModule = new HashMap<>();

        if (tracksProgress) {
            progressRepository.findByUserIdAndModuleCourseId(user.getId(), courseId)
                    .forEach(p -> progressByModule.put(p.getModule().getId(), p));

            for (Module module : modules) {
                if (!progressByModule.containsKey(module.getId())) {
                    UserModuleProgress progress = UserModuleProgress.builder()
                            .user(user)
                            .module(module)
                            .status(module.getParentModule() == null
                                    ? ProgressStatus.UNLOCKED
                                    : ProgressStatus.LOCKED)
                            .score(0)
                            .attempts(0)
                            .build();
                    progressByModule.put(module.getId(), progressRepository.save(progress));
                }
            }
        }

        List<SkillNodeDto> nodes = new ArrayList<>();
        long completed = 0;
        for (Module module : modules) {
            UserModuleProgress progress = progressByModule.get(module.getId());
            ProgressStatus status = !tracksProgress
                    ? ProgressStatus.UNLOCKED
                    : progress == null ? ProgressStatus.LOCKED : progress.getStatus();
            if (status == ProgressStatus.COMPLETED) {
                completed++;
            }
            nodes.add(new SkillNodeDto(
                    module.getId(),
                    module.getTitle(),
                    module.getSummary(),
                    module.getXpReward(),
                    module.getParentModule() == null ? null : module.getParentModule().getId(),
                    module.getPositionX(),
                    module.getPositionY(),
                    module.getOrderIndex(),
                    status,
                    progress == null ? 0 : progress.getScore(),
                    progress == null ? 0 : progress.getAttempts(),
                    module.getQuiz() == null ? null : module.getQuiz().getType(),
                    videoField(module, "videoUrl"),
                    videoField(module, "videoLabel")
            ));
        }

        return new SkillTreeDto(
                course.getId(),
                course.getTitle(),
                course.getDescription(),
                course.getCategory(),
                course.getEmoji(),
                modules.size(),
                completed,
                user.getTotalXp(),
                user.getCurrentLevel(),
                nodes
        );
    }

    @Transactional
    public ModuleDetailDto getModuleDetail(Long moduleId, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        courseService.assertCanView(module.getCourse(), principal);

        ProgressStatus status = ProgressStatus.UNLOCKED;
        int score = 0;
        int attempts = 0;
        List<AttemptDto> history = List.of();

        if (principal.role() != Role.INSTRUCTOR) {
            UserModuleProgress progress = progressRepository
                    .findByUserIdAndModuleId(principal.id(), moduleId)
                    .orElse(null);
            if (progress != null) {
                status = progress.getStatus();
                score = progress.getScore();
                attempts = progress.getAttempts();
            } else if (module.getParentModule() != null) {
                status = ProgressStatus.LOCKED;
            }

            history = attemptRepository
                    .findTop10ByUserIdAndModuleIdOrderByCreatedAtDesc(principal.id(), moduleId)
                    .stream()
                    .map(attempt -> new AttemptDto(
                            attempt.getScore(),
                            attempt.isPassed(),
                            attempt.getSource(),
                            attempt.getCreatedAt()))
                    .toList();
        }

        Quiz quiz = module.getQuiz();

        return new ModuleDetailDto(
                module.getId(),
                module.getCourse().getId(),
                module.getCourse().getTitle(),
                module.getTitle(),
                module.getSummary(),
                module.getContent(),
                module.getXpReward(),
                status,
                score,
                attempts,
                quizService.sanitize(quiz),
                VivaConfig.forModule(module),
                history
        );
    }

    /** Reads one string out of the node's JSONB lesson content; null when absent. */
    private static String videoField(Module module, String field) {
        return module.getContent() == null ? null : module.getContent().path(field).asText(null);
    }

    /**
     * Transactional completion: verifies the node is UNLOCKED, scores the quiz,
     * awards XP, recalculates level and streak, then unlocks child nodes.
     */
    @Transactional
    public XpAwardResponse completeModule(Long moduleId,
                                          AppUserPrincipal principal,
                                          List<AnswerRequest> answers) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        UserModuleProgress progress = progressRepository
                .findByUserIdAndModuleId(user.getId(), moduleId)
                .orElseThrow(() -> ApiException.badRequest(
                        "Open the course skill tree before attempting nodes"));

        if (progress.getStatus() == ProgressStatus.LOCKED) {
            throw ApiException.forbidden("This node is locked. Clear its prerequisite first");
        }

        // A completed node can be replayed. Retakes keep the best score and never
        // award XP a second time, which removes the main support request in a class.
        boolean retake = progress.getStatus() == ProgressStatus.COMPLETED;

        Quiz quiz = module.getQuiz();
        int score = 100;
        int passingScore = 0;
        List<String> explanations = quizService.explanations(quiz);

        if (quiz != null) {
            passingScore = quiz.getPassingScore();
            score = quizService.evaluate(quiz, answers);
            progress.setAttempts(progress.getAttempts() + 1);
            progress.setScore(Math.max(progress.getScore(), score));

            // Keep the trail behind the summary, so the node can show how a score
            // moved across tries. Failing attempts are history too.
            attemptRepository.save(ModuleAttempt.builder()
                    .user(user)
                    .module(module)
                    .score(score)
                    .passed(score >= passingScore)
                    .source(AttemptSource.QUIZ)
                    .createdAt(Instant.now())
                    .build());
        }

        if (score < passingScore) {
            progressRepository.save(progress);
            String failMessage = retake
                    ? "Retake scored " + score + "% - your best stays " + progress.getScore()
                            + "%. You need " + passingScore + "% to pass."
                    : "Score " + score + "% - you need " + passingScore
                            + "% to clear this node. Try again!";
            return new XpAwardResponse(
                    0,
                    user.getTotalXp(),
                    user.getCurrentLevel(),
                    GamificationService.xpForNextLevel(user.getCurrentLevel()),
                    false,
                    score,
                    false,
                    List.of(),
                    user.getStreakDays(),
                    false,
                    failMessage,
                    explanations
            );
        }

        if (retake) {
            progressRepository.save(progress);
            return new XpAwardResponse(
                    0,
                    user.getTotalXp(),
                    user.getCurrentLevel(),
                    GamificationService.xpForNextLevel(user.getCurrentLevel()),
                    false,
                    score,
                    true,
                    List.of(),
                    user.getStreakDays(),
                    false,
                    "Retake cleared at " + score + "%. Best score is now " + progress.getScore()
                            + "% - no extra XP for replaying a cleared node.",
                    explanations
            );
        }

        progress.setStatus(ProgressStatus.COMPLETED);
        progress.setScore(Math.max(progress.getScore(), score));
        progress.setCompletedAt(Instant.now());
        progressRepository.save(progress);

        int previousLevel = user.getCurrentLevel();
        int xpGained = module.getXpReward();
        user.setTotalXp(user.getTotalXp() + xpGained);
        int newLevel = GamificationService.levelForXp(user.getTotalXp());
        user.setCurrentLevel(newLevel);
        boolean streakIncremented = gamificationService.registerActivity(user);
        userRepository.save(user);

        List<Long> unlockedModuleIds = unlockChildren(user, module);

        boolean leveledUp = newLevel > previousLevel;
        String message = leveledUp
                ? "Level " + newLevel + " reached! New skill branches unlocked."
                : "Node conquered. +" + xpGained + " XP";

        return new XpAwardResponse(
                xpGained,
                user.getTotalXp(),
                newLevel,
                GamificationService.xpForNextLevel(newLevel),
                leveledUp,
                score,
                true,
                unlockedModuleIds,
                user.getStreakDays(),
                streakIncremented,
                message,
                explanations
        );
    }

    /**
     * Opens every child of a cleared node. Shared by the quiz and the voice-viva
     * paths so both reward routes unlock the tree the same way.
     */
    public List<Long> unlockChildren(User user, Module module) {
        List<Long> unlockedModuleIds = new ArrayList<>();
        for (Module child : moduleRepository.findByParentModuleId(module.getId())) {
            UserModuleProgress childProgress = progressRepository
                    .findByUserIdAndModuleId(user.getId(), child.getId())
                    .orElseGet(() -> UserModuleProgress.builder()
                            .user(user)
                            .module(child)
                            .score(0)
                            .attempts(0)
                            .status(ProgressStatus.LOCKED)
                            .build());
            if (childProgress.getStatus() == ProgressStatus.LOCKED) {
                childProgress.setStatus(ProgressStatus.UNLOCKED);
                progressRepository.save(childProgress);
                unlockedModuleIds.add(child.getId());
            }
        }
        return unlockedModuleIds;
    }

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> leaderboard(AppUserPrincipal principal) {
        List<User> students = userRepository.findTop10ByRoleOrderByTotalXpDesc(Role.STUDENT);
        List<LeaderboardEntry> entries = new ArrayList<>();
        int rank = 1;
        for (User student : students) {
            entries.add(new LeaderboardEntry(
                    rank++,
                    student.getId(),
                    student.getName(),
                    student.getTotalXp(),
                    student.getCurrentLevel(),
                    student.getStreakDays(),
                    (int) progressRepository.countByUserIdAndStatus(
                            student.getId(), ProgressStatus.COMPLETED),
                    student.getId().equals(principal.id())
            ));
        }
        return entries;
    }

    /**
     * The school-wide board, decided by work rather than by account history: every
     * cleared node's XP, in every course, added up. Each row carries where the XP came
     * from, so "1200 across three courses" can be read rather than guessed at.
     */
    @Transactional(readOnly = true)
    public List<OverallLeaderboardEntry> overallLeaderboard(AppUserPrincipal principal) {
        Map<Long, Integer> combinedXp = new HashMap<>();
        Map<Long, Integer> nodesCleared = new HashMap<>();
        Map<Long, Map<Long, Integer>> xpByCourse = new HashMap<>();
        Map<Long, String> courseTitles = new HashMap<>();

        for (UserModuleProgress row : progressRepository.findByStatus(ProgressStatus.COMPLETED)) {
            Long learnerId = row.getUser().getId();
            Course course = row.getModule().getCourse();
            int reward = row.getModule().getXpReward();

            combinedXp.merge(learnerId, reward, Integer::sum);
            nodesCleared.merge(learnerId, 1, Integer::sum);
            xpByCourse.computeIfAbsent(learnerId, key -> new HashMap<>())
                    .merge(course.getId(), reward, Integer::sum);
            courseTitles.putIfAbsent(course.getId(), course.getTitle());
        }
        if (combinedXp.isEmpty()) {
            return List.of();
        }

        List<User> learners = userRepository.findAllById(combinedXp.keySet()).stream()
                .filter(learner -> learner.getRole() == Role.STUDENT)
                .sorted(Comparator
                        .comparingInt((User learner) -> combinedXp.getOrDefault(learner.getId(), 0))
                        .reversed()
                        .thenComparing(User::getName, String.CASE_INSENSITIVE_ORDER))
                .limit(10)
                .toList();

        List<OverallLeaderboardEntry> entries = new ArrayList<>(learners.size());
        int rank = 1;
        for (User learner : learners) {
            Map<Long, Integer> shares = xpByCourse.getOrDefault(learner.getId(), Map.of());
            List<OverallLeaderboardEntry.CourseXpShare> topCourses = shares.entrySet().stream()
                    .sorted(Map.Entry.<Long, Integer>comparingByValue().reversed())
                    .limit(3)
                    .map(entry -> new OverallLeaderboardEntry.CourseXpShare(
                            entry.getKey(), courseTitles.get(entry.getKey()), entry.getValue()))
                    .toList();
            entries.add(new OverallLeaderboardEntry(
                    rank++,
                    learner.getId(),
                    learner.getName(),
                    combinedXp.getOrDefault(learner.getId(), 0),
                    nodesCleared.getOrDefault(learner.getId(), 0),
                    shares.size(),
                    learner.getCurrentLevel(),
                    learner.getStreakDays(),
                    learner.getId().equals(principal.id()),
                    topCourses));
        }
        return entries;
    }

    /**
     * A class ranking instead of a building one: XP earned inside this course only.
     *
     * <p>XP is read from the course's own completed nodes rather than the learner's
     * lifetime total, so a transfer student does not arrive at the top of the board
     * and someone who finished three courses elsewhere does not swamp their class.</p>
     */
    /**
     * @param cohortId when set, the board ranks only that class, which is what a
     *                 teacher means by "how is 10B doing?"
     */
    @Transactional(readOnly = true)
    public List<CourseLeaderboardEntry> courseLeaderboard(Long courseId, Long cohortId, AppUserPrincipal principal) {
        Course course = requireCourse(courseId);
        courseService.assertCanView(course, principal);

        Set<Long> classMembers = null;
        if (cohortId != null) {
            var cohort = cohortRepository.findById(cohortId)
                    .orElseThrow(() -> ApiException.notFound("Class not found"));
            if (!cohort.getCourseId().equals(courseId)) {
                throw ApiException.notFound("That class is not part of this course");
            }
            classMembers = cohortMembershipRepository.findByCohortIdOrderByJoinedAtAsc(cohortId).stream()
                    .map(membership -> membership.getUserId())
                    .collect(java.util.stream.Collectors.toSet());
        }
        final Set<Long> allowed = classMembers;

        Map<Long, Integer> xpByLearner = new HashMap<>();
        Map<Long, Integer> clearedByLearner = new HashMap<>();
        for (UserModuleProgress row : progressRepository
                .findByModuleCourseIdAndStatus(courseId, ProgressStatus.COMPLETED)) {
            Long learnerId = row.getUser().getId();
            xpByLearner.merge(learnerId, row.getModule().getXpReward(), Integer::sum);
            clearedByLearner.merge(learnerId, 1, Integer::sum);
        }
        if (xpByLearner.isEmpty()) {
            return List.of();
        }

        int moduleCount = (int) moduleRepository.countByCourseId(courseId);
        Map<Long, User> learners = new HashMap<>();
        for (User learner : userRepository.findAllById(xpByLearner.keySet())) {
            learners.put(learner.getId(), learner);
        }

        List<CourseLeaderboardEntry> board = learners.values().stream()
                .filter(learner -> learner.getRole() == Role.STUDENT)
                .filter(learner -> allowed == null || allowed.contains(learner.getId()))
                .sorted(Comparator
                        .comparingInt((User learner) -> xpByLearner.getOrDefault(learner.getId(), 0))
                        .reversed()
                        .thenComparing(User::getName, String.CASE_INSENSITIVE_ORDER))
                .limit(10)
                .map(learner -> new CourseLeaderboardEntry(
                        0,
                        learner.getId(),
                        learner.getName(),
                        xpByLearner.getOrDefault(learner.getId(), 0),
                        learner.getCurrentLevel(),
                        learner.getStreakDays(),
                        clearedByLearner.getOrDefault(learner.getId(), 0),
                        moduleCount,
                        learner.getId().equals(principal.id())))
                .toList();

        List<CourseLeaderboardEntry> ranked = new ArrayList<>(board.size());
        for (int index = 0; index < board.size(); index++) {
            CourseLeaderboardEntry entry = board.get(index);
            ranked.add(new CourseLeaderboardEntry(
                    index + 1,
                    entry.userId(),
                    entry.name(),
                    entry.courseXp(),
                    entry.currentLevel(),
                    entry.streakDays(),
                    entry.modulesCleared(),
                    entry.moduleCount(),
                    entry.currentUser()));
        }
        return ranked;
    }

    @Transactional(readOnly = true)
    public Course requireCourse(Long courseId) {
        return courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }
}
