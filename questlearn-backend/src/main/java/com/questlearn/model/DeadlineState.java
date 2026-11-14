package com.questlearn.model;

/**
 * How a node's deadline reads for one learner, derived from the due date and the
 * learner's completion time. Kept as a name on the wire so the client does not
 * have to re-implement the same clock arithmetic.
 */
public enum DeadlineState {
    /** Further away than the reminder window. */
    UPCOMING,
    /** Inside the reminder window and not yet done. */
    DUE_SOON,
    /** The due date has passed and the node is still not cleared. */
    OVERDUE,
    /** Cleared before the due date. */
    COMPLETED,
    /** Cleared, but after the due date. */
    COMPLETED_LATE
}
