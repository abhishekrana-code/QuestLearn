package com.questlearn.repository;

import com.questlearn.model.DemoCredential;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DemoCredentialRepository extends JpaRepository<DemoCredential, Integer> {
}
