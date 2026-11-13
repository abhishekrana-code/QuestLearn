package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuditEntryDto;
import com.questlearn.model.AdminAuditEntry;
import com.questlearn.repository.AdminAuditEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Writes the audit trail and reads it back for the admin page.
 *
 * <p>{@link #record} joins the caller's transaction on purpose: if the action
 * rolls back, its audit row rolls back with it, so the log can never claim an
 * action that did not happen.</p>
 */
@Service
@RequiredArgsConstructor
public class AuditService {

    /** Matches the column widths in V5__admin_audit_log.sql. */
    private static final int TARGET_LIMIT = 200;
    private static final int DETAIL_LIMIT = 400;

    private final AdminAuditEntryRepository auditRepository;

    public void record(AppUserPrincipal actor, String action, String target, String detail) {
        auditRepository.save(AdminAuditEntry.builder()
                .actorId(actor.id())
                .actorEmail(actor.email())
                .action(action)
                .target(clip(target, TARGET_LIMIT))
                .detail(clip(detail, DETAIL_LIMIT))
                .build());
    }

    @Transactional(readOnly = true)
    public List<AuditEntryDto> recent() {
        return auditRepository.findTop50ByOrderByCreatedAtDesc().stream()
                .map(entry -> new AuditEntryDto(
                        entry.getId(),
                        entry.getActorEmail(),
                        entry.getAction(),
                        entry.getTarget(),
                        entry.getDetail(),
                        entry.getCreatedAt()))
                .toList();
    }

    private static String clip(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }
}
