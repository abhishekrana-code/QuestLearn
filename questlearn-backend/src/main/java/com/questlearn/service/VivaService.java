package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.VivaConfig;
import com.questlearn.dto.VivaGradeResponse;
import com.questlearn.exception.ApiException;
import com.questlearn.model.AttemptSource;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.ModuleAttempt;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * Voice viva ("boss battle") grading.
 *
 * <p>A student answers either by speaking (the recording is transcribed by Groq
 * whisper) or by typing the answer directly, which matters in a lab without
 * microphones or when the browser has no permission. Both paths then converge on
 * the same examiner call and the same persistence: best score is kept, the first
 * clear awards the node's XP once, and clearing unlocks the child nodes. Audio is
 * streamed to Groq and never stored on disk.</p>
 */
@Service
@Slf4j
public class VivaService {

    /** Answers shorter than this cannot be graded meaningfully. */
    private static final int MIN_TRANSCRIPT_CHARS = 15;
    private static final int MAX_TRANSCRIPT_CHARS = 4000;

    private final ModuleRepository moduleRepository;
    private final ModuleAttemptRepository attemptRepository;
    private final UserRepository userRepository;
    private final UserModuleProgressRepository progressRepository;
    private final CourseService courseService;
    private final ProgressService progressService;
    private final GamificationService gamificationService;
    private final GroqAiService groqAiService;
    private final VivaGrader vivaGrader;
    private final AiQuotaService aiQuotaService;

    @Value("${questlearn.ai.max-audio-bytes:26214400}")
    private long maxAudioBytes;

    /**
     * Bounds how many answers are in flight at once. Each spoken attempt holds its
     * recording in the heap while Groq works, so on a small host four is already
     * generous; callers that cannot get a permit are told to retry rather than queued.
     */
    private final Semaphore vivaPermits;

    public VivaService(ModuleRepository moduleRepository,
                       ModuleAttemptRepository attemptRepository,
                       UserRepository userRepository,
                       UserModuleProgressRepository progressRepository,
                       CourseService courseService,
                       ProgressService progressService,
                       GamificationService gamificationService,
                       GroqAiService groqAiService,
                       VivaGrader vivaGrader,
                       AiQuotaService aiQuotaService,
                       @Value("${questlearn.ai.max-concurrent-vivas:4}") int maxConcurrentVivas) {
        this.moduleRepository = moduleRepository;
        this.attemptRepository = attemptRepository;
        this.userRepository = userRepository;
        this.progressRepository = progressRepository;
        this.courseService = courseService;
        this.progressService = progressService;
        this.gamificationService = gamificationService;
        this.groqAiService = groqAiService;
        this.vivaGrader = vivaGrader;
        this.aiQuotaService = aiQuotaService;
        this.vivaPermits = new Semaphore(Math.max(1, maxConcurrentVivas));
    }

    @Transactional
    public VivaGradeResponse gradeViva(Long moduleId,
                                       AppUserPrincipal principal,
                                       MultipartFile audio) {

        acquirePermit();
        try {
            return gradeSpokenAnswer(moduleId, principal, audio);
        } finally {
            vivaPermits.release();
        }
    }

    private VivaGradeResponse gradeSpokenAnswer(Long moduleId,
                                                AppUserPrincipal principal,
                                                MultipartFile audio) {

        Attempt attempt = openAttempt(moduleId, principal);

        if (audio == null || audio.isEmpty()) {
            throw ApiException.badRequest("Record an answer before submitting the viva.");
        }
        if (audio.getSize() > maxAudioBytes) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "That recording exceeds the " + (maxAudioBytes / (1024 * 1024))
                            + " MB transcription limit. Keep the answer under 80 seconds, "
                            + "or type your answer instead.");
        }

        // Spend one quota slot per attempt, before the paid calls go out.
        aiQuotaService.consume(attempt.user().getId());

        byte[] recording;
        try {
            recording = audio.getBytes();
        } catch (IOException ex) {
            throw ApiException.badRequest("The uploaded recording could not be read.");
        }

        String transcript = groqAiService.transcribe(
                recording, audio.getOriginalFilename(), audio.getContentType());
        if (transcript.trim().length() < MIN_TRANSCRIPT_CHARS) {
            throw ApiException.badRequest(
                    "The examiner could only hear \"" + transcript
                            + "\". Answer in a full sentence and try again, or type your answer instead.");
        }

        return judge(attempt, transcript, VivaInput.SPOKEN);
    }

    /** The written fallback: the same examination without a microphone. */
    @Transactional
    public VivaGradeResponse gradeWrittenAnswer(Long moduleId,
                                                AppUserPrincipal principal,
                                                String answer) {

        acquirePermit();
        try {
            Attempt attempt = openAttempt(moduleId, principal);

            String transcript = answer == null ? "" : answer.strip();
            if (transcript.length() < MIN_TRANSCRIPT_CHARS) {
                throw ApiException.badRequest(
                        "Write at least a sentence or two - the examiner grades what you actually explain.");
            }
            if (transcript.length() > MAX_TRANSCRIPT_CHARS) {
                throw ApiException.badRequest(
                        "Keep your written answer under " + MAX_TRANSCRIPT_CHARS + " characters.");
            }

            aiQuotaService.consume(attempt.user().getId());
            return judge(attempt, transcript, VivaInput.WRITTEN);
        } finally {
            vivaPermits.release();
        }
    }

    /** Fails fast instead of queueing: a waiting student would just see a spinner. */
    private void acquirePermit() {
        if (!vivaPermits.tryAcquire()) {
            throw ApiException.tooManyRequests(
                    "Several students are being examined right now. Wait a few seconds and try again.");
        }
    }

    /** Shared checks: the caller may view the course, the node is not locked. */
    private Attempt openAttempt(Long moduleId, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        Course course = module.getCourse();
        courseService.assertCanView(course, principal);

        if (principal.role() == Role.INSTRUCTOR) {
            throw ApiException.forbidden(
                    "Voice vivas are graded for students - use Preview to play the node quiz.");
        }

        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        UserModuleProgress progress = progressRepository
                .findByUserIdAndModuleId(user.getId(), moduleId)
                .orElseThrow(() -> ApiException.badRequest(
                        "Open the course skill tree before attempting nodes"));

        if (progress.getStatus() == ProgressStatus.LOCKED) {
            throw ApiException.forbidden("This node is locked. Clear its prerequisite first");
        }

        return new Attempt(module, course, user, progress);
    }

    /**
     * Grades an already-resolved transcript, persists the attempt and awards XP
     * for a first clear. Both the spoken and the written path end here.
     */
    private VivaGradeResponse judge(Attempt attempt, String transcript, VivaInput input) {
        Module module = attempt.module();
        User user = attempt.user();
        UserModuleProgress progress = attempt.progress();
        VivaConfig config = VivaConfig.forModule(module);

        JsonNode verdictJson = groqAiService.generateJson(
                VivaGrader.EXAMINER_SYSTEM_PROMPT,
                vivaGrader.buildPrompt(attempt.course().getTitle(), module.getTitle(), config, transcript));
        VivaGrader.VivaVerdict verdict = vivaGrader.parse(verdictJson, config.passThreshold());

        boolean retake = progress.getStatus() == ProgressStatus.COMPLETED;
        progress.setAttempts(progress.getAttempts() + 1);
        progress.setScore(Math.max(progress.getScore(), verdict.score()));

        if (verdict.passed()) {
            progress.setStatus(ProgressStatus.COMPLETED);
            if (progress.getCompletedAt() == null) {
                progress.setCompletedAt(Instant.now());
            }
        }
        progressRepository.save(progress);
        attemptRepository.save(ModuleAttempt.builder()
                .user(user)
                .module(module)
                .score(verdict.score())
                .passed(verdict.passed())
                .source(input == VivaInput.SPOKEN ? AttemptSource.VIVA_SPOKEN : AttemptSource.VIVA_WRITTEN)
                .createdAt(Instant.now())
                .build());

        if (!verdict.passed()) {
            log.info("Viva {} failed for {} on node {} at {}% (needs {}%)",
                    input, user.getEmail(), module.getId(), verdict.score(), config.passThreshold());
            return response(module, verdict, transcript, config, progress, user, input,
                    0, List.of(), false, false,
                    "The Warden holds: " + verdict.score() + "% (you need "
                            + config.passThreshold() + "%). Read the gaps and answer again.");
        }

        if (retake) {
            return response(module, verdict, transcript, config, progress, user, input,
                    0, List.of(), false, false,
                    "Boss re-cleared at " + verdict.score() + "%. Best score is now "
                            + progress.getScore() + "% - no extra XP for replaying a cleared node.");
        }

        int previousLevel = user.getCurrentLevel();
        int xpGained = module.getXpReward();
        user.setTotalXp(user.getTotalXp() + xpGained);
        int newLevel = GamificationService.levelForXp(user.getTotalXp());
        user.setCurrentLevel(newLevel);
        boolean streakIncremented = gamificationService.registerActivity(user);
        userRepository.save(user);

        List<Long> unlocked = progressService.unlockChildren(user, module);
        boolean leveledUp = newLevel > previousLevel;

        log.info("Viva {} cleared by {} on node {} at {}% - +{} XP",
                input, user.getEmail(), module.getId(), verdict.score(), xpGained);

        String message = leveledUp
                ? "Boss defeated at " + verdict.score() + "%! Level " + newLevel
                        + " reached - new skill branches unlocked."
                : "Boss defeated at " + verdict.score() + "%! +" + xpGained + " XP";

        return response(module, verdict, transcript, config, progress, user, input,
                xpGained, unlocked, streakIncremented, leveledUp, message);
    }

    private VivaGradeResponse response(Module module,
                                       VivaGrader.VivaVerdict verdict,
                                       String transcript,
                                       VivaConfig config,
                                       UserModuleProgress progress,
                                       User user,
                                       VivaInput input,
                                       int xpGained,
                                       List<Long> unlockedModuleIds,
                                       boolean streakIncremented,
                                       boolean leveledUp,
                                       String message) {
        return new VivaGradeResponse(
                module.getId(),
                input.name(),
                transcript,
                verdict.score(),
                config.passThreshold(),
                verdict.passed(),
                verdict.verdict(),
                verdict.strengths(),
                verdict.gaps(),
                verdict.feedback(),
                verdict.followUpQuestion(),
                progress.getAttempts(),
                xpGained,
                user.getTotalXp(),
                user.getCurrentLevel(),
                GamificationService.xpForNextLevel(user.getCurrentLevel()),
                leveledUp,
                user.getStreakDays(),
                streakIncremented,
                unlockedModuleIds,
                message
        );
    }

    /** How the answer reached the examiner. */
    public enum VivaInput {
        SPOKEN,
        WRITTEN
    }

    private record Attempt(Module module, Course course, User user, UserModuleProgress progress) {
    }
}
