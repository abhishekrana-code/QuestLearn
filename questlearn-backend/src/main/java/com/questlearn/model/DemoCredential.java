package com.questlearn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * The shared demo password after an admin rotated it from the console.
 *
 * <p>One row, id 1, written only by that rotation. Its presence is what tells the
 * startup seeder to leave the five demo accounts alone, so a password chosen in
 * the browser survives a restart. Only the hash is kept; the value is shown once
 * and then exists nowhere else.</p>
 */
@Entity
@Table(name = "demo_credential")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DemoCredential {

    public static final int SINGLETON_ID = 1;

    @Id
    private Integer id;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "rotated_at", nullable = false)
    private Instant rotatedAt;

    @Column(name = "rotated_by")
    private String rotatedBy;
}
