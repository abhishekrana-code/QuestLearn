/**
 * Deadline states, labels and date helpers shared by the dashboard, the skill
 * tree and the studio.
 *
 * <p>The server decides the state (it owns the due-soon window), so this module
 * only maps it to words and colours. Dates are shown in the learner's local
 * time; the API always speaks UTC instants.</p>
 */

export const DEADLINE_STATE = Object.freeze({
  UPCOMING: {
    label: 'Upcoming',
    chip: 'border-line bg-muted/60 text-fg-muted',
  },
  DUE_SOON: {
    label: 'Due soon',
    chip: 'border-gold/30 bg-brand-tint text-gold-text',
  },
  OVERDUE: {
    label: 'Overdue',
    chip: 'border-danger/30 bg-danger/[0.08] text-danger',
  },
  COMPLETED: {
    label: 'Done',
    chip: 'border-success/30 bg-success/[0.08] text-success',
  },
  COMPLETED_LATE: {
    label: 'Done late',
    chip: 'border-warning/30 bg-warning/[0.08] text-warning',
  },
});

export const deadlineStateMeta = (state) => DEADLINE_STATE[state] ?? null;

/** Finished work stays visible but no longer needs attention. */
export const isOpenDeadline = (deadline) =>
  deadline?.state !== 'COMPLETED' && deadline?.state !== 'COMPLETED_LATE';

const URGENCY = {
  OVERDUE: 0,
  DUE_SOON: 1,
  UPCOMING: 2,
  COMPLETED: 3,
  COMPLETED_LATE: 4,
};

/** Overdue first, then soonest, with finished work kept at the bottom. */
export function sortForPanel(deadlines = []) {
  return [...deadlines].sort((left, right) => {
    const rank = (URGENCY[left.state] ?? 9) - (URGENCY[right.state] ?? 9);
    if (rank !== 0) return rank;
    const byDate = new Date(left.dueAt) - new Date(right.dueAt);
    if (byDate !== 0) return byDate;
    return (left.moduleTitle ?? '').localeCompare(right.moduleTitle ?? '');
  });
}

/** "16 Nov 2026, 11:00" in the browser's locale and time zone. */
export function formatDeadline(iso, locale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The value a datetime-local input expects, in local time. */
export function toDateTimeInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Turns a datetime-local value back into the instant the API stores. */
export function fromDateTimeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * A one-line warning for the map itself. Completed-on-time and upcoming nodes
 * need no badge there; the briefing carries the full date.
 */
export function deadlineHint(state) {
  if (state === 'OVERDUE') return { label: 'Overdue', tone: 'text-danger' };
  if (state === 'DUE_SOON') return { label: 'Due soon', tone: 'text-warning' };
  if (state === 'COMPLETED_LATE') return { label: 'Done late', tone: 'text-warning' };
  return null;
}
