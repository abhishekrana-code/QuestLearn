package com.questlearn.repository;

import com.questlearn.model.CohortMembership;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface CohortMembershipRepository extends JpaRepository<CohortMembership, Long> {

    boolean existsByCohortIdAndUserId(Long cohortId, Long userId);

    long countByCohortId(Long cohortId);

    List<CohortMembership> findByCohortIdOrderByJoinedAtAsc(Long cohortId);

    List<CohortMembership> findByUserIdAndCohortIdIn(Long userId, Collection<Long> cohortIds);
}
