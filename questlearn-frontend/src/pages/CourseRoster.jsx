import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Download, Lock, Unlock, Users } from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';
import { rosterFileName, rosterToRows, toCsv } from '../services/rosterCsv.js';

const STATUS = {
  COMPLETED: { label: 'Cleared', chip: 'border-success/30 bg-success/[0.08] text-success', Icon: Check },
  UNLOCKED: { label: 'Open', chip: 'border-gold/30 bg-gold/[0.08] text-gold-text', Icon: Unlock },
  LOCKED: { label: 'Locked', chip: 'border-line text-fg-subtle', Icon: Lock },
};

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Hands a CSV to the browser as a download. The byte-order mark keeps Excel from
 * guessing the wrong encoding on a Windows machine.
 */
function downloadCsv(roster) {
  const blob = new Blob([`\uFEFF${toCsv(rosterToRows(roster))}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = rosterFileName(roster);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function shortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * A node as this learner has it. The strip keeps the course order the teacher
 * built, so an empty gap in the middle reads as "stuck here" rather than
 * "completed everything".
 */
function NodePill({ node }) {
  const { label, chip, Icon } = STATUS[node.status] ?? STATUS.LOCKED;
  const detail =
    node.status === 'COMPLETED'
      ? `${node.score}%${node.attempts > 1 ? ` · ${node.attempts} tries` : ''}`
      : label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium ${chip}`}
      title={
        node.status === 'COMPLETED'
          ? `${node.title} — cleared ${shortDate(node.completedAt)} with ${node.score}% after ${node.attempts} ${
              node.attempts === 1 ? 'try' : 'tries'
            }`
          : `${node.title} — ${label.toLowerCase()} for this learner`
      }
    >
      <Icon size={11} />
      <span className="max-w-[9rem] truncate">{node.title}</span>
      <span className="tabular-nums opacity-70">{detail}</span>
    </span>
  );
}

function LearnerRow({ learner }) {
  const percent =
    learner.moduleCount > 0 ? Math.round((learner.clearedNodes / learner.moduleCount) * 100) : 0;
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-fg-muted">
          {initials(learner.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{learner.name}</h2>
          <p className="truncate text-[11px] text-fg-subtle">{learner.email}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
          <span className="chip border-line">{learner.totalXp} XP</span>
          <span className="chip border-line">Level {learner.currentLevel}</span>
          <span className="tabular-nums">{learner.streakDays}d streak</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-fg-muted">
          {learner.clearedNodes}/{learner.moduleCount} cleared
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {learner.nodes.map((node) => (
          <NodePill key={node.moduleId} node={node} />
        ))}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-fg-subtle">
        <span>Joined {shortDate(learner.enrolledAt)}</span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> Last activity {shortDate(learner.lastActivity)}
        </span>
      </p>
    </article>
  );
}

/**
 * Who joined the course, and how far each of them got.
 *
 * <p>This is the roster side of enrollment: a count on the course card gets a
 * teacher to this page, but the question they actually ask is "who is stuck".</p>
 */
export default function CourseRoster() {
  const { courseId } = useParams();
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/courses/${courseId}/roster`);
      setRoster(data);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load this roster.'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const { paused: retryPaused, reset: resetAutoRetry, retryNow: retryLoadNow } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  useEffect(() => {
    load();
  }, [load, loadAttempt]);

  useEffect(() => {
    if (!error && !loading) resetAutoRetry();
  }, [error, loading, resetAutoRetry]);

  const learners = roster?.learners ?? [];
  const averageCleared =
    learners.length > 0
      ? Math.round(
          (learners.reduce((sum, learner) => sum + learner.clearedNodes, 0) / learners.length) * 10,
        ) / 10
      : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        to="/studio/courses"
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted hover:text-foreground"
      >
        <ArrowLeft size={13} /> Course library
      </Link>

      <header className="mb-6">
        <p className="eyebrow">Roster</p>
        <h1 className="page-title mt-2">{roster?.title ?? 'Course roster'}</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          Everyone who joined this course, with the node each of them stopped at. A learner only
          appears here after joining from the catalogue.
        </p>
      </header>

      <LoadErrorBanner
        className="mb-4"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      {loading ? (
        <div className="panel grid min-h-[220px] place-items-center text-sm text-fg-muted">
          Loading the roster…
        </div>
      ) : !roster ? null : learners.length === 0 ? (
        <div className="panel grid min-h-[240px] place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
              <Users size={18} />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">Nobody has joined yet</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Students join from the catalogue. This page fills in as soon as the first one does.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[11px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <Users size={13} /> {learners.length} {learners.length === 1 ? 'learner' : 'learners'}
            </span>
            <span className="tabular-nums">{roster.moduleCount} nodes</span>
            <span className="tabular-nums">Average {averageCleared} nodes cleared</span>
            <button
              type="button"
              onClick={() => downloadCsv(roster)}
              className="btn-ghost ml-auto text-[11px]"
            >
              <Download size={13} /> Download CSV
            </button>
          </div>

          <div className="space-y-3">
            {learners.map((learner) => (
              <LearnerRow key={learner.userId} learner={learner} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
