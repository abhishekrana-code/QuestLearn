package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.VivaConfig;
import com.questlearn.dto.VivaGradeResponse;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

/**
 * Voice viva ("boss battle") grading.
 *
 * <p>The recording is transcribed by Groq whisper, the transcript is judged by the
 * reasoning model, and the verdict is persisted exactly like a quiz attempt: best
 * score is kept, the first clear awards the node's XP once, and clearing unlocks
 * the child nodes. Audio is streamed to Groq and never stored on disk.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class VivaService {

    private final ModuleRepository moduleRepository;
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

    @Transactional
    public VivaGradeResponse gradeViva(Long moduleId,
                                       AppUserPrincipal principal,
                                       MultipartFile audio) {

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

        if (audio == null || audio.isEmpty()) {
            throw ApiException.badRequest("Record an answer before submitting the viva.");
        }
        if (audio.getSize() > maxAudioBytes) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "That recording exceeds the " + (maxAudioBytes / (1024 * 1024))
                            + " MB transcription limit. Keep the answer under 80 seconds.");
        }

        // Spend one quota slot per attempt, before the paid calls go out.
        aiQuotaService.consume(user.getId());

        VivaConfig config = VivaConfig.forModule(module);
        byte[] recording;
        try {
            recording = audio.getBytes();
        } catch (IOException ex) {
            throw ApiException.badRequest("The uploaded recording could not be read.");
        }

        String transcript = groqAiService.transcribe(
                recording, audio.getOriginalFilename(), audio.getContentType());
        if (transcript.trim().length() < 15) {
            throw ApiException.badRequest(
                    "The examiner could only hear \"" + transcript
                            + "\". Answer in a full sentence and try again.");
        }

        JsonNode verdictJson = groqAiService.generateJson(
                VivaGrader.EXAMINER_SYSTEM_PROMPT,
                vivaGrader.buildPrompt(course.getTitle(), module.getTitle(), config, transcript));
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

        if (!verdict.passed()) {
            log.info("Viva failed for {} on node {} at {}% (needs {}%)",
                    user.getEmail(), moduleId, verdict.score(), config.passThreshold());
            return response(module, verdict, transcript, config, progress, user,
                    0, List.of(), false, false,
                    "The Warden holds: " + verdict.score() + "% (you need "
                            + config.passThreshold() + "%). Read the gaps and answer again.");
        }

        if (retake) {
            return response(module, verdict, transcript, config, progress, user,
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

        log.info("Viva cleared by {} on node {} at {}% - +{} XP",
                user.getEmail(), moduleId, verdict.score(), xpGained);

        String message = leveledUp
                ? "Boss defeated at " + verdict.score() + "%! Level " + newLevel
                        + " reached - new skill branches unlocked."
                : "Boss defeated at " + verdict.score() + "%! +" + xpGained + " XP";

        return response(module, verdict, transcript, config, progress, user,
                xpGained, unlocked, streakIncremented, leveledUp, message);
    }

    private VivaGradeResponse response(Module module,
                                       VivaGrader.VivaVerdict verdict,
                                       String transcript,
                                       VivaConfig config,
                                       UserModuleProgress progress,
                                       User user,
                                       int xpGained,
                                       List<Long> unlockedModuleIds,
                                       boolean streakIncremented,
                                       boolean leveledUp,
                                       String message) {
        return new VivaGradeResponse(
                module.getId(),
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
}
