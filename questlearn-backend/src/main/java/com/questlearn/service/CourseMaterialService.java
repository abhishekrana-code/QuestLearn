package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseMaterialDto;
import com.questlearn.dto.MaterialAnswerDto;
import com.questlearn.dto.MaterialCitationDto;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Course;
import com.questlearn.model.CourseMaterial;
import com.questlearn.repository.CourseMaterialRepository;
import com.questlearn.repository.CourseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Course materials and the questions asked about them.
 *
 * <p>The permission rule is the course rule: whoever may manage the course may
 * add or remove readings, and whoever may view it may ask about them. The PDF
 * itself is processed by VerityAI; this service only keeps the course mapping,
 * the visible status and the cost guard around questions.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CourseMaterialService {

    private final CourseRepository courseRepository;
    private final CourseMaterialRepository materialRepository;
    private final CourseService courseService;
    private final VerityAiClient verity;
    private final AiQuotaService aiQuotaService;
    private final AuditService auditService;

    @Value("${questlearn.verity.max-materials-per-course:20}")
    private int maxMaterialsPerCourse;

    public List<CourseMaterialDto> list(Long courseId, AppUserPrincipal principal, boolean refresh) {
        Course course = loadCourse(courseId);
        courseService.assertCanView(course, principal);

        List<CourseMaterial> materials = materialRepository.findByCourseIdOrderByCreatedAtDesc(courseId);
        if (refresh && verity.isConfigured()) {
            materials = refreshProcessing(materials);
        }
        return materials.stream().map(this::toDto).toList();
    }

    public CourseMaterialDto upload(Long courseId, AppUserPrincipal principal, MultipartFile file) {
        Course course = loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        if (!verity.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Course materials are not configured on this server.");
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Choose a PDF first.");
        }
        if (file.getSize() > verity.maxFileBytes()) {
            throw ApiException.badRequest("That PDF is " + megabytes(file.getSize())
                    + " MB. The limit is " + megabytes(verity.maxFileBytes()) + " MB.");
        }
        if (materialRepository.countByCourseId(courseId) >= maxMaterialsPerCourse) {
            throw ApiException.badRequest("This course already has the maximum of "
                    + maxMaterialsPerCourse + " materials. Remove one before adding another.");
        }

        String filename = cleanFilename(file.getOriginalFilename());
        if (!filename.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            throw ApiException.badRequest("Only PDF course materials can be uploaded.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw ApiException.badRequest("That file could not be read. Choose it again.");
        }
        if (!looksLikePdf(bytes)) {
            throw ApiException.badRequest("That file is not a PDF.");
        }

        VerityAiClient.UploadedDocument uploaded = verity.upload(filename, bytes);
        if (uploaded == null || uploaded.id() == null) {
            throw ApiException.badGateway(
                    "The document service did not confirm the upload. Try again shortly.");
        }

        CourseMaterial material = CourseMaterial.builder()
                .courseId(courseId)
                .verityDocumentId(uploaded.id())
                .uploadedBy(principal.id())
                .filename(StringUtils.hasText(uploaded.filename()) ? uploaded.filename() : filename)
                .sizeBytes(bytes.length)
                .status(StringUtils.hasText(uploaded.status()) ? uploaded.status() : "UPLOADED")
                .build();
        material = materialRepository.save(material);
        auditService.record(principal, "course.material.added", course.getTitle(), material.getFilename());
        return toDto(material);
    }

    public void delete(Long courseId, Long materialId, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        courseService.assertCanManage(course, principal);

        CourseMaterial material = materialRepository.findByIdAndCourseId(materialId, courseId)
                .orElseThrow(() -> ApiException.notFound("Material not found"));

        // Remove the source first. If VerityAI is unreachable the row stays, so a
        // retry can still find and delete the document instead of orphaning it.
        if (verity.isConfigured()) {
            verity.delete(material.getVerityDocumentId());
        }
        materialRepository.delete(material);
        auditService.record(principal, "course.material.removed", course.getTitle(), material.getFilename());
    }

    public MaterialAnswerDto ask(Long courseId, AppUserPrincipal principal, String rawQuestion) {
        Course course = loadCourse(courseId);
        courseService.assertCanView(course, principal);

        String question = rawQuestion == null ? "" : rawQuestion.trim();
        if (question.length() < 3) {
            throw ApiException.badRequest("Type a question first.");
        }
        if (question.length() > 4000) {
            throw ApiException.badRequest("Keep the question under 4000 characters.");
        }
        if (!verity.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Course materials are not configured on this server.");
        }

        Map<UUID, CourseMaterial> ready = new LinkedHashMap<>();
        for (CourseMaterial material : materialRepository.findByCourseIdOrderByCreatedAtDesc(courseId)) {
            if ("READY".equals(material.getStatus())) {
                ready.put(material.getVerityDocumentId(), material);
            }
        }
        if (ready.isEmpty()) {
            throw ApiException.badRequest(
                    "This course has no processed materials yet. Wait for the upload to finish, then ask again.");
        }

        // The question spends the same Groq budget as the viva and authoring calls.
        aiQuotaService.consume(principal.id());

        VerityAiClient.Answer answer = verity.ask(
                "QuestLearn: " + course.getTitle(),
                List.copyOf(ready.keySet()),
                question);

        List<MaterialCitationDto> citations = new ArrayList<>();
        for (VerityAiClient.Citation citation : answer.citations()) {
            CourseMaterial material = citation.documentId() == null
                    ? null : ready.get(citation.documentId());
            citations.add(new MaterialCitationDto(
                    material == null ? null : material.getId(),
                    StringUtils.hasText(citation.documentName())
                            ? citation.documentName()
                            : material == null ? "" : material.getFilename(),
                    citation.pageNumber(),
                    citation.excerpt()));
        }

        return new MaterialAnswerDto(answer.content(), answer.evidenceStatus(), List.copyOf(citations));
    }

    private List<CourseMaterial> refreshProcessing(List<CourseMaterial> materials) {
        List<CourseMaterial> refreshed = new ArrayList<>(materials.size());
        for (CourseMaterial material : materials) {
            if ("READY".equals(material.getStatus()) || "FAILED".equals(material.getStatus())) {
                refreshed.add(material);
                continue;
            }
            try {
                VerityAiClient.DocumentState state = verity.state(material.getVerityDocumentId());
                if (state != null && StringUtils.hasText(state.status())
                        && !state.status().equals(material.getStatus())) {
                    material.setStatus(state.status());
                    material.setErrorMessage(state.errorMessage());
                    material.setUpdatedAt(Instant.now());
                    material = materialRepository.save(material);
                }
            } catch (RuntimeException ex) {
                // A status refresh is best effort: the list still answers from the
                // last state QuestLearn saw.
                log.debug("Could not refresh material {} status", material.getId(), ex);
            }
            refreshed.add(material);
        }
        return refreshed;
    }

    private Course loadCourse(Long courseId) {
        return courseRepository.findWithInstructorById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }

    private CourseMaterialDto toDto(CourseMaterial material) {
        return new CourseMaterialDto(
                material.getId(),
                material.getFilename(),
                material.getSizeBytes(),
                material.getStatus(),
                material.getErrorMessage(),
                material.getCreatedAt());
    }

    private static boolean looksLikePdf(byte[] bytes) {
        return bytes.length >= 5
                && bytes[0] == '%'
                && bytes[1] == 'P'
                && bytes[2] == 'D'
                && bytes[3] == 'F'
                && bytes[4] == '-';
    }

    private static String cleanFilename(String original) {
        String name = original == null ? "" : original.trim();
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) {
            name = name.substring(slash + 1);
        }
        if (!StringUtils.hasText(name)) {
            name = "course-material.pdf";
        }
        return name.length() <= 255 ? name : name.substring(name.length() - 255);
    }

    private static long megabytes(long bytes) {
        return Math.max(1, Math.round(bytes / (1024.0 * 1024.0)));
    }
}
