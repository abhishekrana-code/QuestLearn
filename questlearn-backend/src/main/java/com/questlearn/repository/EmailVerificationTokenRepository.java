package com.questlearn.repository;

import com.questlearn.model.EmailVerificationToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {

    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    /** Single use: exactly one caller can claim an unused row. */
    @Modifying
    @Query("update EmailVerificationToken t set t.usedAt = :usedAt "
            + "where t.id = :id and t.usedAt is null")
    int claim(@Param("id") Long id, @Param("usedAt") Instant usedAt);

    @Modifying
    @Query("update EmailVerificationToken t set t.usedAt = :usedAt "
            + "where t.user.id = :userId and t.usedAt is null")
    int invalidateAllForUser(@Param("userId") Long userId, @Param("usedAt") Instant usedAt);
}
