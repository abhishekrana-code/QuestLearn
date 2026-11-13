import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Lock, RotateCcw, Unlock } from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

const STATUS = {
  COMPLETED: { label: 'Cleared', chip: 'border-success/30 bg-success/[0.08] text-success', Icon: Check },
  UNLOCKED: { label: 'Open', chip: 'border-gold/30 bg-gold/[0.08] text-gold-text', Icon: Unlock },
  LOCKED: { label: 'Locked', chip: 'border-line text-fg-subtle', Icon: Lock },
};

// Which route graded the attempt, in the words a teacher would use.
const SOURCE = {
  QUIZ: 'Quiz',
  VIVA_SPOKEN: 'Spoken viva',
  VIVA_WRITTEN: 'Typed viva',
};

function stamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function NodeCard({ node, canReset, resetting, onReset }) {
  const { label, chip, Icon } = STATUS[node.status] ?? STATUS.LOCKED;
  // Nothing to reset on a node they never touched.
  const resettable = canReset && (node.attempts > 0 || node.status === 'COMPLETED');
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{node.title}</h2>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            {node.attempts === 0
              ? 'No attempts yet'
              : `${node.attempts} ${node.attempts === 1 ? 'attempt' : 'attempts'}`}
            {node.status === 'COMPLETED' && ` · best ${node.score}% · cleared ${shortDate(node.completedAt)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`chip ${chip}`}>
            <Icon size={11} /> {label}
          </span>
          {resettable && (
            <button
              type="button"
              onClick={() => onReset(node)}
              disabled={resetting}
              className="btn-ghost px-2 py-1 text-[11px]"
              title="Give this node back so the learner can retry it"
            >
              <RotateCcw size={12} /> {resetting ? 'Resetting…' : 'Reset'}
            </button>
          )}
        </div>
      </div>

      {node.history.length > 0 ? (
        <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
          {node.history.map((attempt, index) => (
            <li
              key={`${attempt.at}-${index}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-muted"
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                  attempt.passed ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger'
                }`}
                aria-hidden="true"
              >
                {attempt.passed ? '✓' : '×'}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{attempt.score}%</span>
              <span>{SOURCE[attempt.source] ?? attempt.source}</span>
              <span className="ml-auto tabular-nums">{stamp(attempt.at)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

/**
 * One learner's history in one course.
 *
 * <p>The roster answers "who is stuck"; this page answers "why" by showing the
 * attempt trail per node, oldest first.</p>
 */
export default function LearnerDetail() {
  const { courseId, userId } = useParams();
  const { user } = useAuth();
  const [learner, setLearner] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/courses/${courseId}/roster/${userId}`);
      setLearner(data);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load this learner.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, userId]);

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

  const resetNode = async (node) => {
    const confirmed = window.confirm(
      `Reset ${learner?.name ?? 'this learner'}'s progress on "${node.title}"?\n\n` +
        'The node goes back to where it started and the XP they earned for it is removed.',
    );
    if (!confirmed) return;
    setResetting(node.moduleId);
    setNotice(null);
    try {
      await api.delete(`/admin/users/${userId}/modules/${node.moduleId}/progress`);
      setNotice({ type: 'success', text: `"${node.title}" was reset.` });
      setLoadAttempt((previous) => previous + 1);
    } catch (resetError) {
      setNotice({ type: 'error', text: apiError(resetError, 'Could not reset that node.') });
    } finally {
      setResetting(null);
    }
  };

  const nodes = learner?.nodes ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to={`/studio/courses/${courseId}/roster`}
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted hover:text-foreground"
      >
        <ArrowLeft size={13} /> Roster
      </Link>

      <header className="mb-6">
        <p className="eyebrow">Learner history</p>
        <h1 className="page-title mt-2">{learner?.name ?? 'Learner'}</h1>
        <p className="page-subtitle mt-1.5">
          {learner ? `${learner.email} · ${learner.courseTitle}` : 'Loading their work in this course…'}
        </p>
      </header>

      <LoadErrorBanner
        className="mb-4"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      {notice && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2.5 text-[12px] ${
            notice.type === 'error'
              ? 'border-danger/30 bg-danger/[0.07] text-danger'
              : 'border-success/30 bg-success/[0.07] text-success'
          }`}
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="panel grid min-h-[200px] place-items-center text-sm text-fg-muted">
          Loading their attempts…
        </div>
      ) : !learner ? null : (
        <>
          <div className="panel mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[11px] text-fg-muted">
            <span className="font-semibold tabular-nums text-foreground">
              {learner.clearedNodes}/{learner.moduleCount} nodes cleared
            </span>
            <span className="tabular-nums">{learner.totalXp} XP</span>
            <span className="tabular-nums">Level {learner.currentLevel}</span>
            <span className="tabular-nums">{learner.streakDays}d streak</span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> Last activity {shortDate(learner.lastActivity)}
            </span>
            <span>Joined {shortDate(learner.enrolledAt)}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {nodes.map((node) => (
              <NodeCard
                key={node.moduleId}
                node={node}
                canReset={user?.role === 'ADMIN' || user?.role === 'INSTRUCTOR'}
                resetting={resetting === node.moduleId}
                onReset={resetNode}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
