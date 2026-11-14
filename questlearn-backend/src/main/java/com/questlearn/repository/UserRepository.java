package com.questlearn.repository;

import com.questlearn.model.Role;
import com.questlearn.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<User> findAllByOrderByTotalXpDesc();

    Page<User> findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
            String name, String email, Pageable pageable);

    List<User> findTop10ByRoleOrderByTotalXpDesc(Role role);

    /** Learners who still want the deadline digest. */
    List<User> findByRoleAndNotifyDeadlinesTrue(Role role);

    long countByRole(Role role);
}
