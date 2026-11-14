import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Check, Compass, Crown, Layers, Sparkles, Trophy, Zap } from 'lucide-react';
import EmailVerificationBanner from '../components/common/EmailVerificationBanner.jsx';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
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

  const { paused: retryPaused, retryNow: retryLoadNow, reset: resetAutoRetry } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: load,
  });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!error && !loading) resetAutoRetry();
  }, [error, loading, resetAutoRetry]);

  const enrolledCourses = courses.filter((course) => course.enrolled);
  // A learner who has not joined anything yet still sees the catalogue, so the
  // dashboard is never an empty page on first sign-in.
  const listedCourses = enrolledCourses.length > 0 ? enrolledCourses : courses;
  const totalNodes = listedCourses.reduce((sum, course) => sum + (course.moduleCount ?? 0), 0);
  const clearedNodes = listedCourses.reduce(
    (sum, course) => sum + (course.completedModules ?? 0),
    0,
  );
  const firstName = user.name.split(' ')[0];

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="eyebrow">Your learning space</p>
          <h1 className="page-title mt-3">Good to see you, {firstName}.</h1>
          <p className="page-subtitle mt-2">
            Level {currentLevel} · {totalXp.toLocaleString()} XP · {clearedNodes}/{totalNodes} nodes
            cleared
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/explore" className="btn-ghost h-10 px-4 text-[12px]">
            <Compass size={14} />
            Browse courses
          </Link>
          <Link to="/leaderboard" className="btn-primary h-10 px-4 text-[12px]">
            <Trophy size={14} />
            Leaderboard
          </Link>
        </div>
      </header>

      <EmailVerificationBanner className="mb-5" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.55fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <XPBar />
        </div>
        <StreakCounter />
        <div className="panel-raised flex h-full items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rune/12 text-rune-text">
            <Zap size={20} />
          </span>
          <div className="min-w-0">
            <p className="stat-value">{clearedNodes}</p>
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-fg-muted">
              Nodes cleared
            </p>
          </div>
        </div>
      </div>

      <LoadErrorBanner
        className="mt-5"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              <BookOpen size={16} className="text-gold-text" />
              Continue learning
            </h2>
            <Link
              to="/explore"
              className="text-[11px] font-semibold text-gold-text transition-colors hover:underline"
            >
              View all courses
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((key) => (
                <div key={key} className="panel h-[116px] animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : listedCourses.length === 0 ? (
            <div className="panel p-8 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
                <Compass size={18} />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">No courses yet</p>
              <p className="mt-1 text-[12px] leading-5 text-fg-muted">
                Ask your instructor to publish a course, or browse the catalogue.
              </p>
              <Link to="/explore" className="btn-primary mt-4 h-9 text-[12px]">
                Browse courses
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {listedCourses.map((course, index) => {
                const percent =
                  course.moduleCount > 0
                    ? Math.round((course.completedModules / course.moduleCount) * 100)
                    : 0;
                const hasProgress = course.completedModules > 0;

                return (
                  <motion.article
                    key={course.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="panel card-hover p-4 sm:p-5"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-xl">
                        {course.emoji || '🗺️'}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.015em] text-foreground">
                            {course.title}
                          </h3>
                          {course.category && <span className="chip">{course.category}</span>}
                          {course.enrolled && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/[0.08] px-2 py-0.5 text-[10px] font-semibold text-success">
                              <Check size={10} /> Enrolled
                            </span>
                          )}
                        </div>

                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-fg-muted">
                          {course.description}
                        </p>

                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-fg-subtle">
                            {course.completedModules}/{course.moduleCount}
                          </span>
                        </div>
                      </div>

                      <Link
                        to={`/courses/${course.id}`}
                        className="btn-primary mt-1 hidden h-9 shrink-0 px-3.5 text-[12px] sm:inline-flex"
                      >
                        {hasProgress ? 'Continue' : 'Start'}
                        <ArrowRight size={13} />
                      </Link>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 sm:hidden">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                        {percent}% complete
                      </span>
                      <Link
                        to={`/courses/${course.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-text"
                      >
                        {hasProgress ? 'Continue' : 'Start course'}
                        <ArrowRight size={12} />
                      </Link>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
          <div className="panel mt-6 p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <Layers size={15} className="text-rune-text" />
              How XP works
            </h2>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {[
                'Every node shows its XP reward before you open it.',
                'Quiz answers are scored on the server before XP is awarded.',
                'Level = ⌊0.1 × √XP⌋ + 1 — there is no cap.',
                'Completing any node keeps your daily streak alive.',
              ].map((tip) => (
                <li
                  key={tip}
                  className="flex items-start gap-2 text-[11.5px] leading-5 text-fg-muted"
                >
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                <Crown size={15} className="text-gold-text" />
                Top learners
              </h2>
              <Link
                to="/leaderboard"
                className="text-[11px] font-semibold text-gold-text hover:underline"
              >
                View all
              </Link>
            </div>

            {leaderboard.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">No ranked students yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {leaderboard.map((entry) => (
                  <li
                    key={entry.userId}
                    className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                      entry.currentUser
                        ? 'bg-brand-tint ring-1 ring-inset ring-gold/25'
                        : 'hover:bg-muted/60'
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg text-[10px] font-bold ${
                        entry.rank === 1
                          ? 'bg-gold/15 text-gold-text'
                          : 'bg-muted text-fg-muted'
                      }`}
                    >
                      {entry.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                      {entry.name}
                      {entry.currentUser && <span className="ml-1 text-gold-text">(you)</span>}
                    </span>
                    <span className="text-[10px] font-bold tabular-nums text-gold-text">
                      {entry.totalXp.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-[20px] border border-line bg-brand-tint/60 p-5">
            <Sparkles size={16} className="text-gold-text" />
            <p className="mt-2 text-[12px] font-semibold text-foreground">
              Small sessions count.
            </p>
            <p className="mt-1 text-[11px] leading-5 text-fg-muted">
              One node today is worth more than a perfect plan for tomorrow.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
