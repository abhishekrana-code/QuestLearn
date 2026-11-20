package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseMaterialDto;
import com.questlearn.dto.MaterialAnswerDto;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Course;
import com.questlearn.model.CourseMaterial;
import com.questlearn.model.Role;
import com.questlearn.repository.CourseMaterialRepository;
import com.questlearn.repository.CourseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CourseMaterialServiceTest {

    private static final Long COURSE_ID = 7L;
    private static final Long USER_ID = 3L;
    private static final UUID DOC_A = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID DOC_B = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private final CourseRepository courseRepository = mock(CourseRepository.class);
    private final CourseMaterialRepository materialRepository = mock(CourseMaterialRepository.class);
    private final CourseService courseService = mock(CourseService.class);
    private final VerityAiClient verity = mock(VerityAiClient.class);
    private final AiQuotaService quota = mock(AiQuotaService.class);
    private final AuditService audit = mock(AuditService.class);

    private final AppUserPrincipal instructor =
            new AppUserPrincipal(USER_ID, "teacher@questlearn.dev", Role.INSTRUCTOR);

    private CourseMaterialService service;

    @BeforeEach
    void setUp() {
        service = new CourseMaterialService(courseRepository, materialRepository, courseService,
                verity, quota, audit);
        ReflectionTestUtils.setField(service, "maxMaterialsPerCourse", 20);

        when(courseRepository.findWithInstructorById(COURSE_ID))
                .thenReturn(Optional.of(Course.builder().id(COURSE_ID).title("Economics").build()));
        when(verity.isConfigured()).thenReturn(true);
        when(verity.maxFileBytes()).thenReturn(25L * 1024 * 1024);
        when(materialRepository.countByCourseId(COURSE_ID)).thenReturn(0L);
        when(materialRepository.save(any(CourseMaterial.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void uploadLinksTheVerityDocumentToTheCourse() {
        when(verity.upload(eq("notes.pdf"), any()))
                .thenReturn(new VerityAiClient.UploadedDocument(DOC_A, "notes.pdf", "UPLOADED"));
        MockMultipartFile file = new MockMultipartFile("file", "notes.pdf",
                "application/pdf", "%PDF-1.4\ncontent".getBytes(StandardCharsets.UTF_8));

        CourseMaterialDto dto = service.upload(COURSE_ID, instructor, file);

        assertThat(dto.filename()).isEqualTo("notes.pdf");
        assertThat(dto.status()).isEqualTo("UPLOADED");
        verify(courseService).assertCanManage(any(), eq(instructor));
        verify(verity).upload(eq("notes.pdf"), any());
        verify(audit).record(eq(instructor), eq("course.material.added"), eq("Economics"), eq("notes.pdf"));
    }

    @Test
    void aFileThatOnlyClaimsToBePdfIsRejectedBeforeTheNetworkCall() {
        MockMultipartFile file = new MockMultipartFile("file", "notes.pdf",
                "application/pdf", "not a pdf".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> service.upload(COURSE_ID, instructor, file))
                .isInstanceOf(ApiException.class)
                .hasMessage("That file is not a PDF.");
        verify(verity, never()).upload(any(), any());
    }

    @Test
    void askSendsOnlyReadyMaterialsAndMapsCitationsBackToTheRow() {
        CourseMaterial ready = material(11L, DOC_A, "notes.pdf", "READY");
        CourseMaterial processing = material(12L, DOC_B, "chapter.pdf", "PROCESSING");
        when(materialRepository.findByCourseIdOrderByCreatedAtDesc(COURSE_ID))
                .thenReturn(List.of(ready, processing));
        when(verity.ask(eq("QuestLearn: Economics"), anyList(), eq("What changed?")))
                .thenReturn(new VerityAiClient.Answer("Revenue rose [S1].", "SUFFICIENT",
                        List.of(new VerityAiClient.Citation(DOC_A, "notes.pdf", 4, "Revenue rose 12%."))));

        MaterialAnswerDto answer = service.ask(COURSE_ID, instructor, "  What changed?  ");

        assertThat(answer.answer()).isEqualTo("Revenue rose [S1].");
        assertThat(answer.evidenceStatus()).isEqualTo("SUFFICIENT");
        assertThat(answer.citations()).hasSize(1);
        assertThat(answer.citations().get(0).materialId()).isEqualTo(11L);
        assertThat(answer.citations().get(0).pageNumber()).isEqualTo(4);
        verify(quota).consume(USER_ID);
        verify(verity).ask(eq("QuestLearn: Economics"), eq(List.of(DOC_A)), eq("What changed?"));
    }

    @Test
    void askIsRefusedUntilAtLeastOneMaterialIsReady() {
        when(materialRepository.findByCourseIdOrderByCreatedAtDesc(COURSE_ID))
                .thenReturn(List.of(material(12L, DOC_B, "chapter.pdf", "PROCESSING")));

        assertThatThrownBy(() -> service.ask(COURSE_ID, instructor, "What changed?"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("no processed materials");
        verify(verity, never()).ask(any(), anyList(), any());
    }

    @Test
    void removeDeletesTheVerityDocumentBeforeTheRow() {
        CourseMaterial material = material(11L, DOC_A, "notes.pdf", "READY");
        when(materialRepository.findByIdAndCourseId(11L, COURSE_ID))
                .thenReturn(Optional.of(material));

        service.delete(COURSE_ID, 11L, instructor);

        verify(verity).delete(DOC_A);
        verify(materialRepository).delete(material);
        verify(audit).record(eq(instructor), eq("course.material.removed"), eq("Economics"), eq("notes.pdf"));
    }

    private static CourseMaterial material(Long id, UUID documentId, String filename, String status) {
        return CourseMaterial.builder()
                .id(id)
                .courseId(COURSE_ID)
                .verityDocumentId(documentId)
                .filename(filename)
                .status(status)
                .sizeBytes(1024)
                .build();
    }
}
