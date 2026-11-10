package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.exception.ApiException;
import com.questlearn.exception.GroqAiException;
import com.questlearn.model.Course;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class VivaServiceConcurrencyTest {

    private final ModuleRepository moduleRepository = mock(ModuleRepository.class);
    private final ModuleAttemptRepository attemptRepository = mock(ModuleAttemptRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserModuleProgressRepository progressRepository = mock(UserModuleProgressRepository.class);
    private final CourseService courseService = mock(CourseService.class);
    private final ProgressService progressService = mock(ProgressService.class);
    private final GamificationService gamificationService = mock(GamificationService.class);
    private final GroqAiService groqAiService = mock(GroqAiService.class);
    private final VivaGrader vivaGrader = mock(VivaGrader.class);
    private final AiQuotaService aiQuotaService = mock(AiQuotaService.class);

    /** One permit: the second caller must be told to wait rather than queued. */
    private VivaService service() {
        VivaService service = new VivaService(moduleRepository, attemptRepository, userRepository,
                progressRepository, courseService, progressService, gamificationService,
                groqAiService, vivaGrader, aiQuotaService, 1);
        // @Value fields stay 0 outside Spring, and a 0 byte limit would reject the upload.
        ReflectionTestUtils.setField(service, "maxAudioBytes", 26_214_400L);
        return service;
    }

    @Test
    void aSecondVivaIsRefusedWhileOneIsBeingGraded() throws Exception {
        VivaService service = service();
        AppUserPrincipal principal = new AppUserPrincipal(7L, "leo@questlearn.dev", Role.STUDENT);

        Course course = Course.builder().title("Course").build();
        Module module = Module.builder().id(1L).title("React Components").course(course).build();
        when(moduleRepository.findById(1L)).thenReturn(Optional.of(module));
        when(userRepository.findById(7L)).thenReturn(Optional.of(
                User.builder().id(7L).email("leo@questlearn.dev").role(Role.STUDENT).build()));
        when(progressRepository.findByUserIdAndModuleId(7L, 1L)).thenReturn(Optional.of(
                UserModuleProgress.builder().status(ProgressStatus.UNLOCKED).score(0).attempts(0).build()));

        CountDownLatch transcribing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        // The first student's recording is stuck inside the Groq call, holding the permit.
        when(groqAiService.transcribe(any(), any(), any())).thenAnswer(call -> {
            transcribing.countDown();
            release.await(5, TimeUnit.SECONDS);
            throw GroqAiException.upstream("test stops here");
        });

        Thread first = new Thread(() -> {
            try {
                service.gradeViva(1L, principal,
                        new MockMultipartFile("audio", "viva.webm", "audio/webm", new byte[]{1, 2, 3}));
            } catch (RuntimeException expected) {
                // The stubbed Groq failure ends the first call; only the permit matters here.
            }
        });
        first.start();

        assertThat(transcribing.await(5, TimeUnit.SECONDS))
                .as("the first viva should reach Groq and hold the only permit")
                .isTrue();

        assertThatThrownBy(() -> service.gradeWrittenAnswer(1L, principal,
                "Components let you split the UI into independent, reusable pieces."))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Several students are being examined right now")
                .satisfies(error -> assertThat(((ApiException) error).getStatus())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        release.countDown();
        first.join(5_000);
        assertThat(first.isAlive()).isFalse();
    }

    @Test
    void thePermitIsReleasedAfterAFailedAttemptSoTheNextTryWorks() {
        VivaService service = service();
        AppUserPrincipal principal = new AppUserPrincipal(7L, "leo@questlearn.dev", Role.STUDENT);

        // No stubs at all: the call fails inside openAttempt, and the permit must still
        // be returned, so the second call reaches openAttempt too rather than getting 429.
        assertThatThrownBy(() -> service.gradeWrittenAnswer(1L, principal,
                "Components let you split the UI into independent, reusable pieces."))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Module not found");

        assertThatThrownBy(() -> service.gradeWrittenAnswer(1L, principal,
                "Components let you split the UI into independent, reusable pieces."))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Module not found");
    }
}
