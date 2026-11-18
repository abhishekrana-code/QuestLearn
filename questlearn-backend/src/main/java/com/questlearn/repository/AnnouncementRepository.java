package com.questlearn.repository;

import com.questlearn.model.Announcement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AnnouncementRepository extends JpaRepository<Announcement, Long> {

    /** Newest first, with the id breaking a tie between two posted in one instant. */
    List<Announcement> findByCourseIdOrderByCreatedAtDescIdDesc(Long courseId);
}
