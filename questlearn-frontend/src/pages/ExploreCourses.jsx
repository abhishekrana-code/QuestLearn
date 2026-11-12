import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Lock,
  Loader2,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

const STATUS_STYLE = {
  COMPLETED: 'border-success/30 bg-success/[0.08] text-success',
  UNLOCKED: 'border-gold/30 bg-gold/[0.08] text-gold-text',
  LOCKED: 'border-line bg-muted/40 text-fg-subtle',
};

function StatusIcon({ status }) {
  if (status === 'COMPLETED') return <Check size={11} />;
  if (status === 'LOCKED') return <Lock size={11} />;
  return <Sparkles size={11} />;
}

/** One active filter, removable in place without hunting through the selects. */
function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gold/30 bg-gold/[0.08] py-1 pl-2.5 pr-1 text-[11px] font-medium text-gold-text">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-150 hover:bg-gold/20"
      >
        <X size={11} />
      </button>
    </span>
  );
}

const progressOf = (course) =>
  course.moduleCount > 0 ? course.completedModules / course.moduleCount : 0;

const byNewest = (a, b) =>
  new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0) || b.id - a.id;

/** Percentage first, so one cleared node of six beats one of twenty. */
const byProgress = (a, b) =>
  progressOf(b) - progressOf(a) || b.completedModules - a.completedModules || byNewest(a, b);

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
 * Which teacher teaches what.
 *
 * <p>Students could only reach a course through their dashboard, so the rest of
 * the catalogue was invisible. Courses are grouped by the instructor who wrote
 * them, and each card can unfold its skill tree in place - the whole shape of a
 * quest without leaving the page.</p>
 */
export default function ExploreCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [openTree, setOpenTree] = useState(null);
  const [trees, setTrees] = useState({});
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
        if (!cancelled) setError(apiError(loadError, 'Could not load the course catalogue.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, resetAutoRetry]);

  const teacherOptions = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => {
      const id = course.instructorId ?? 'unknown';
      const entry = map.get(id) ?? {
        id,
        name: course.instructorName || 'QuestLearn',
        count: 0,
      };
      entry.count += 1;
      map.set(id, entry);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  const subjectOptions = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => {
      const name = course.category?.trim() || 'Uncategorised';
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [courses]);

  const teacherParam = searchParams.get('teacher');
  const subjectParam = searchParams.get('subject');

  // A stale or hand-edited link falls back to "all" instead of an empty select.
  const teacherId =
    teacherParam && teacherOptions.some((teacher) => String(teacher.id) === teacherParam)
      ? teacherParam
      : 'all';
  const subject =
    subjectParam && subjectOptions.some((option) => option.name === subjectParam)
      ? subjectParam
      : 'all';

  const activeTeacherName = teacherOptions.find(
    (teacher) => String(teacher.id) === teacherId,
  )?.name;

  const sort = searchParams.get('sort') === 'progress' ? 'progress' : 'newest';

  const catalogue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (course) => {
      if (teacherId !== 'all' && String(course.instructorId ?? 'unknown') !== teacherId) {
        return false;
      }
      if (subject !== 'all' && (course.category?.trim() || 'Uncategorised') !== subject) {
        return false;
      }
      if (!needle) return true;
      return [course.title, course.category, course.description, course.instructorName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle));
    };

    const groups = new Map();
    let count = 0;
    courses.filter(matches).forEach((course) => {
      count += 1;
      const key = course.instructorId ?? 'unknown';
      if (!groups.has(key)) {
        groups.set(key, { id: key, name: course.instructorName || 'QuestLearn', courses: [] });
      }
      groups.get(key).courses.push(course);
    });

    return {
      count,
      teachers: [...groups.values()]
        .map((teacher) => ({
          ...teacher,
          courses: [...teacher.courses].sort(sort === 'progress' ? byProgress : byNewest),
          nodeTotal: teacher.courses.reduce((sum, course) => sum + course.moduleCount, 0),
          cleared: teacher.courses.reduce((sum, course) => sum + course.completedModules, 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [courses, query, teacherId, subject, sort]);

  const filtersActive = Boolean(query.trim()) || teacherId !== 'all' || subject !== 'all';

  const setQuery = (value) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete('q');
    else next.set('q', value);
    setSearchParams(next, { replace: true });
  };

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const setSort = (value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'newest') next.delete('sort');
    else next.set('sort', value);
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('teacher');
    next.delete('subject');
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const toggleTree = async (course) => {
    if (openTree === course.id) {
      setOpenTree(null);
      return;
    }
    setOpenTree(course.id);
    if (trees[course.id] && !trees[course.id].error) return;

    setTrees((previous) => ({ ...previous, [course.id]: { loading: true, nodes: [] } }));
    try {
      const { data } = await api.get(`/courses/${course.id}/skill-tree`);
      setTrees((previous) => ({
        ...previous,
        [course.id]: { loading: false, nodes: data.nodes ?? [] },
      }));
    } catch (treeError) {
      setTrees((previous) => ({
        ...previous,
        [course.id]: {
          loading: false,
          nodes: [],
          error: apiError(treeError, 'Could not load this skill tree.'),
        },
      }));
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="eyebrow">Catalogue</p>
        <h1 className="page-title mt-2">Teachers &amp; courses</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          Every published quest, grouped by the teacher who built it. Unfold a skill tree to see the
          whole path before you start.
        </p>
      </header>

      <LoadErrorBanner
        className="mb-4"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      <div className="panel mb-4 space-y-2.5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs text-fg-subtle">
            <Users size={14} className="text-gold-text" />
            <span>
              <span className="font-semibold text-foreground">{catalogue.teachers.length}</span>{' '}
              {catalogue.teachers.length === 1 ? 'teacher' : 'teachers'} ·{' '}
              <span className="font-semibold text-foreground">{catalogue.count}</span>{' '}
              {catalogue.count === 1 ? 'course' : 'courses'}
              {filtersActive && <span className="text-fg-muted"> shown</span>}
            </span>
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-text hover:underline"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="field sm:w-48"
            aria-label="Filter by teacher"
            value={teacherId}
            onChange={(event) => setFilter('teacher', event.target.value)}
          >
            <option value="all">All teachers</option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={String(teacher.id)}>
                {teacher.name} ({teacher.count})
              </option>
            ))}
          </select>

          <select
            className="field sm:w-44"
            aria-label="Filter by subject"
            value={subject}
            onChange={(event) => setFilter('subject', event.target.value)}
          >
            <option value="all">All subjects</option>
            {subjectOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name} ({option.count})
              </option>
            ))}
          </select>

          <select
            className="field sm:w-40"
            aria-label="Sort courses"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="progress">My progress</option>
          </select>

          <label className="relative w-full sm:flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              className="field pl-9"
              placeholder="Search teacher, course or topic"
              aria-label="Search courses and teachers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </div>

      {!loading && filtersActive && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Filters
          </span>
          {query.trim() && (
            <FilterChip
              label={`Search: "${query.trim()}"`}
              onRemove={() => setQuery('')}
            />
          )}
          {teacherId !== 'all' && activeTeacherName && (
            <FilterChip
              label={`Teacher: ${activeTeacherName}`}
              onRemove={() => setFilter('teacher', 'all')}
            />
          )}
          {subject !== 'all' && (
            <FilterChip
              label={`Subject: ${subject}`}
              onRemove={() => setFilter('subject', 'all')}
            />
          )}
        </div>
      )}

      {loading ? (
        <div className="panel grid min-h-[240px] place-items-center text-sm text-slate-400">
          Gathering the catalogue…
        </div>
      ) : catalogue.teachers.length === 0 ? (
        <div className="panel grid min-h-[240px] place-items-center p-8 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">
              {filtersActive ? 'No course matches those filters' : 'No published courses yet'}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">
              {filtersActive
                ? 'Try another teacher or subject, or clear the filters.'
                : 'When a teacher publishes a quest it will appear here.'}
            </p>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="btn-ghost mt-4 text-xs">
                Clear filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {catalogue.teachers.map((teacher) => (
            <section key={teacher.id} aria-labelledby={`teacher-${teacher.id}`}>
              <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold/25 bg-gold/[0.1] text-[11px] font-bold text-gold-text">
                  {initials(teacher.name)}
                </span>
                <div className="min-w-0">
                  <h2
                    id={`teacher-${teacher.id}`}
                    className="truncate text-sm font-semibold text-foreground"
                  >
                    {teacher.name}
                  </h2>
                  <p className="text-[11px] text-fg-subtle">
                    {teacher.courses.length} {teacher.courses.length === 1 ? 'course' : 'courses'} ·{' '}
                    {teacher.nodeTotal} {teacher.nodeTotal === 1 ? 'node' : 'nodes'} · {teacher.cleared}{' '}
                    cleared by you
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {teacher.courses.map((course) => {
                  const tree = trees[course.id];
                  const expanded = openTree === course.id;
                  const percent =
                    course.moduleCount > 0
                      ? Math.round((course.completedModules / course.moduleCount) * 100)
                      : 0;

                  return (
                    <article key={course.id} className="panel flex flex-col p-4">
                      <div className="flex items-start gap-2.5">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-muted text-lg">
                          {course.emoji || '🗺️'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {course.title}
                          </h3>
                          <p className="mt-0.5 truncate text-[11px] text-fg-subtle">
                            {course.category || 'Uncategorised'}
                          </p>
                        </div>
                        <span className="chip shrink-0 border-line text-fg-muted">
                          {course.moduleCount} nodes
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 min-h-[2.4rem] text-xs leading-relaxed text-fg-muted">
                        {course.description || 'No description yet.'}
                      </p>

                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                          <span>
                            {course.completedModules}/{course.moduleCount} cleared
                          </span>
                          <span className="tabular-nums">{percent}%</span>
                        </div>
                        <div
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progress in ${course.title}`}
                        >
                          <div
                            className="h-full rounded-full bg-gold"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                        <button
                          type="button"
                          onClick={() => toggleTree(course)}
                          aria-expanded={expanded}
                          aria-controls={`tree-${course.id}`}
                          className="btn-ghost text-[11px]"
                        >
                          <ChevronDown
                            size={13}
                            className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                          />
                          {expanded ? 'Hide tree' : 'View skill tree'}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/courses/${course.id}`)}
                          className="ml-auto text-[11px] font-semibold text-gold-text hover:underline"
                        >
                          Open course
                        </button>
                      </div>

                      {expanded && (
                        <div id={`tree-${course.id}`} className="mt-2.5">
                          {tree?.loading ? (
                            <p className="flex items-center gap-2 py-2 text-[11px] text-fg-muted">
                              <Loader2 size={12} className="animate-spin" /> Loading the tree…
                            </p>
                          ) : tree?.error ? (
                            <p className="rounded-lg border border-danger/30 bg-danger/[0.08] px-2.5 py-2 text-[11px] leading-relaxed text-danger">
                              {tree.error}
                            </p>
                          ) : tree?.nodes.length === 0 ? (
                            <p className="py-2 text-[11px] text-fg-subtle">
                              This course has no nodes yet.
                            </p>
                          ) : (
                            <ol className="space-y-1.5">
                              {tree.nodes.map((node, index) => (
                                <li
                                  key={node.id}
                                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                                    STATUS_STYLE[node.status] ?? STATUS_STYLE.LOCKED
                                  }`}
                                >
                                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-black/10">
                                    <StatusIcon status={node.status} />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-medium">
                                    {index + 1}. {node.title}
                                  </span>
                                  <span className="shrink-0 tabular-nums opacity-80">
                                    {node.xpReward} XP
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
