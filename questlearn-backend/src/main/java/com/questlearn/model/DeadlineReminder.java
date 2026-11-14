package com.questlearn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * One digest message already sent about one node deadline.
 *
 * <p>The unique key includes the due date, so moving a deadline permits a fresh
 * reminder while repeating the nightly job does not duplicate an inbox entry.</p>
 */
@Entity
@Table(name = "deadline_reminders",
        uniqueConstraints = @UniqueConstraint(name = "uk_deadline_reminders",
                columnNames = {"user_id", "module_id", "kind", "due_at"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeadlineReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id", nullable = false)
    private Module module;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ReminderKind kind;

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;
}
