package com.questlearn.repository;

import com.questlearn.model.ProgressStatus;
import com.questlearn.model.UserModuleProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserModuleProgressRepository extends JpaRepository<UserModuleProgress, Long> {

    Optional<UserModuleProgress> findByUserIdAndModuleId(Long userId, Long moduleId);

    List<UserModuleProgress> findByUserIdAndModuleCourseId(Long userId, Long courseId);

    List<UserModuleProgress> findByUserId(Long userId);

    long countByUserIdAndStatus(Long userId, ProgressStatus status);

    long countByUserIdAndModuleCourseIdAndStatus(Long userId, Long courseId, ProgressStatus status);

    long countByModuleCourseId(Long courseId);
}
