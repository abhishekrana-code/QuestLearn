package com.questlearn.repository;

import com.questlearn.model.Cohort;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CohortRepository extends JpaRepository<Cohort, Long> {

    List<Cohort> findByCourseIdOrderByNameAsc(Long courseId);

    List<Cohort> findByCourseIdIn(Collection<Long> courseIds);

    Optional<Cohort> findByJoinCodeIgnoreCase(String joinCode);

    boolean existsByJoinCode(String joinCode);
}
