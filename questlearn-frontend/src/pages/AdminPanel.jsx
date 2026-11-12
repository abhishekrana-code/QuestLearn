import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, KeyRound, ShieldCheck, Users } from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

const ROLE_OPTIONS = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];

export default function AdminPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busyId, setBusyId] = useState(null);

  const { paused: retryPaused, reset: resetAutoRetry, retryNow: retryLoadNow } = useAutoRetry({
    active: Boolean(loadError) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statsResponse, usersResponse, coursesResponse] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/courses'),
      ]);
      setStats(statsResponse.data);
      setUsers(usersResponse.data);
      setCourses(coursesResponse.data);
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

  const changeRole = async (targetUser, role) => {
    setBusyId(targetUser.id);
    try {
      const { data } = await api.patch(`/admin/users/${targetUser.id}/role`, { role });
      setUsers((previous) => previous.map((item) => (item.id === data.id ? data : item)));
      setMessage({ type: 'success', text: `${data.name} is now ${data.role.toLowerCase()}.` });
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
        <h1 className="page-title mt-2">War room</h1>
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
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle tabular-nums">
              {users.length} total
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
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
                  {course.published ? 'Unpublish' : 'Approve'}
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
    </div>
  );
}
