package com.questlearn.repository;

import com.questlearn.model.ModuleAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ModuleAttemptRepository extends JpaRepository<ModuleAttempt, Long> {

    /** Newest first; the briefing shows only the tail of a long history. */
    List<ModuleAttempt> findTop10ByUserIdAndModuleIdOrderByCreatedAtDesc(Long userId, Long moduleId);

    List<ModuleAttempt> findByUserIdAndModuleIdOrderByCreatedAtAsc(Long userId, Long moduleId);

    long countByModuleCourseId(Long courseId);

    /** One learner's whole trail in a course, oldest first, for the roster drill-down. */
    List<ModuleAttempt> findByUserIdAndModuleCourseIdOrderByCreatedAtAsc(Long userId, Long courseId);

    List<ModuleAttempt> findByModuleCourseIdAndUserIdInOrderByCreatedAtAsc(
            Long courseId, Collection<Long> userIds);
}
