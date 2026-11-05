package com.questlearn.repository;

import com.questlearn.model.Role;
import com.questlearn.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<User> findAllByOrderByTotalXpDesc();

    List<User> findTop10ByRoleOrderByTotalXpDesc(Role role);

    long countByRole(Role role);
}
