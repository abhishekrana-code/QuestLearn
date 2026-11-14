package com.questlearn.repository;

import com.questlearn.model.CohortDeadline;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CohortDeadlineRepository extends JpaRepository<CohortDeadline, Long> {

    List<CohortDeadline> findByCohortIdOrderByDueAtAsc(Long cohortId);

    List<CohortDeadline> findByCohortIdIn(Collection<Long> cohortIds);

    Optional<CohortDeadline> findByCohortIdAndModuleId(Long cohortId, Long moduleId);
}
