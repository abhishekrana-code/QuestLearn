import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock3, Mail } from 'lucide-react';
import api, { apiError } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  deadlineStateMeta,
  formatDeadline,
  isOpenDeadline,
  sortForPanel,
} from '../../services/deadlines.js';

const MAX_SHOWN = 5;

/**
 * The learner's dated work, plus the digest opt-out.
 *
 * <p>Overdue and due-soon nodes come first because that is what the panel is
 * for; completed work stays quietly at the bottom. The toggle writes the
 * preference on the account, so it follows the learner between devices.</p>
 */
export default function DeadlinePanel({ overview, onChange, className = '' }) {
  const { updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!overview || (overview.deadlines ?? []).length === 0) {
    return null;
  }

  const deadlines = sortForPanel(overview.deadlines);
  const open = deadlines.filter(isOpenDeadline);
  const shown = deadlines.slice(0, MAX_SHOWN);
  const enabled = Boolean(overview.deadlineEmailsEnabled);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch('/auth/notification-preferences', {
        deadlineEmails: !enabled,
      });
      updateUser({ notifyDeadlines: data.notifyDeadlines });
      onChange?.({ ...overview, deadlineEmailsEnabled: data.notifyDeadlines });
    } catch (toggleError) {
      setError(apiError(toggleError, 'Could not update your email reminder setting.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="deadline-panel-title" className={`panel p-5 ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h2
          id="deadline-panel-title"
          className="flex items-center gap-2 text-[14px] font-semibold text-foreground"
        >
          <CalendarClock size={15} className="text-gold-text" />
          Deadlines
        </h2>
        <span
          className={`chip ${
            open.length > 0
              ? 'border-gold/30 bg-brand-tint text-gold-text'
              : 'border-success/30 bg-success/[0.08] text-success'
          }`}
        >
          {open.length > 0 ? `${open.length} open` : 'All clear'}
        </span>
      </div>

      <ul className="space-y-2">
        {shown.map((deadline) => {
          const meta = deadlineStateMeta(deadline.state) ?? {
            label: deadline.state,
            chip: 'border-line bg-muted text-fg-muted',
          };
          return (
            <li key={`${deadline.courseId}-${deadline.moduleId}`}>
              <Link
                to={`/courses/${deadline.courseId}`}
                className="block rounded-xl border border-line bg-muted/20 px-3 py-2.5 transition-colors duration-150 hover:border-gold/40 hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-foreground">
                    {deadline.moduleTitle}
                  </p>
                  <span className={`chip shrink-0 ${meta.chip}`}>{meta.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[10.5px] text-fg-subtle">
                  {deadline.courseEmoji || '🗺️'} {deadline.courseTitle}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[10.5px] text-fg-muted">
                  <Clock3 size={11} />
                  {formatDeadline(deadline.dueAt)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {deadlines.length > MAX_SHOWN && (
        <p className="mt-2 text-[10.5px] text-fg-subtle">
          +{deadlines.length - MAX_SHOWN} more dated node
          {deadlines.length - MAX_SHOWN === 1 ? '' : 's'}. Open a course to see them all.
        </p>
      )}

      <div className="mt-4 flex items-start gap-3 border-t border-line pt-3.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-fg-muted">
          <Mail size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-foreground">
            Email reminders
            {busy && <span className="ml-1.5 font-normal text-fg-subtle">saving…</span>}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-4 text-fg-subtle">
            One daily digest for due and overdue nodes. You can still finish late.
          </p>
          {error && (
            <p role="alert" className="mt-1 text-[10.5px] leading-4 text-danger">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Email reminders for deadlines"
          onClick={toggle}
          disabled={busy}
          className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-60 ${
            enabled ? 'border-gold bg-gold' : 'border-line bg-muted'
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-card shadow transition-transform duration-150 ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
