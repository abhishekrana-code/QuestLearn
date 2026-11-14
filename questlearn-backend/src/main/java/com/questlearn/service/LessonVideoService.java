package com.questlearn.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.VideoAttachmentDto;
import com.questlearn.dto.VideoUploadTicketDto;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Module;
import com.questlearn.repository.ModuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Attaches, replaces and removes a node's lesson video.
 *
 * <p>Transactional on purpose: the permission check walks to the course's
 * instructor, which is a lazy association. The file itself is written by
 * {@link MediaStorageService}; this class only owns the JSONB lesson content and
 * the cleanup of a replaced file.</p>
 */
@Service
@RequiredArgsConstructor
public class LessonVideoService {

    private final ModuleRepository moduleRepository;
    private final CourseService courseService;
    private final MediaStorageService mediaStorageService;

    @Transactional
    public VideoAttachmentDto upload(Long moduleId, AppUserPrincipal principal, MultipartFile file) {
        Module module = manageableModule(moduleId, principal);
        String url = mediaStorageService.store(file);
        return attach(module, url, cleanLabel(file.getOriginalFilename()));
    }

    /**
     * A place for the browser to put the file itself, so a large lesson is streamed
     * once into the store rather than through this JVM.
     */
    @Transactional
    public VideoUploadTicketDto uploadTicket(Long moduleId, String filename,
                                             AppUserPrincipal principal) {
        manageableModule(moduleId, principal);
        var ticket = mediaStorageService.beginUpload(filename, null);
        return new VideoUploadTicketDto(ticket.name(), ticket.uploadUrl(), ticket.method(),
                ticket.headers(), ticket.mediaUrl(), ticket.expiresAt(), ticket.maxBytes());
    }

    /**
     * Records an upload the browser completed. The object must really be in the store,
     * so an abandoned or failed upload cannot leave a lesson pointing at nothing.
     */
    @Transactional
    public VideoAttachmentDto attachUpload(Long moduleId, String name, String label,
                                           AppUserPrincipal principal) {
        Module module = manageableModule(moduleId, principal);
        if (!mediaStorageService.existsStored(name)) {
            throw ApiException.badRequest(
                    "That upload did not arrive. Choose the file again, or attach a link.");
        }
        return attach(module, MediaStorageService.PUBLIC_PREFIX + name, cleanLabel(label));
    }

    @Transactional
    public VideoAttachmentDto attachUrl(Long moduleId, AppUserPrincipal principal,
                                        String url, String label) {
        Module module = manageableModule(moduleId, principal);
        return attach(module, validateUrl(url), cleanLabel(label));
    }

    @Transactional
    public VideoAttachmentDto remove(Long moduleId, AppUserPrincipal principal) {
        Module module = manageableModule(moduleId, principal);
        return attach(module, null, null);
    }

    private Module manageableModule(Long moduleId, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        courseService.assertCanManage(module.getCourse(), principal);
        return module;
    }

    /**
     * Writes (or clears) the video fields on the lesson content. The previous
     * upload is deleted first, so replacing a video never leaves an orphan file.
     */
    private VideoAttachmentDto attach(Module module, String url, String label) {
        mediaStorageService.deleteStored(videoField(module, "videoUrl"));

        // Copy into a fresh node: Hibernate compares the stored JSONB by value, and
        // mutating the managed instance in place can slip past dirty checking.
        ObjectNode content = JsonNodeFactory.instance.objectNode();
        JsonNode existing = module.getContent();
        if (existing != null && existing.isObject()) {
            content.setAll((ObjectNode) existing);
        }

        if (url == null || url.isBlank()) {
            content.remove("videoUrl");
            content.remove("videoLabel");
        } else {
            content.put("videoUrl", url);
            if (label == null) {
                content.remove("videoLabel");
            } else {
                content.put("videoLabel", label);
            }
        }

        module.setContent(content);
        moduleRepository.save(module);
        return new VideoAttachmentDto(module.getId(),
                content.path("videoUrl").asText(null),
                content.path("videoLabel").asText(null),
                content);
    }

    private static String videoField(Module module, String field) {
        return module.getContent() == null ? null : module.getContent().path(field).asText(null);
    }

    /** Only http(s). Anything else (javascript:, data:) must never reach a player. */
    private String validateUrl(String raw) {
        String candidate = raw == null ? "" : raw.trim();
        try {
            URI uri = new URI(candidate);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) {
                throw ApiException.badRequest("The link must start with http:// or https://");
            }
            if (uri.getHost() == null) {
                throw ApiException.badRequest("That does not look like a web address.");
            }
            return candidate;
        } catch (URISyntaxException ex) {
            throw ApiException.badRequest("That does not look like a web address.");
        }
    }

    private static String cleanLabel(String label) {
        if (label == null || label.isBlank()) {
            return null;
        }
        String trimmed = label.trim();
        return trimmed.length() > 160 ? trimmed.substring(0, 160) : trimmed;
    }
}
