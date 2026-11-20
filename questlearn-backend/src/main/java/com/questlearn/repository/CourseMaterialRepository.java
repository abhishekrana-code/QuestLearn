package com.questlearn.repository;

import com.questlearn.model.CourseMaterial;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CourseMaterialRepository extends JpaRepository<CourseMaterial, Long> {

    List<CourseMaterial> findByCourseIdOrderByCreatedAtDesc(Long courseId);

    Optional<CourseMaterial> findByIdAndCourseId(Long id, Long courseId);

    long countByCourseId(Long courseId);

    Optional<CourseMaterial> findByVerityDocumentId(UUID verityDocumentId);
}
