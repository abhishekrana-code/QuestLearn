import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  Copy,
  Eye,
  FolderOpen,
  Layers,
  Loader2,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import CourseDetailsDialog from '../components/studio/CourseDetailsDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

/** A labelled icon button, so a card can carry several actions without shouting. */
function IconAction({ label, onClick, disabled = false, busy = false, danger = false, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled || busy}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-line bg-muted/40 text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'hover:border-danger/40 hover:text-danger' : ''
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}

/**
 * The instructor's course library.
 *
 * <p>A teacher may run several subjects, or split a semester across courses, so
 * the courses they already made live here instead of at the bottom of step 1.
 * Finished terms can be archived, which hides them from students but keeps their
 * history; a draft nobody has touched can be deleted outright.</p>
 */
export default function InstructorCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('active');
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const {
    paused: retryPaused,
    reset: resetAutoRetry,
    retryNow: retryLoadNow,
  } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get('/courses')
      .then(({ data }) => {
        if (!cancelled) {
          setCourses(data);
          resetAutoRetry();
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(apiError(loadError, 'Could not load your courses.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, resetAutoRetry]);

  const canManage = (course) => user.role === 'ADMIN' || course.instructorId === user.id;
  const isArchived = (course) => Boolean(course.archivedAt);

  // Published courses by other teachers are visible but not editable, so they
  // sort below a teacher's own courses instead of cluttering the top.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses
      .filter((course) => (view === 'archived' ? isArchived(course) : !isArchived(course)))
      .filter((course) => {
        if (!needle) return true;
        return [course.title, course.category, course.description]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const owned = Number(canManage(b)) - Number(canManage(a));
        if (owned !== 0) return owned;
        return new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0) || b.id - a.id;
      });
    // canManage only reads the signed-in user, which is part of `user`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, query, user, view]);

  const activeCount = courses.filter((course) => !isArchived(course)).length;
  const archivedCount = courses.filter(isArchived).length;

  const handleSaved = (saved) => {
    setCourses((previous) => previous.map((course) => (course.id === saved.id ? saved : course)));
    setEditing(null);
  };

  const duplicate = async (course) => {
    setBusyId(course.id);
    setNotice(null);
    try {
      const { data } = await api.post(`/courses/${course.id}/duplicate`);
      setCourses((previous) => [...previous, data]);
      setNotice({
        type: 'success',
        text: `"${data.title}" created as a private draft with ${data.moduleCount} node${
          data.moduleCount === 1 ? '' : 's'
        } - rename it when you are ready.`,
      });
    } catch (copyError) {
      setNotice({ type: 'error', text: apiError(copyError, 'Could not duplicate this course.') });
    } finally {
      setBusyId(null);
    }
  };

  const setArchived = async (course, archived) => {
    setBusyId(course.id);
    setNotice(null);
    try {
      const { data } = await api.patch(`/courses/${course.id}/archive`, null, {
        params: { archived },
      });
      setCourses((previous) => previous.map((item) => (item.id === data.id ? data : item)));
      setNotice({
        type: 'success',
        text: archived
          ? `"${data.title}" archived. Students no longer see it, and nothing was deleted.`
          : `"${data.title}" restored as a draft - publish it when it is ready.`,
      });
    } catch (archiveError) {
      setNotice({ type: 'error', text: apiError(archiveError, 'Could not change the archive state.') });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    setDeleteError(null);
    try {
      await api.delete(`/courses/${deleting.id}`);
      setCourses((previous) => previous.filter((course) => course.id !== deleting.id));
      setNotice({ type: 'success', text: `"${deleting.title}" deleted.` });
      setDeleting(null);
    } catch (deleteFailure) {
      setDeleteError(apiError(deleteFailure, 'Could not delete this course.'));
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Course library</p>
          <h1 className="page-title mt-2">Your courses</h1>
          <p className="page-subtitle mt-1.5 max-w-2xl">
            One course per subject or term. Open one to build its node tree, edit what students
            see, or preview it as a student.
          </p>
        </div>
        <Link to="/studio" className="btn-primary text-xs">
          <Plus size={14} /> New course
        </Link>
      </header>

      {notice && (
        <div
          className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.type === 'error'
              ? 'border-danger/30 bg-danger/[0.07] text-danger'
              : 'border-success/30 bg-success/[0.07] text-success'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-xs font-semibold opacity-70 hover:opacity-100"
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

      <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="Course state">
          {[
            { id: 'active', label: 'Active', count: activeCount },
            { id: 'archived', label: 'Archived', count: archivedCount },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                view === tab.id
                  ? 'bg-gold/[0.12] text-gold-text ring-1 ring-inset ring-gold/20'
                  : 'text-fg-muted hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label} <span className="tabular-nums opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-64">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            className="field pl-9"
            placeholder="Search title or category"
            aria-label="Search your courses"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <div className="panel grid min-h-[220px] place-items-center text-sm text-fg-muted">
          Opening your library…
        </div>
      ) : visible.length === 0 ? (
        <div className="panel grid min-h-[240px] place-items-center p-8 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">
              {query
                ? 'No course matches that search'
                : view === 'archived'
                  ? 'Nothing archived'
                  : 'No courses yet'}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">
              {query
                ? 'Try a different word, or clear the search.'
                : view === 'archived'
                  ? 'Finished terms you archive will be kept here, with their history intact.'
                  : 'Create your first course, then build its node tree in the studio.'}
            </p>
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="btn-ghost mt-4 text-xs">
                Clear search
              </button>
            ) : view === 'active' ? (
              <Link to="/studio" className="btn-primary mt-4 text-xs">
                <Plus size={14} /> Create a course
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((course) => {
            const owned = canManage(course);
            const archived = isArchived(course);
            return (
              <article key={course.id} className="panel flex flex-col p-4">
                <div className="flex items-start gap-2.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-muted text-lg">
                    {course.emoji || '🗺️'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {course.title}
                    </h2>
                    <p className="mt-0.5 truncate text-[11px] text-fg-subtle">
                      {course.category || 'Uncategorised'} · {course.moduleCount} node
                      {course.moduleCount === 1 ? '' : 's'} · {course.enrolledCount ?? 0} learner
                      {(course.enrolledCount ?? 0) === 1 ? '' : 's'} joined
                    </p>
                  </div>
                  <span
                    className={`chip shrink-0 ${
                      archived
                        ? 'border-line text-fg-muted'
                        : course.published
                          ? 'border-success/30 text-success'
                          : 'border-warning/30 text-warning'
                    }`}
                  >
                    {archived ? 'archived' : course.published ? 'live' : 'draft'}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 min-h-[2.4rem] text-xs leading-relaxed text-fg-muted">
                  {course.description || 'No description yet.'}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  {owned ? (
                    <Link
                      to={`/studio?course=${course.id}&step=nodes`}
                      className="btn-ghost text-[11px]"
                    >
                      <FolderOpen size={13} /> Open studio
                    </Link>
                  ) : (
                    <span className="chip border-line text-fg-subtle">
                      <Layers size={12} /> read only
                    </span>
                  )}
                  <Link
                    to={`/courses/${course.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-text hover:underline"
                  >
                    <Eye size={13} /> Preview
                  </Link>
                  {owned && (
                    <Link
                      to={`/studio/courses/${course.id}/roster`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-foreground"
                    >
                      <Users size={13} /> Roster
                    </Link>
                  )}

                  {owned && (
                    <div className="ml-auto flex items-center gap-1">
                      <IconAction label="Edit details" onClick={() => setEditing(course)}>
                        <PencilLine size={14} />
                      </IconAction>
                      <IconAction
                        label="Duplicate"
                        busy={busyId === course.id}
                        onClick={() => duplicate(course)}
                      >
                        <Copy size={14} />
                      </IconAction>
                      <IconAction
                        label={archived ? 'Restore to active' : 'Archive'}
                        busy={busyId === course.id}
                        onClick={() => setArchived(course, !archived)}
                      >
                        {archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                      </IconAction>
                      <IconAction
                        label={course.published ? 'Unpublish it first' : 'Delete'}
                        danger
                        disabled={course.published}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(course);
                        }}
                      >
                        <Trash2 size={14} />
                      </IconAction>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.title}"?`}
          message="This removes the course with its nodes, quizzes and lesson text, and cannot be undone. Courses students have already worked through cannot be deleted - archive those instead to keep their progress."
          confirmLabel="Delete permanently"
          busy={deletingBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            if (!deletingBusy) setDeleting(null);
          }}
        />
      )}

      {editing && (
        <CourseDetailsDialog
          course={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
