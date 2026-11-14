package com.questlearn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 180)
    private String email;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(nullable = false)
    private int totalXp;

    @Column(nullable = false)
    private int currentLevel;

    @Column(nullable = false)
    private int streakDays;

    /**
     * Incremented when existing sessions must stop working (password change or
     * an admin-issued reset). Tokens carry the value they were issued with, so
     * an increment invalidates every token issued before it.
     */
    @Column(nullable = false)
    private int tokenVersion;

    /**
     * Whether the owner has opened the confirmation link sent to their address.
     * Verification is soft: an unconfirmed account keeps full access and only sees
     * a reminder, so a mail outage cannot lock a class out of its work.
     */
    @Column(nullable = false)
    private boolean emailVerified;

    /**
     * Whether the daily deadline digest may be emailed to this account. On by
     * default; a learner turns it off from the dashboard.
     */
    @Column(name = "notify_deadlines", nullable = false)
    @Builder.Default
    private boolean notifyDeadlines = true;

    private LocalDate lastActivityDate;

    @Column(nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (currentLevel < 1) {
            currentLevel = 1;
        }
    }
}
