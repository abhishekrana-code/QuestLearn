package com.questlearn.repository;

import com.questlearn.model.Course;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CourseRepository extends JpaRepository<Course, Long> {

    List<Course> findAllByOrderByIdAsc();

    List<Course> findByPublishedTrueOrderByIdAsc();

    List<Course> findByInstructorIdOrderByIdAsc(Long instructorId);

    long countByPublishedTrue();
}
