package com.questlearn.repository;

import com.questlearn.model.AdminAuditEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AdminAuditEntryRepository extends JpaRepository<AdminAuditEntry, Long> {

    List<AdminAuditEntry> findTop50ByOrderByCreatedAtDesc();
}
