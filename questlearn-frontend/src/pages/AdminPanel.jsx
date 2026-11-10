import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../services/api.js';

const ROLE_OPTIONS = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];

export default function AdminPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResponse, usersResponse, coursesResponse] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/courses'),
      ]);
      setStats(statsResponse.data);
      setUsers(usersResponse.data);
      setCourses(coursesResponse.data);
    } catch (error) {
      setMessage({ type: 'error', text: apiError(error, 'Could not load admin data.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="grid min-h-[70vh] place-items-center text-sm text-slate-400">
        Opening the war room…
      </div>
    );
  }

  const cards = [
    { label: 'Accounts', value: stats?.totalUsers ?? 0, icon: Users, tone: 'text-rune' },
    { label: 'Students', value: stats?.students ?? 0, icon: Users, tone: 'text-gold' },
    { label: 'Instructors', value: stats?.instructors ?? 0, icon: ShieldCheck, tone: 'text-arcane-soft' },
    { label: 'Live courses', value: stats?.publishedCourses ?? 0, icon: BookOpen, tone: 'text-emerald-300' },
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

      {message && (
        <div
          className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
              : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="panel p-4">
            <Icon size={16} className={tone} />
            <p className="stat-value mt-2">{value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="panel-raised overflow-hidden">
          <div className="border-b border-white/10 px-5 py-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">Accounts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">User</th>
                  <th className="px-3 py-2.5">Level</th>
                  <th className="px-3 py-2.5">XP</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-5 py-2.5">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-100">{row.name}</p>
                      <p className="text-[11px] text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{row.currentLevel}</td>
                    <td className="px-3 py-3 font-semibold text-gold">{row.totalXp}</td>
                    <td className="px-3 py-3">
                      <select
                        className="field px-2 py-1.5 text-[11px]"
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
          <div className="border-b border-white/10 px-5 py-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">Course moderation</h2>
          </div>
          <ul className="divide-y divide-white/5">
            {courses.length === 0 && (
              <li className="px-5 py-6 text-xs text-slate-500">No courses created yet.</li>
            )}
            {courses.map((course) => (
              <li key={course.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-xl">{course.emoji || '🗺️'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-100">{course.title}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {course.instructorName} · {course.moduleCount} nodes
                  </p>
                </div>
                <span
                  className={`chip px-2 py-0.5 text-[9px] ${
                    course.published
                      ? 'border-emerald-400/30 text-emerald-300'
                      : 'border-amber-400/30 text-amber-300'
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
                  className="text-[11px] font-semibold text-gold hover:underline"
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
