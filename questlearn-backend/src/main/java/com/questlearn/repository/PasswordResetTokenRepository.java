package com.questlearn.repository;

import com.questlearn.model.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * Claims the token. The {@code used_at is null} predicate is what makes a link
     * single-use: under a concurrent double submit exactly one call returns 1 and
     * the other sees 0, even before either transaction commits.
     */
    @Modifying
    @Query("update PasswordResetToken t set t.usedAt = :usedAt "
            + "where t.id = :id and t.usedAt is null")
    int claim(@Param("id") Long id, @Param("usedAt") Instant usedAt);

    /** Marks every unused link for an account dead, e.g. when a newer one is issued. */
    @Modifying
    @Query("update PasswordResetToken t set t.usedAt = :usedAt "
            + "where t.user.id = :userId and t.usedAt is null")
    int invalidateAllForUser(@Param("userId") Long userId, @Param("usedAt") Instant usedAt);
}
