package com.questlearn.repository;

import com.questlearn.model.AnnouncementRead;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface AnnouncementReadRepository extends JpaRepository<AnnouncementRead, Long> {

    /** One lookup for the page, so a list of notices costs one read query. */
    List<AnnouncementRead> findByUserIdAndAnnouncementIdIn(Long userId, Collection<Long> announcementIds);

    boolean existsByAnnouncementIdAndUserId(Long announcementId, Long userId);

    /** Every read of a page of notes, for receipt counts across a whole course. */
    List<AnnouncementRead> findByAnnouncementIdIn(Collection<Long> announcementIds);

    /** The reads of one note by a known audience, so receipts count only recipients. */
    List<AnnouncementRead> findByAnnouncementIdAndUserIdIn(Long announcementId, Collection<Long> userIds);
}
