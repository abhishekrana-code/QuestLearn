package com.questlearn.repository;

import com.questlearn.model.Enrollment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface EnrollmentRepository extends JpaRepository<Enrollment, Long> {

    boolean existsByUserIdAndCourseId(Long userId, Long courseId);

    Optional<Enrollment> findByUserIdAndCourseId(Long userId, Long courseId);

    List<Enrollment> findByUserIdOrderByEnrolledAtDesc(Long userId);

    long countByCourseId(Long courseId);

    long deleteByUserIdAndCourseId(Long userId, Long courseId);

    /**
     * Roster sizes for a page of courses in one query. Returns {courseId, count}
     * pairs; callers default missing ids to zero.
     */
    @Query("""
            select enrollment.courseId, count(enrollment)
            from Enrollment enrollment
            where enrollment.courseId in :courseIds
            group by enrollment.courseId
            """)
    List<Object[]> countByCourseIds(@Param("courseIds") Collection<Long> courseIds);
}
