package com.questlearn.repository;

import com.questlearn.model.ProgressStatus;
import com.questlearn.model.UserModuleProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserModuleProgressRepository extends JpaRepository<UserModuleProgress, Long> {

    Optional<UserModuleProgress> findByUserIdAndModuleId(Long userId, Long moduleId);

    List<UserModuleProgress> findByUserIdAndModuleCourseId(Long userId, Long courseId);

    List<UserModuleProgress> findByUserId(Long userId);

    long countByUserIdAndStatus(Long userId, ProgressStatus status);

    long countByUserIdAndModuleCourseIdAndStatus(Long userId, Long courseId, ProgressStatus status);

    long countByModuleCourseId(Long courseId);

    /** Every completed row in a course, for the course-scoped leaderboard. */
    List<UserModuleProgress> findByModuleCourseIdAndStatus(Long courseId, ProgressStatus status);

    /** Every completed row in the database, for the school-wide combined board. */
    List<UserModuleProgress> findByStatus(ProgressStatus status);

    /**
     * Every progress row a set of learners has in one course, so a roster loads in
     * a single query instead of one per learner.
     */
    List<UserModuleProgress> findByModuleCourseIdAndUserIdIn(Long courseId, Collection<Long> userIds);
}
