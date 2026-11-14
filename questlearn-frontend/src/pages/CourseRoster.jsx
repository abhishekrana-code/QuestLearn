import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Download,
  Lock,
  Printer,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
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

/**
 * Pulls addresses out of whatever a teacher pasted or exported.
 *
 * <p>A register export usually has a name column and an email column, so the cell
 * holding an "@" is the one wanted; a header row and blank lines fall out for free.
 */
function emailsFromCsv(text) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[;,\t]/))
    .map((cell) => cell.replace(/["']/g, '').trim().toLowerCase())
    .filter((cell) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cell));
}

function shortDate(iso) {
  if (!iso) return 'Not set';
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
          ? `${node.title}, cleared ${shortDate(node.completedAt)} with ${node.score}% after ${node.attempts} ${
              node.attempts === 1 ? 'try' : 'tries'
            }`
          : `${node.title}, ${label.toLowerCase()} for this learner`
      }
    >
      <Icon size={11} />
      <span className="max-w-[9rem] truncate">{node.title}</span>
      <span className="tabular-nums opacity-70">{detail}</span>
    </span>
  );
}

function LearnerRow({ learner, courseId }) {
  const percent =
    learner.moduleCount > 0 ? Math.round((learner.clearedNodes / learner.moduleCount) * 100) : 0;
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-fg-muted">
          {initials(learner.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            <Link
              to={`/studio/courses/${courseId}/roster/${learner.userId}`}
              className="inline-flex items-center gap-1 hover:text-gold-text hover:underline"
            >
              {learner.name}
              <ChevronRight size={12} className="shrink-0 opacity-50" />
            </Link>
          </h2>
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
  const [cohorts, setCohorts] = useState([]);
  const [cohortFilter, setCohortFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  // Stuck first: "who has not cleared this node" is the question worth asking.
  const [nodeState, setNodeState] = useState('NOT_CLEARED');
  const [importOpen, setImportOpen] = useState(false);
  const [importEmails, setImportEmails] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInput = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // The class picker only matters once the course has classes.
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/courses/${courseId}/cohorts`)
      .then(({ data }) => {
        if (!cancelled) setCohorts(data);
      })
      .catch(() => {
        /* the roster still works without the picker */
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/courses/${courseId}/roster`, {
        params: {
          ...(cohortFilter ? { cohortId: cohortFilter } : {}),
          ...(nodeFilter ? { nodeId: nodeFilter, nodeCleared: nodeState === 'CLEARED' } : {}),
        },
      });
      setRoster(data);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load this roster.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, cohortFilter, nodeFilter, nodeState]);

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

  const submitImport = async (event) => {
    event.preventDefault();
    const emails = emailsFromCsv(importEmails);
    setImportError(null);
    if (emails.length === 0) {
      setImportError('No email addresses found in that text.');
      return;
    }
    setImportBusy(true);
    try {
      const { data } = await api.post(`/courses/${courseId}/roster/import`, {
        emails,
        cohortId: cohortFilter ? Number(cohortFilter) : null,
      });
      setImportResult(data);
      setImportEmails('');
      // Show what just arrived: a node filter left over from before the import can
      // hide every new row and make a successful import look like a no-op.
      setNodeFilter('');
      setLoadAttempt((previous) => previous + 1);
    } catch (importFailure) {
      setImportError(apiError(importFailure, 'Could not import that list.'));
    } finally {
      setImportBusy(false);
    }
  };

  const readFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportEmails(await file.text());
    event.target.value = '';
  };

  const learners = roster?.learners ?? [];
  // The nodes come from the roster itself, so the picker survives a filter that
  // matches nobody, otherwise the only control that could undo it would vanish.
  const nodes = roster?.nodes ?? [];
  const filtered = Boolean(nodeFilter || cohortFilter);
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
        className="no-print mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted hover:text-foreground"
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
      ) : !roster ? null : learners.length === 0 && !filtered ? (
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
          <div className="panel mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-3 text-[11px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5 self-center font-semibold text-foreground">
              <Users size={13} /> {learners.length} {learners.length === 1 ? 'learner' : 'learners'}
            </span>
            <span className="tabular-nums self-center">{roster.moduleCount} nodes</span>
            <span className="tabular-nums self-center">Average {averageCleared} cleared</span>

            {cohorts.length > 0 && (
              <label className="flex items-center gap-2 font-semibold">
                Class
                <select
                  className="field w-auto min-w-[9rem] text-[11px]"
                  value={cohortFilter}
                  onChange={(event) => setCohortFilter(event.target.value)}
                  aria-label="Filter the roster by class"
                >
                  <option value="">All classes</option>
                  {cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {nodes.length > 0 && (
              <label className="flex items-center gap-2 font-semibold">
                Node
                <select
                  className="field w-auto min-w-[9rem] text-[11px]"
                  value={nodeFilter}
                  onChange={(event) => setNodeFilter(event.target.value)}
                  aria-label="Show only learners on one node"
                >
                  <option value="">Any node</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {nodeFilter && (
              <label className="flex items-center gap-2 font-semibold">
                Standing
                <select
                  className="field w-auto text-[11px]"
                  value={nodeState}
                  onChange={(event) => setNodeState(event.target.value)}
                  aria-label="Show learners who have cleared the node, or have not"
                >
                  <option value="NOT_CLEARED">Not cleared</option>
                  <option value="CLEARED">Cleared</option>
                </select>
              </label>
            )}

            <div className="no-print ml-auto flex flex-wrap items-center gap-1.5 self-center">
              <button
                type="button"
                onClick={() => {
                  setImportOpen((open) => !open);
                  setImportResult(null);
                  setImportError(null);
                }}
                className="btn-ghost text-[11px]"
              >
                <Upload size={13} /> Import list
              </button>
              <button type="button" onClick={() => window.print()} className="btn-ghost text-[11px]">
                <Printer size={13} /> Print
              </button>
              <button type="button" onClick={() => downloadCsv(roster)} className="btn-ghost text-[11px]">
                <Download size={13} /> CSV
              </button>
            </div>
          </div>

          {importOpen && (
            <form onSubmit={submitImport} className="no-print panel mb-4 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-foreground">Import a class list</p>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="btn-ghost text-[11px]"
                  aria-label="Close the import panel"
                >
                  <X size={13} />
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-fg-subtle">
                Paste a column of email addresses, or a spreadsheet export with a name and an email
                column. Only existing student accounts are enrolled; addresses that belong to nobody
                are listed back so you can chase them
                {cohortFilter ? ', and they join the selected class too' : ''}.
              </p>
              <textarea
                className="field mt-2 h-28 w-full font-mono text-[11px]"
                value={importEmails}
                onChange={(event) => setImportEmails(event.target.value)}
                placeholder={'name,email\nAsha Rao,asha@college.edu\nleo@college.edu'}
                aria-label="Email addresses to import"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={readFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="btn-ghost text-[11px]"
                >
                  <Upload size={13} /> Choose a CSV
                </button>
                <button type="submit" disabled={importBusy} className="btn-primary text-[11px]">
                  {importBusy ? 'Importing…' : 'Import and enrol'}
                </button>
                {importError && <span className="text-[11px] text-danger">{importError}</span>}
              </div>
              {importResult && (
                <div className="mt-3 rounded-lg border border-line bg-muted/40 px-3 py-2 text-[11px]">
                  <p className="font-semibold text-foreground">
                    {importResult.imported.length} enrolled · {importResult.alreadyMember.length} already
                    in · {importResult.unknown.length} unknown
                  </p>
                  {importResult.unknown.length > 0 && (
                    <p className="mt-1 break-all text-fg-subtle">
                      No account for: {importResult.unknown.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </form>
          )}

          <div className="space-y-3">
            {learners.length === 0 && filtered && (
              <div className="panel px-4 py-6 text-center text-[12px] text-fg-muted">
                Nobody matches these filters.
                <button
                  type="button"
                  onClick={() => {
                    setNodeFilter('');
                    setCohortFilter('');
                  }}
                  className="ml-2 font-semibold text-gold-text underline"
                >
                  Clear them
                </button>
              </div>
            )}
            {learners.map((learner) => (
              <LearnerRow key={learner.userId} learner={learner} courseId={roster.courseId} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
