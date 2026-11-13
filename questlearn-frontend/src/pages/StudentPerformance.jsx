import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronDown,
  Flame,
  Gauge,
  GraduationCap,
  Sparkles,
  Star,
  Target,
} from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useGamification } from '../context/GamificationContext.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
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
  LOCKED: 'bg-line-strong',
};

function StatCard({ icon: Icon, label, value, hint, accent = 'text-gold-text' }) {
  return (
    <div className="panel-raised flex items-center gap-3 p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted ${accent}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="stat-value">{value}</p>
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-fg-muted">
          {label}
        </p>
        {hint && <p className="mt-1 truncate text-[10.5px] text-fg-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ percent, label }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-all duration-500"
        style={{ width: `${percent}%` }}
      />
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
  const [openHistory, setOpenHistory] = useState(null);
  const [histories, setHistories] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const { paused: retryPaused, reset: resetAutoRetry, retryNow: retryLoadNow } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
        resetAutoRetry();
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
  }, [loadAttempt, resetAutoRetry]);

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
        .filter(
          (node) =>
            node.quizType && (node.score > 0 || node.status === 'COMPLETED') && node.score < 100,
        )
        .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
        .slice(0, 6),
    [subjects],
  );

  /** Loaded on demand: the tree carries counts, the detail carries each score. */
  const toggleHistory = async (node) => {
    if (openHistory === node.id) {
      setOpenHistory(null);
      return;
    }
    setOpenHistory(node.id);
    if (histories[node.id] && !histories[node.id].error) return;

    setHistories((previous) => ({ ...previous, [node.id]: { loading: true, items: [] } }));
    try {
      const { data } = await api.get(`/modules/${node.id}`);
      setHistories((previous) => ({
        ...previous,
        // The API answers newest first; growth reads better oldest first.
        [node.id]: { loading: false, items: [...(data.history ?? [])].reverse() },
      }));
    } catch (historyError) {
      setHistories((previous) => ({
        ...previous,
        [node.id]: {
          loading: false,
          items: [],
          error: apiError(historyError, 'Could not load these tries.'),
        },
      }));
    }
  };

  const courseScore = (course) => {
    const scored = (trees[course.id] ?? []).filter(
      (node) => node.quizType && (node.score > 0 || node.status === 'COMPLETED'),
    );
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, node) => sum + node.score, 0) / scored.length);
  };

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-7">
        <p className="eyebrow">Progress</p>
        <h1 className="page-title mt-3">Your progress.</h1>
        <p className="page-subtitle mt-2 max-w-2xl">
          How far you have come in every subject, with quiz averages where a course has quizzes.
        </p>
      </header>

      <LoadErrorBanner
        className="mb-4"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      {loading ? (
        <div className="panel grid min-h-[260px] place-items-center p-8">
          <div className="flex flex-col items-center gap-2 text-[12px] text-fg-muted">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
            Adding up your progress…
          </div>
        </div>
      ) : courses.length === 0 ? (
        <div className="panel grid min-h-[280px] place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
              <Sparkles size={18} />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Nothing to measure yet</p>
            <p className="mt-1 text-[12px] leading-5 text-fg-muted">
              Finish a node in any course and your performance will appear here.
            </p>
            <Link to="/explore" className="btn-primary mt-4 h-9 text-[12px]">
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

          <div className="panel mt-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-foreground">Overall completion</p>
              <p className="text-[11px] text-fg-subtle">
                {overall.started} of {courses.length} course{courses.length === 1 ? '' : 's'} started ·{' '}
                {overall.completed} finished · {streakDays} day streak
              </p>
            </div>
            <div className="mt-3">
              <ProgressBar percent={overall.percent} label="Overall completion across all courses" />
            </div>
          </div>

          {weakestTopics.length > 0 && (
            <section className="panel mt-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                  <Target size={15} className="text-warning" /> Focus next
                </h2>
                <p className="text-[11px] text-fg-subtle">
                  Quiz scores below 100% across every subject
                </p>
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {weakestTopics.map((node) => (
                  <li
                    key={node.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-background/40 p-2.5"
                  >
                    <span className={`chip shrink-0 ${scoreChip(node.score)}`}>{node.score}%</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-foreground">
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
                    <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-foreground">
                      {subject.name}
                    </h2>
                    <p className="mt-1 text-[11px] text-fg-subtle">
                      {subject.courses.length} course{subject.courses.length === 1 ? '' : 's'} ·{' '}
                      {subject.cleared}/{subject.totalNodes} nodes · {subject.quizzed} quiz
                      {subject.quizzed === 1 ? '' : 'zes'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`chip ${scoreChip(subject.avgScore)}`}>
                      {subject.avgScore === null ? 'no score yet' : `${subject.avgScore}% avg`}
                    </span>
                    <span className="font-display text-[15px] font-semibold tabular-nums text-foreground">
                      {subject.percent}%
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <ProgressBar percent={subject.percent} label={`Completion in ${subject.name}`} />
                </div>

                <ul className="mt-3 space-y-2">
                  {subject.courses.map((course) => {
                    const percent = percentOf(course.completedModules, course.moduleCount);
                    const avg = courseScore(course);
                    return (
                      <li
                        key={course.id}
                        className="rounded-xl border border-line bg-background/40 p-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-muted text-sm">
                            {course.emoji || '🗺️'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold text-foreground">
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
                        <div className="mt-2.5">
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
                      className="btn-ghost h-8 px-3 text-[11px]"
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
                          const expanded = openHistory === node.id;
                          const history = histories[node.id];
                          const items = history?.items ?? [];
                          const delta =
                            items.length > 1 ? items[items.length - 1].score - items[0].score : 0;

                          const content = (
                            <>
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  STATUS_DOT[node.status] ?? STATUS_DOT.LOCKED
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-foreground">{node.title}</p>
                                <p className="text-[10px] text-fg-subtle">
                                  {node.xpReward} XP · {attemptsLabel(node)}
                                </p>
                              </div>
                              <span
                                className={`chip shrink-0 ${scoreChip(attempted ? node.score : null)}`}
                              >
                                {attempted ? `${node.score}%` : 'not tried'}
                              </span>
                            </>
                          );

                          return (
                            <li
                              key={node.id}
                              className="rounded-lg border border-line bg-background/40 px-3 py-2 text-[11.5px]"
                            >
                              {attempted ? (
                                <button
                                  type="button"
                                  onClick={() => toggleHistory(node)}
                                  aria-expanded={expanded}
                                  title={`Show every try for ${node.title}`}
                                  className="flex w-full items-center gap-2 text-left"
                                >
                                  {content}
                                  <ChevronDown
                                    size={12}
                                    className={`shrink-0 text-fg-muted transition-transform duration-150 ${
                                      expanded ? 'rotate-180' : ''
                                    }`}
                                  />
                                </button>
                              ) : (
                                <div
                                  title={node.status.toLowerCase()}
                                  className="flex items-center gap-2"
                                >
                                  {content}
                                </div>
                              )}

                              {expanded && (
                                <div className="mt-1.5 border-t border-line pt-1.5">
                                  {history?.loading ? (
                                    <p className="text-[10px] text-fg-muted">
                                      Loading these tries…
                                    </p>
                                  ) : history?.error ? (
                                    <p className="text-[10px] text-danger">{history.error}</p>
                                  ) : (
                                    <>
                                      <ol className="flex flex-wrap items-center gap-1.5">
                                        {items.map((attempt, index) => (
                                          <li
                                            key={`${node.id}-${index}`}
                                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                                              attempt.passed
                                                ? 'border-success/30 bg-success/[0.08] text-success'
                                                : 'border-warning/30 bg-warning/[0.08] text-warning'
                                            }`}
                                          >
                                            <span className="tabular-nums">
                                              {attempt.score}%
                                            </span>
                                            <span className="font-normal opacity-70">
                                              {new Date(attempt.at).toLocaleDateString(
                                                undefined,
                                                { day: 'numeric', month: 'short' },
                                              )}
                                            </span>
                                          </li>
                                        ))}
                                      </ol>
                                      <p className="mt-1 text-[10px] text-fg-subtle">
                                        {items.length === 0
                                          ? 'No individual tries were recorded for this node yet.'
                                          : delta > 0
                                            ? `Improved ${delta} points from first to latest.`
                                            : delta < 0
                                              ? `${Math.abs(delta)} points down from first to latest.`
                                              : 'Oldest first.'}
                                        {items.length > 0 &&
                                          node.attempts > items.length &&
                                          ` Showing the last ${items.length} of ${node.attempts}.`}
                                      </p>
                                    </>
                                  )}
                                </div>
                              )}
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
