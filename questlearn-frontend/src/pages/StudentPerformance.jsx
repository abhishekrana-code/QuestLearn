import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Flame,
  Gauge,
  GraduationCap,
  Sparkles,
  Star,
  Target,
} from 'lucide-react';
import { useGamification } from '../context/GamificationContext.jsx';
import api, { apiError } from '../services/api.js';

const percentOf = (cleared, total) => (total > 0 ? Math.round((cleared / total) * 100) : 0);

function scoreChip(score) {
  if (score === null || score === undefined) return 'border-line text-fg-subtle';
  if (score >= 80) return 'border-success/30 text-success';
  if (score >= 60) return 'border-gold/30 text-gold-text';
  return 'border-warning/30 text-warning';
}

const UNSEEN_RANK = 101;

/** Attempted quizzes rank by score; untried and locked nodes sort after them. */
const topicRank = (node) =>
  node.quizType && (node.score > 0 || node.status === 'COMPLETED') ? node.score : UNSEEN_RANK;

/** "1 try" reads as a solid pass; several tries next to a score shows the grind. */
const attemptsLabel = (node) => {
  const tries = node.attempts ?? 0;
  if (tries === 0) return 'no attempts yet';
  return `${tries} ${tries === 1 ? 'try' : 'tries'}`;
};

const STATUS_DOT = {
  COMPLETED: 'bg-success',
  UNLOCKED: 'bg-gold',
  LOCKED: 'bg-slate-400',
};

function StatCard({ icon: Icon, label, value, hint, accent = 'text-gold-text' }) {
  return (
    <div className="panel-raised flex items-center gap-3 p-3.5 sm:p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted ${accent}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="stat-value">{value}</p>
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-fg-muted sm:text-[11px]">
          {label}
        </p>
        {hint && <p className="mt-0.5 truncate text-[10px] text-fg-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ percent, label }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Overall performance, folded up by subject.
 *
 * <p>The dashboard answers "what do I open next"; this page answers "how am I
 * doing" across every subject at once. Percentages come from the course list and
 * quiz averages from each course's skill tree, so a subject with no quiz does not
 * pretend to have a score.</p>
 */
export default function StudentPerformance() {
  const { totalXp, currentLevel, streakDays } = useGamification();
  const [courses, setCourses] = useState([]);
  const [trees, setTrees] = useState({});
  const [openTopic, setOpenTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/courses');
        if (cancelled) return;
        setCourses(data);

        const results = await Promise.allSettled(
          data.map((course) => api.get(`/courses/${course.id}/skill-tree`)),
        );
        if (cancelled) return;

        const loaded = {};
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            loaded[data[index].id] = result.value.data.nodes ?? [];
          }
        });
        setTrees(loaded);
      } catch (loadError) {
        if (!cancelled) {
          setError(apiError(loadError, 'Could not load your performance.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scoredNodes = useMemo(() => {
    const nodes = Object.values(trees).flat();
    return nodes.filter(
      (node) => node.quizType && (node.score > 0 || node.status === 'COMPLETED'),
    );
  }, [trees]);

  const overall = useMemo(() => {
    const totalNodes = courses.reduce((sum, course) => sum + course.moduleCount, 0);
    const cleared = courses.reduce((sum, course) => sum + course.completedModules, 0);
    const completed = courses.filter(
      (course) => course.moduleCount > 0 && course.completedModules === course.moduleCount,
    ).length;
    const avgScore = scoredNodes.length
      ? Math.round(scoredNodes.reduce((sum, node) => sum + node.score, 0) / scoredNodes.length)
      : null;

    return {
      totalNodes,
      cleared,
      percent: percentOf(cleared, totalNodes),
      started: courses.filter((course) => course.completedModules > 0).length,
      completed,
      avgScore,
      quizAttempts: scoredNodes.length,
    };
  }, [courses, scoredNodes]);

  const subjects = useMemo(() => {
    const groups = new Map();
    courses.forEach((course) => {
      const key = course.category?.trim() || 'Uncategorised';
      if (!groups.has(key)) groups.set(key, { name: key, courses: [] });
      groups.get(key).courses.push(course);
    });

    return [...groups.values()]
      .map((subject) => {
        const totalNodes = subject.courses.reduce((sum, course) => sum + course.moduleCount, 0);
        const cleared = subject.courses.reduce((sum, course) => sum + course.completedModules, 0);

        const nodes = subject.courses.flatMap((course) => trees[course.id] ?? []);
        const scored = nodes.filter(
          (node) => node.quizType && (node.score > 0 || node.status === 'COMPLETED'),
        );
        const quizzed = nodes.filter((node) => node.quizType).length;

        const topics = subject.courses
          .flatMap((course) =>
            (trees[course.id] ?? []).map((node) => ({
              ...node,
              courseId: course.id,
              courseTitle: course.title,
              subjectName: subject.name,
            })),
          )
          .sort((a, b) => topicRank(a) - topicRank(b) || a.title.localeCompare(b.title));

        return {
          ...subject,
          totalNodes,
          cleared,
          percent: percentOf(cleared, totalNodes),
          quizzed,
          topics,
          avgScore: scored.length
            ? Math.round(scored.reduce((sum, node) => sum + node.score, 0) / scored.length)
            : null,
        };
      })
      .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  }, [courses, trees]);

  const weakestTopics = useMemo(
    () =>
      subjects
        .flatMap((subject) => subject.topics)
        .filter((node) => node.quizType && (node.score > 0 || node.status === 'COMPLETED'))
        .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
        .slice(0, 6),
    [subjects],
  );

  const courseScore = (course) => {
    const scored = (trees[course.id] ?? []).filter(
      (node) => node.quizType && (node.score > 0 || node.status === 'COMPLETED'),
    );
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, node) => sum + node.score, 0) / scored.length);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="eyebrow">Progress</p>
        <h1 className="page-title mt-2">Your performance</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          How far you have come in every subject, with quiz averages where a course has quizzes.
        </p>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="panel grid min-h-[240px] place-items-center text-sm text-slate-400">
          Adding up your progress…
        </div>
      ) : courses.length === 0 ? (
        <div className="panel grid min-h-[240px] place-items-center p-8 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">Nothing to measure yet</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Finish a node in any course and your performance will appear here.
            </p>
            <Link to="/explore" className="btn-primary mt-4 text-xs">
              <Sparkles size={14} /> Browse courses
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Star} label="Total XP" value={totalXp.toLocaleString()} hint="All subjects" />
            <StatCard icon={GraduationCap} label="Level" value={currentLevel} hint="From total XP" accent="text-arcane-text" />
            <StatCard icon={Gauge} label="Nodes cleared" value={`${overall.cleared}/${overall.totalNodes}`} hint={`${overall.percent}% of everything`} />
            <StatCard
              icon={Flame}
              label="Average quiz score"
              value={overall.avgScore === null ? '—' : `${overall.avgScore}%`}
              hint={
                overall.avgScore === null
                  ? 'No quizzes attempted yet'
                  : `${overall.quizAttempts} quiz${overall.quizAttempts === 1 ? '' : 'zes'} scored`
              }
              accent="text-warning"
            />
          </div>

          <div className="panel mt-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Overall completion</p>
              <p className="text-[11px] text-fg-subtle">
                {overall.started} of {courses.length} course{courses.length === 1 ? '' : 's'} started ·{' '}
                {overall.completed} finished · {streakDays} day streak
              </p>
            </div>
            <div className="mt-2">
              <ProgressBar percent={overall.percent} label="Overall completion across all courses" />
            </div>
          </div>

          {weakestTopics.length > 0 && (
            <section className="panel mt-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Target size={15} className="text-warning" /> Focus next
                </h2>
                <p className="text-[11px] text-fg-subtle">
                  Lowest quiz scores across every subject
                </p>
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {weakestTopics.map((node) => (
                  <li
                    key={node.id}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-card/50 p-2.5"
                  >
                    <span className={`chip shrink-0 ${scoreChip(node.score)}`}>{node.score}%</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {node.title}
                      </p>
                      <p className="truncate text-[10px] text-fg-subtle">
                        {node.courseTitle} · {node.subjectName} · {attemptsLabel(node)}
                      </p>
                    </div>
                    <Link
                      to={`/courses/${node.courseId}`}
                      aria-label={`Open ${node.courseTitle}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line text-fg-muted transition-colors hover:border-gold/40 hover:text-gold-text"
                    >
                      <ArrowUpRight size={13} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-6 space-y-4">
            {subjects.map((subject) => (
              <section key={subject.name} className="panel-raised p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-foreground">{subject.name}</h2>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      {subject.courses.length} course{subject.courses.length === 1 ? '' : 's'} ·{' '}
                      {subject.cleared}/{subject.totalNodes} nodes · {subject.quizzed} quiz
                      {subject.quizzed === 1 ? '' : 'zes'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`chip ${scoreChip(subject.avgScore)}`}>
                      {subject.avgScore === null ? 'no score yet' : `${subject.avgScore}% avg`}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {subject.percent}%
                    </span>
                  </div>
                </div>

                <div className="mt-2.5">
                  <ProgressBar percent={subject.percent} label={`Completion in ${subject.name}`} />
                </div>

                <ul className="mt-3 space-y-2">
                  {subject.courses.map((course) => {
                    const percent = percentOf(course.completedModules, course.moduleCount);
                    const avg = courseScore(course);
                    return (
                      <li
                        key={course.id}
                        className="rounded-xl border border-line bg-card/50 p-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-muted text-sm">
                            {course.emoji || '🗺️'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {course.title}
                            </p>
                            <p className="text-[10px] text-fg-subtle">
                              {course.completedModules}/{course.moduleCount} nodes cleared
                            </p>
                          </div>
                          <span className={`chip shrink-0 ${scoreChip(avg)}`}>
                            {avg === null ? '—' : `${avg}%`}
                          </span>
                          <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums text-fg-muted">
                            {percent}%
                          </span>
                          <Link
                            to={`/courses/${course.id}`}
                            aria-label={`Open ${course.title}`}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line text-fg-muted transition-colors hover:border-gold/40 hover:text-gold-text"
                          >
                            <ArrowUpRight size={13} />
                          </Link>
                        </div>
                        <div className="mt-2">
                          <ProgressBar percent={percent} label={`Completion in ${course.title}`} />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {subject.topics.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenTopic(openTopic === subject.name ? null : subject.name)
                      }
                      aria-expanded={openTopic === subject.name}
                      className="btn-ghost text-[11px]"
                    >
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-150 ${
                          openTopic === subject.name ? 'rotate-180' : ''
                        }`}
                      />
                      {openTopic === subject.name
                        ? 'Hide topics'
                        : `Show ${subject.topics.length} topics`}
                    </button>

                    {openTopic === subject.name && (
                      <ul className="mt-2 space-y-1.5">
                        {subject.topics.map((node) => {
                          const attempted =
                            node.quizType && (node.score > 0 || node.status === 'COMPLETED');
                          return (
                            <li
                              key={node.id}
                              title={node.status.toLowerCase()}
                              className="flex items-center gap-2 rounded-lg border border-line bg-card/40 px-2.5 py-1.5 text-[11px]"
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  STATUS_DOT[node.status] ?? STATUS_DOT.LOCKED
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-foreground">{node.title}</p>
                                <p className="text-[10px] text-fg-subtle">
                                  {node.xpReward} XP · {attemptsLabel(node)}
                                </p>
                              </div>
                              <span
                                className={`chip shrink-0 ${scoreChip(attempted ? node.score : null)}`}
                              >
                                {attempted ? `${node.score}%` : 'not tried'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
