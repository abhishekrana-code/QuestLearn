package com.questlearn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/**
 * A class taught inside a course: "10B", "Period 3", "Autumn cohort".
 *
 * <p>The join code is how students land in it. It is stored in clear because a
 * teacher has to be able to read it out; it grants nothing beyond membership and
 * enrollment in one published course.</p>
 */
@Entity
@Table(name = "cohorts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Cohort {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "join_code", nullable = false, length = 12)
    private String joinCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
