package com.questlearn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A PDF that belongs to one course and is processed by VerityAI.
 *
 * <p>The document itself lives in the VerityAI service; this row is the mapping
 * that keeps a question inside its course. {@code verityDocumentId} is unique:
 * one processed document is attached to exactly one course.</p>
 */
@Entity
@Table(name = "course_materials")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CourseMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    @Column(name = "verity_document_id", nullable = false, unique = true)
    private UUID verityDocumentId;

    @Column(name = "uploaded_by")
    private Long uploadedBy;

    @Column(nullable = false, length = 255)
    private String filename;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    /** Mirrors VerityAI's lifecycle: UPLOADED, PROCESSING, READY or FAILED. */
    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
