package com.questlearn.repository;

import com.questlearn.model.AnnouncementRead;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface AnnouncementReadRepository extends JpaRepository<AnnouncementRead, Long> {

    /** One lookup for the page, so a list of notices costs one read query. */
    List<AnnouncementRead> findByUserIdAndAnnouncementIdIn(Long userId, Collection<Long> announcementIds);

    boolean existsByAnnouncementIdAndUserId(Long announcementId, Long userId);
}
