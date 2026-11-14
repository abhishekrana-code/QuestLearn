import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import api, { apiError } from '../../services/api.js';

/** Local datetime string for an ISO instant, in the teacher's own time zone. */
function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function formatDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One class's exceptions to the course-wide due dates.
 *
 * <p>Collapsed by default: most classes follow the course dates, and this should not
 * be the loudest thing on the page for the teacher who never needs it.</p>
 */
export default function CohortDeadlineEditor({ courseId, cohort, nodes, onNotice }) {
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState([]);
  const [nodeId, setNodeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/courses/${courseId}/cohorts/${cohort.id}/deadlines`);
      setOverrides(data);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load this class’s dates.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, cohort.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = async (event) => {
    event.preventDefault();
    if (!nodeId || !dueAt) return;
    setBusy(true);
    setError(null);
    try {
      await api.put(`/courses/${courseId}/cohorts/${cohort.id}/modules/${nodeId}/deadline`, {
        dueAt: new Date(dueAt).toISOString(),
      });
      onNotice?.({
        type: 'success',
        text: `${cohort.name} now has its own date for that node. Only its members see it.`,
      });
      setNodeId('');
      setDueAt('');
      await load();
    } catch (saveError) {
      setError(apiError(saveError, 'Could not save that date.'));
    } finally {
      setBusy(false);
    }
  };

  const clear = async (moduleId) => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/courses/${courseId}/cohorts/${cohort.id}/modules/${moduleId}/deadline`);
      onNotice?.({
        type: 'success',
        text: 'Override removed. That node is back on the course date for this class.',
      });
      await load();
    } catch (clearError) {
      setError(apiError(clearError, 'Could not remove that date.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 w-full border-t border-line pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted transition-colors hover:text-foreground"
      >
        <CalendarClock size={13} />
        Class due dates
        {overrides.length > 0 && (
          <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] tabular-nums text-gold-text">
            {overrides.length}
          </span>
        )}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="mt-2.5 rounded-lg border border-line bg-muted/30 p-3">
          <p className="text-[11px] leading-relaxed text-fg-subtle">
            A date here applies only to this class. Clearing it puts the node back on the
            course date for everyone in it.
          </p>

          <form onSubmit={save} className="mt-2.5 flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="label">Node</span>
              <select
                className="field h-9 w-full text-[11px]"
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
              >
                <option value="">Choose a node…</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title}
                    {node.dueAt ? '' : ' (no course date)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Class due date</span>
              <input
                type="datetime-local"
                className="field h-9 max-w-[210px] text-[11px]"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn-primary h-9 text-[11px]"
              disabled={busy || !nodeId || !dueAt}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>

          {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
          {loading && <p className="mt-2 text-[11px] text-fg-subtle">Loading dates…</p>}

          {!loading && overrides.length === 0 && (
            <p className="mt-2 text-[11px] text-fg-subtle">
              This class follows the course dates everywhere.
            </p>
          )}

          <ul className="mt-2 divide-y divide-line">
            {overrides.map((row) => (
              <li key={row.moduleId} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                  {row.moduleTitle}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">
                  {formatDay(row.dueAt)}
                </span>
                <button
                  type="button"
                  onClick={() => clear(row.moduleId)}
                  disabled={busy}
                  aria-label={`Remove the class date for ${row.moduleTitle}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-fg-subtle transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
