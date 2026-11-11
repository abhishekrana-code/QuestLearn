import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Copy,
  Eye,
  FolderOpen,
  Layers,
  Loader2,
  PencilLine,
  Plus,
  Search,
} from 'lucide-react';
import CourseDetailsDialog from '../components/studio/CourseDetailsDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../services/api.js';

/**
 * The instructor's course library.
 *
 * <p>A teacher may run several subjects, or split a semester across courses, so
 * the courses they already made live here instead of at the bottom of step 1.
 * Authoring stays in the studio: a card opens it on the course it belongs to.</p>
 */
export default function InstructorCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/courses')
      .then(({ data }) => {
        if (!cancelled) setCourses(data);
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
  }, []);

  const canManage = (course) => user.role === 'ADMIN' || course.instructorId === user.id;

  // Published courses by other teachers are visible but not editable, so they
  // sort below a teacher's own courses instead of cluttering the top.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses
      .filter((course) => {
        if (!needle) return true;
        return [course.title, course.category, course.description]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const owned = Number(canManage(b)) - Number(canManage(a));
        if (owned !== 0) return owned;
        return (new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)) || b.id - a.id;
      });
    // canManage only reads the signed-in user, which is part of `user`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, query, user]);

  const mine = courses.filter(canManage);

  const handleSaved = (saved) => {
    setCourses((previous) => previous.map((course) => (course.id === saved.id ? saved : course)));
    setEditing(null);
  };

  const duplicate = async (course) => {
    setDuplicatingId(course.id);
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
      setNotice({
        type: 'error',
        text: apiError(copyError, 'Could not duplicate this course.'),
      });
    } finally {
      setDuplicatingId(null);
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

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-xs text-fg-subtle">
          <span className="font-semibold text-foreground">{mine.length}</span>{' '}
          {mine.length === 1 ? 'course you can edit' : 'courses you can edit'}
        </p>
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
        <div className="panel grid min-h-[220px] place-items-center text-sm text-slate-400">
          Opening your library…
        </div>
      ) : visible.length === 0 ? (
        <div className="panel grid min-h-[240px] place-items-center p-8 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">
              {query ? 'No course matches that search' : 'No courses yet'}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">
              {query
                ? 'Try a different word, or clear the search.'
                : 'Create your first course, then build its node tree in the studio.'}
            </p>
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="btn-ghost mt-4 text-xs">
                Clear search
              </button>
            ) : (
              <Link to="/studio" className="btn-primary mt-4 text-xs">
                <Plus size={14} /> Create a course
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((course) => {
            const owned = canManage(course);
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
                      {course.moduleCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span
                    className={`chip shrink-0 ${
                      course.published
                        ? 'border-success/30 text-success'
                        : 'border-warning/30 text-warning'
                    }`}
                  >
                    {course.published ? 'live' : 'draft'}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 min-h-[2.4rem] text-xs leading-relaxed text-fg-muted">
                  {course.description || 'No description yet.'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  {owned ? (
                    <>
                      <Link
                        to={`/studio?course=${course.id}&step=nodes`}
                        className="btn-ghost text-[11px]"
                      >
                        <FolderOpen size={13} /> Open studio
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditing(course)}
                        className="btn-ghost text-[11px]"
                      >
                        <PencilLine size={13} /> Edit details
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicate(course)}
                        disabled={duplicatingId === course.id}
                        className="btn-ghost text-[11px]"
                      >
                        {duplicatingId === course.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Copy size={13} />
                        )}
                        {duplicatingId === course.id ? 'Duplicating…' : 'Duplicate'}
                      </button>
                    </>
                  ) : (
                    <span className="chip border-line text-fg-subtle">
                      <Layers size={12} /> read only
                    </span>
                  )}
                  <Link
                    to={`/courses/${course.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-gold-text hover:underline"
                  >
                    <Eye size={13} /> Preview
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
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
