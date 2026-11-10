import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Layers, Map, Trophy, Zap } from 'lucide-react';
import StreakCounter from '../components/gamification/StreakCounter.jsx';
import XPBar from '../components/gamification/XPBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGamification } from '../context/GamificationContext.jsx';
import api, { apiError } from '../services/api.js';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { totalXp, currentLevel } = useGamification();
  const [courses, setCourses] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [courseResponse, leaderboardResponse] = await Promise.all([
        api.get('/courses'),
        api.get('/leaderboard'),
      ]);
      setCourses(courseResponse.data);
      setLeaderboard(leaderboardResponse.data.slice(0, 5));
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load your dashboard.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalNodes = courses.reduce((sum, course) => sum + course.moduleCount, 0);
  const clearedNodes = courses.reduce((sum, course) => sum + course.completedModules, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <section className="relative isolate mb-6 overflow-hidden rounded-xl border border-line bg-card/80 p-6 shadow-card sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 -z-10 h-72 w-72 rounded-full bg-arcane/[0.10] blur-[90px]"
        />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="eyebrow">Adventurer's dashboard</p>
            <h1 className="page-title mt-2">Welcome back, {user.name.split(' ')[0]}</h1>
            <p className="page-subtitle mt-2">
              Level {currentLevel} · {totalXp.toLocaleString()} XP · {clearedNodes}/{totalNodes}{' '}
              nodes cleared
            </p>
          </div>
          <Link to="/leaderboard" className="btn-ghost shrink-0">
            <Trophy size={15} /> Leaderboard
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <XPBar />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <StreakCounter />
          <div className="panel-raised flex items-center gap-4 p-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rune/15 text-rune-text">
              <Zap size={22} />
            </div>
            <div>
              <p className="stat-value">{clearedNodes}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                Nodes cleared
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Map size={16} className="text-gold" />
            <h2 className="font-display text-lg font-semibold text-slate-50">Your quests</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((key) => (
                <div key={key} className="panel h-28 animate-pulse bg-white/5" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-slate-400">
              No published courses yet. Ask your instructor to publish a quest.
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course, index) => {
                const percent =
                  course.moduleCount > 0
                    ? Math.round((course.completedModules / course.moduleCount) * 100)
                    : 0;
                return (
                  <motion.article
                    key={course.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="panel-raised p-5"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-2xl">
                        {course.emoji || '🗺️'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-semibold text-slate-50">
                            {course.title}
                          </h3>
                          {course.category && <span className="chip">{course.category}</span>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                          {course.description}
                        </p>

                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-gold to-rune transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {course.completedModules}/{course.moduleCount}
                          </span>
                        </div>
                      </div>

                      <Link
                        to={`/courses/${course.id}`}
                        className="btn-primary shrink-0 self-center px-3 py-2 text-xs"
                      >
                        {course.completedModules > 0 ? 'Resume' : 'Begin'}
                      </Link>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-100">
                <Crown size={15} className="text-gold" /> Top adventurers
              </h2>
              <Link to="/leaderboard" className="text-[11px] font-semibold text-gold hover:underline">
                View all
              </Link>
            </div>

            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500">No ranked students yet.</p>
            ) : (
              <ol className="space-y-2">
                {leaderboard.map((entry) => (
                  <li
                    key={entry.userId}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${
                      entry.currentUser ? 'bg-gold/10 ring-1 ring-gold/30' : 'bg-white/[0.03]'
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-[11px] font-bold text-slate-300">
                      {entry.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
                      {entry.name}
                      {entry.currentUser && <span className="ml-1 text-gold">(you)</span>}
                    </span>
                    <span className="text-[11px] font-bold text-gold">{entry.totalXp} XP</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-100">
              <Layers size={15} className="text-rune" /> How XP works
            </h2>
            <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-400">
              <li>Every node has an XP reward shown on the canvas.</li>
              <li>Quiz answers are scored server-side before XP is awarded.</li>
              <li>Level = ⌊0.1 × √XP⌋ + 1 — there is no cap.</li>
              <li>Completing any node keeps your daily streak alive.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
