package com.questlearn.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * A single node on the course skill tree. {@code content} is stored as JSONB so
 * instructors can attach lesson blocks of any shape without migrations.
 */
@Entity
@Table(name = "modules")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Module {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 800)
    private String summary;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "content")
    private JsonNode content;

    @Column(nullable = false)
    private int xpReward;

    /** Horizontal slot on the RPG canvas (0 = leftmost branch). */
    @Column(nullable = false)
    private int positionX;

    /** Vertical slot on the RPG canvas (0 = top of the tree). */
    @Column(nullable = false)
    private int positionY;

    @Column(nullable = false)
    private int orderIndex;

    /**
     * When the node is due, or null for self-paced work.
     *
     * <p>The deadline is advisory: the node stays open and playable afterwards,
     * and a completion after this instant is simply recorded as late. That keeps
     * a mail outage, a sick day or a clock mistake from locking a class out.</p>
     */
    @Column(name = "due_at")
    private Instant dueAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_module_id")
    private Module parentModule;

    @OneToOne(mappedBy = "module", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private Quiz quiz;
}
