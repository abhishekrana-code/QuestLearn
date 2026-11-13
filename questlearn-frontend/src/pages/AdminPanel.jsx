import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, History, KeyRound, Search, ShieldCheck, Users } from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

const ROLE_OPTIONS = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];

/** Reads as a sentence on the page; the raw action key stays stable for machines. */
const ACTION_LABELS = {
  'user.role_changed': 'Role changed',
  'user.password_reset': 'Password reset',
  'user.progress_reset': 'Progress reset',
  'course.published': 'Course published',
  'course.unpublished': 'Course unpublished',
  'course.archived': 'Course archived',
  'course.restored': 'Course restored',
  'course.deleted': 'Course deleted',
};

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [audit, setAudit] = useState([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const firstSearchRender = useRef(true);

  const { paused: retryPaused, reset: resetAutoRetry, retryNow: retryLoadNow } = useAutoRetry({
    active: Boolean(loadError) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statsResponse, usersResponse, coursesResponse, auditResponse] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/courses'),
        api.get('/admin/audit'),
      ]);
      setStats(statsResponse.data);
      setUsers(usersResponse.data);
      setCourses(coursesResponse.data);
      setAudit(auditResponse.data);
      resetAutoRetry();
    } catch (error) {
      setLoadError(apiError(error, 'Could not load admin data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, loadAttempt]);

  // Typing filters on the server after a short pause, so a school-sized roster
  // never has to be shipped to the browser just to be searched.
  useEffect(() => {
    if (firstSearchRender.current) {
      firstSearchRender.current = false;
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const trimmed = query.trim();
        const { data } = await api.get('/admin/users', {
          params: trimmed ? { query: trimmed } : undefined,
        });
        if (!cancelled) setUsers(data);
      } catch (error) {
        if (!cancelled) {
          setMessage({ type: 'error', text: apiError(error, 'Could not search accounts.') });
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const refreshAudit = async () => {
    try {
      const { data } = await api.get('/admin/audit');
      setAudit(data);
    } catch {
      /* the feed is supporting detail; a failed refresh should not mask the action */
    }
  };

  const changeRole = async (targetUser, role) => {
    setBusyId(targetUser.id);
    try {
      const { data } = await api.patch(`/admin/users/${targetUser.id}/role`, { role });
      setUsers((previous) => previous.map((item) => (item.id === data.id ? data : item)));
      setMessage({ type: 'success', text: `${data.name} is now ${data.role.toLowerCase()}.` });
      refreshAudit();
    } catch (error) {
      setMessage({ type: 'error', text: apiError(error, 'Could not change that role.') });
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (targetUser) => {
    setBusyId(`pw-${targetUser.id}`);
    try {
      const { data } = await api.post(`/admin/users/${targetUser.id}/reset-password`);
      setMessage({
        type: 'success',
        text: `Temporary password for ${data.email}: ${data.temporaryPassword} — share it privately. It is shown once and never stored in clear text.`,
      });
      refreshAudit();
    } catch (error) {
      setMessage({ type: 'error', text: apiError(error, 'Could not reset that password.') });
    } finally {
      setBusyId(null);
    }
  };

  const togglePublish = async (course) => {
    setBusyId(`course-${course.id}`);
    try {
      const { data } = await api.patch(`/courses/${course.id}/publish`, null, {
        params: { published: !course.published },
      });
      setCourses((previous) => previous.map((item) => (item.id === data.id ? data : item)));
      setMessage({
        type: 'success',
        text: `${data.title} is now ${data.published ? 'published' : 'unpublished'}.`,
      });
      refreshAudit();
    } catch (error) {
      setMessage({ type: 'error', text: apiError(error, 'Could not moderate that course.') });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center text-sm text-fg-muted">
        Opening the war room…
      </div>
    );
  }

  /* Counters are not states, so they share the one brand accent: a row of four
     different hues read as decoration, and success was doing duty as a colour. */
  const cards = [
    { label: 'Accounts', value: stats?.totalUsers ?? 0, icon: Users },
    { label: 'Students', value: stats?.students ?? 0, icon: Users },
    { label: 'Instructors', value: stats?.instructors ?? 0, icon: ShieldCheck },
    { label: 'Live courses', value: stats?.publishedCourses ?? 0, icon: BookOpen },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <p className="eyebrow">Admin</p>
        <h1 className="page-title mt-2">Admin overview</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          Moderate accounts and control which quests are live for students.
        </p>
      </header>

      <LoadErrorBanner
        className="mb-5"
        message={loadError}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      {message && (
        <div
          className={`mb-5 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'border-danger/30 bg-danger/[0.07] text-danger'
              : 'border-success/30 bg-success/[0.07] text-success'
          }`}
        >
          <span className="leading-relaxed">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="shrink-0 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel p-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-muted/60">
              <Icon size={15} className="text-gold-text" />
            </span>
            <p className="stat-value mt-3">{value}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="panel-raised overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
            <span
              aria-live="polite"
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle tabular-nums"
            >
              {query.trim() ? `${users.length} matching` : `${users.length} total`}
            </span>
          </div>
          <div className="border-b border-line px-5 py-3">
            <label htmlFor="admin-user-search" className="sr-only">
              Search accounts by name or email
            </label>
            <div className="relative">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                id="admin-user-search"
                type="search"
                className="field h-9 pl-8 text-xs"
                placeholder="Search name or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle">
                  Searching…
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            {users.length === 0 && (
              <p className="px-5 py-6 text-xs text-fg-subtle">
                {query.trim()
                  ? `No account matches “${query.trim()}”.`
                  : 'No accounts yet.'}
              </p>
            )}
            <ul className="divide-y divide-line md:hidden">
              {users.map((row) => (
                <li key={row.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">{row.name}</p>
                      <p className="truncate text-[11px] text-fg-subtle">{row.email}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gold-text">
                      {row.totalXp} XP
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      className="field h-9 min-w-0 flex-1 px-2 py-1.5 text-[11px]"
                      value={row.role}
                      disabled={row.id === user.id || busyId === row.id}
                      onChange={(event) => changeRole(row, event.target.value)}
                      title={row.id === user.id ? 'You cannot change your own role' : ''}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busyId === `pw-${row.id}`}
                      onClick={() => resetPassword(row)}
                      className="btn-ghost h-9 shrink-0 px-2.5 text-[11px]"
                      title="Issue a one-time temporary password"
                    >
                      <KeyRound size={12} />
                      Reset
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    Level {row.currentLevel}
                    {row.id === user.id ? ' · you' : ''}
                  </p>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-left text-xs md:table">
              <thead className="border-b border-line bg-muted/40 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Level</th>
                  <th className="px-3 py-2.5 font-semibold">XP</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-5 py-2.5 font-semibold">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-[11px] text-fg-subtle">{row.email}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-fg-muted">{row.currentLevel}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-gold-text">
                      {row.totalXp}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="field w-[7.5rem] px-2 py-1.5 text-[11px]"
                        value={row.role}
                        disabled={row.id === user.id || busyId === row.id}
                        onChange={(event) => changeRole(row, event.target.value)}
                        title={row.id === user.id ? 'You cannot change your own role' : ''}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        disabled={busyId === `pw-${row.id}`}
                        onClick={() => resetPassword(row)}
                        className="btn-ghost px-2.5 py-1.5 text-[11px]"
                        title="Issue a one-time temporary password"
                      >
                        <KeyRound size={12} />
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel-raised overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Course moderation</h2>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle tabular-nums">
              {courses.filter((course) => course.published).length} live
            </span>
          </div>
          <ul className="divide-y divide-line">
            {courses.length === 0 && (
              <li className="px-5 py-6 text-xs text-fg-subtle">No courses created yet.</li>
            )}
            {courses.map((course) => (
              <li
                key={course.id}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-muted/60 text-base">
                  {course.emoji || '🗺️'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{course.title}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                    {course.instructorName} · {course.moduleCount} nodes
                  </p>
                </div>
                <span
                  className={`chip px-2 py-0.5 text-[9px] ${
                    course.published
                      ? 'border-success/35 bg-success/[0.08] text-success'
                      : 'border-warning/35 bg-warning/[0.08] text-warning'
                  }`}
                >
                  {course.published ? 'live' : 'draft'}
                </span>
                <button
                  type="button"
                  disabled={busyId === `course-${course.id}`}
                  onClick={() => togglePublish(course)}
                  className="btn-ghost px-2.5 py-1.5 text-[11px]"
                >
                  {course.published ? <EyeOff size={12} /> : <Eye size={12} />}
                  {course.published ? 'Unpublish' : 'Publish'}
                </button>
                <Link
                  to={`/courses/${course.id}`}
                  className="text-[11px] font-semibold text-gold-text hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel-raised mt-6 overflow-hidden" aria-labelledby="audit-heading">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <History size={14} className="text-gold-text" aria-hidden="true" />
            <h2 id="audit-heading" className="text-sm font-semibold text-foreground">
              Recent admin activity
            </h2>
          </div>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle tabular-nums">
            Last {Math.min(audit.length, 50)}
          </span>
        </div>
        <ul className="divide-y divide-line">
          {audit.length === 0 && (
            <li className="px-5 py-6 text-xs text-fg-subtle">
              No privileged actions yet. Role changes, password resets and course
              moderation will appear here.
            </li>
          )}
          {audit.map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-foreground">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="min-w-0 truncate text-[11px] text-fg-muted">{entry.target}</span>
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-fg-subtle">
                  {formatWhen(entry.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-fg-subtle">
                {entry.actorEmail}
                {entry.detail ? ` · ${entry.detail}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
