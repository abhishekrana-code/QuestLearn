package com.questlearn.repository;

import com.questlearn.model.Course;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CourseRepository extends JpaRepository<Course, Long> {

    /**
     * Loads the owner with the course so a permission check outside a transaction
     * does not trip over a lazy association.
     */
    @EntityGraph(attributePaths = "instructor")
    @Query("select c from Course c where c.id = :id")
    Optional<Course> findWithInstructorById(@Param("id") Long id);

    List<Course> findAllByOrderByIdAsc();

    List<Course> findByPublishedTrueOrderByIdAsc();

    List<Course> findByInstructorIdOrderByIdAsc(Long instructorId);

    long countByPublishedTrue();
}
