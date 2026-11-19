package com.questlearn.service;

import com.questlearn.model.AnnouncementRead;
import com.questlearn.repository.AnnouncementReadRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes one read row, and nothing else.
 *
 * <p>It is a separate bean so the write can run in its own transaction. A duplicate
 * that breaks the unique pair on {@code (announcement_id, user_id)} marks whichever
 * transaction it happens in as rollback-only even when the exception is caught, so
 * the caller's transaction cannot absorb it. Here the row is committed or discarded
 * on its own, and the caller decides what a duplicate means.</p>
 */
@Component
@RequiredArgsConstructor
public class AnnouncementReadRecorder {

    private final AnnouncementReadRepository announcementReadRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long announcementId, Long userId) {
        announcementReadRepository.saveAndFlush(AnnouncementRead.builder()
                .announcementId(announcementId)
                .userId(userId)
                .build());
    }
}
