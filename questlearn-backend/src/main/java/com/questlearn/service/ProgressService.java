package com.questlearn.service;

import com.questlearn.dto.AnswerRequest;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AttemptDto;
import com.questlearn.dto.LeaderboardEntry;
import com.questlearn.dto.ModuleDetailDto;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
                    module.getQuiz() == null ? null : module.getQuiz().getType()
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
                    failMessage
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
                            + "% - no extra XP for replaying a cleared node."
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
                message
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
                    student.getId().equals(principal.id())
            ));
        }
        return entries;
    }

    @Transactional(readOnly = true)
    public Course requireCourse(Long courseId) {
        return courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }
}
