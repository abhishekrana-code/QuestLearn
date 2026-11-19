package com.questlearn.repository;

import com.questlearn.model.Announcement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface AnnouncementRepository extends JpaRepository<Announcement, Long> {

    /** Newest first, with the id breaking a tie between two posted in one instant. */
    List<Announcement> findByCourseIdOrderByCreatedAtDescIdDesc(Long courseId);

    /**
     * The same order across several courses, so a learner's feed costs one query
     * however many courses they are on.
     */
    List<Announcement> findByCourseIdInOrderByCreatedAtDescIdDesc(Collection<Long> courseIds);
}
