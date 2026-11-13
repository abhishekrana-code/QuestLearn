import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Plus, Trash2, Users } from 'lucide-react';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

/**
 * Classes inside one course.
 *
 * <p>A course is what a student sees; a class is what a teacher runs. Each class
 * has one code that both puts a student on its list and enrolls them in the
 * course, which is the only thing that has to be true for a term to start.</p>
 */
export default function InstructorCohorts() {
  const { courseId } = useParams();
  const [cohorts, setCohorts] = useState([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cohortResponse, courseResponse] = await Promise.all([
        api.get(`/courses/${courseId}/cohorts`),
        api.get(`/courses/${courseId}`),
      ]);
      setCohorts(cohortResponse.data);
      setCourseTitle(courseResponse.data.title);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load the classes for this course.'));
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

  const create = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setNotice(null);
    try {
      const { data } = await api.post(`/courses/${courseId}/cohorts`, { name: trimmed });
      setCohorts((previous) => [...previous, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setNotice({
        type: 'success',
        text: `"${data.name}" created. Share the code ${data.joinCode} with that class.`,
      });
    } catch (createError) {
      setNotice({ type: 'error', text: apiError(createError, 'Could not create that class.') });
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (cohort) => {
    try {
      await navigator.clipboard.writeText(cohort.joinCode);
      setCopied(cohort.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setNotice({ type: 'error', text: 'Your browser blocked the clipboard. Select the code and copy it.' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.delete(`/cohorts/${deleting.id}`);
      setCohorts((previous) => previous.filter((cohort) => cohort.id !== deleting.id));
      setNotice({
        type: 'success',
        text: `"${deleting.name}" deleted. Its students stay enrolled and keep their progress.`,
      });
      setDeleting(null);
    } catch (deleteFailure) {
      setDeleteError(apiError(deleteFailure, 'Could not delete that class.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to="/studio/courses"
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted hover:text-foreground"
      >
        <ArrowLeft size={13} /> Course library
      </Link>

      <header className="mb-6">
        <p className="eyebrow">Classes</p>
        <h1 className="page-title mt-2">{courseTitle || 'Classes'}</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          One code per class. A student who types it is added to the list and enrolled in the
          course in the same step.
        </p>
      </header>

      {notice && (
        <div
          role="status"
          className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[12.5px] ${
            notice.type === 'error'
              ? 'border-danger/30 bg-danger/[0.07] text-danger'
              : 'border-success/30 bg-success/[0.07] text-success'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-[11px] font-semibold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <LoadErrorBanner
        className="mb-4"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      <form onSubmit={create} className="panel mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-semibold text-fg-muted">New class</span>
          <input
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="10B, Period 3, Autumn cohort…"
            aria-label="Class name"
            maxLength={120}
          />
        </label>
        <button
          type="submit"
          className="btn-primary text-xs"
          disabled={creating || !name.trim()}
        >
          <Plus size={14} /> {creating ? 'Creating…' : 'Create class'}
        </button>
      </form>

      {loading ? (
        <div className="panel grid min-h-[200px] place-items-center text-sm text-fg-muted">
          Loading classes…
        </div>
      ) : cohorts.length === 0 ? (
        <div className="panel grid min-h-[220px] place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
              <Users size={18} />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">No classes yet</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Create one above and read its code out. Students join from the catalogue.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {cohorts.map((cohort) => (
            <article key={cohort.id} className="panel flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-foreground">{cohort.name}</h2>
                <p className="mt-0.5 text-[11px] text-fg-subtle">
                  {cohort.memberCount} {cohort.memberCount === 1 ? 'learner' : 'learners'} joined
                </p>
              </div>

              <button
                type="button"
                onClick={() => copyCode(cohort)}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-muted/40 px-3 py-1.5 font-mono text-[12px] font-semibold tracking-[0.12em] text-foreground transition-colors hover:border-line-strong"
                aria-label={`Copy the code for ${cohort.name}`}
              >
                {cohort.joinCode}
                {copied === cohort.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </button>

              <Link
                to={`/studio/courses/${courseId}/roster`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-foreground"
              >
                <Users size={13} /> Roster
              </Link>

              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(cohort);
                }}
                aria-label={`Delete ${cohort.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-muted/40 text-fg-muted transition-colors hover:border-danger/40 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message="The class list goes away. Students stay enrolled in the course and keep every node they cleared, so nothing they did is lost."
          confirmLabel="Delete class"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
