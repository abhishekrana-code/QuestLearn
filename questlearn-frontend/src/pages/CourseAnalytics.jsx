import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, TrendingDown, Users } from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

/** A bar whose width is a share of the learners who could reach the node. */
function Bar({ value, total, tone }) {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
    </span>
  );
}

function hours(value) {
  if (value == null) return '·';
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${Math.round(value / 24)} d`;
}

/**
 * Where a course loses people.
 *
 * <p>The roster answers "who is stuck now". This answers the other question: which
 * node a class arrives at and does not finish, so the teaching can change rather than
 * just the chasing.</p>
 */
export default function CourseAnalytics() {
  const { courseId } = useParams();
  const [data, setData] = useState(null);
  const [cohorts, setCohorts] = useState([]);
  const [cohortId, setCohortId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    api
      .get(`/courses/${courseId}/cohorts`)
      .then(({ data: list }) => setCohorts(list))
      .catch(() => {
        /* the funnel still works without the class picker */
      });
  }, [courseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: analytics } = await api.get(`/courses/${courseId}/analytics`, {
        params: cohortId ? { cohortId } : {},
      });
      setData(analytics);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load this course’s numbers.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, cohortId]);

  const { paused, reset, retryNow } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  useEffect(() => {
    load();
  }, [load, loadAttempt]);

  useEffect(() => {
    if (!error && !loading) reset();
  }, [error, loading, reset]);

  const nodes = data?.nodes ?? [];
  const learners = data?.learners ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link
        to="/studio"
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> Back to the studio
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Analytics</p>
          <h1 className="page-title mt-1 truncate text-2xl">
            {data?.courseTitle ?? 'Course analytics'}
          </h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-fg-subtle">
            Where the class arrives and stops. A wide gap between reached and cleared is a
            node worth teaching again, not a student worth chasing.
          </p>
        </div>

        <label className="min-w-[180px]">
          <span className="label">Class</span>
          <select
            className="field h-9 text-[12px]"
            value={cohortId}
            onChange={(event) => setCohortId(event.target.value)}
            aria-label="Limit these numbers to one class"
          >
            <option value="">Every learner</option>
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <LoadErrorBanner
        className="mt-4"
        message={error}
        paused={paused}
        onRetry={retryNow}
      />

      {loading && !data ? (
        <div className="panel mt-4 grid min-h-[220px] place-items-center text-sm text-fg-muted">
          Counting…
        </div>
      ) : data && learners === 0 ? (
        <div className="panel mt-4 grid min-h-[220px] place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
              <Users size={18} />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">Nobody here yet</p>
            <p className="mt-1 text-xs text-fg-subtle">
              {cohortId
                ? 'This class has no learners in it. Share its join code, or pick another class.'
                : 'Once learners join the course, their funnel shows up here.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { label: 'Learners', value: learners, hint: data?.cohortName ?? 'in the course' },
              { label: 'Started a node', value: data?.started ?? 0, hint: 'opened or attempted work' },
              { label: 'Cleared everything', value: data?.finished ?? 0, hint: 'every node completed' },
            ].map((stat) => (
              <div key={stat.label} className="panel px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{stat.value}</p>
                <p className="mt-0.5 text-[11px] text-fg-subtle">{stat.hint}</p>
              </div>
            ))}
          </div>

          {data?.dropOff && (
            <div className="panel mt-3 flex items-start gap-3 border-gold/30 bg-gold/[0.05] px-4 py-3">
              <TrendingDown size={16} className="mt-0.5 shrink-0 text-gold-text" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">
                  The class stops at “{data.dropOff.title}”
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-fg-subtle">
                  {data.dropOff.reached - data.dropOff.cleared} of the {data.dropOff.reached} learners
                  who reached it have not cleared it. That is the biggest gap in the course.
                </p>
              </div>
            </div>
          )}

          <div className="panel mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                  <th className="px-4 py-2.5 font-semibold">Node</th>
                  <th className="px-3 py-2.5 font-semibold">Reached</th>
                  <th className="px-3 py-2.5 font-semibold">Started</th>
                  <th className="px-3 py-2.5 font-semibold">Cleared</th>
                  <th className="px-3 py-2.5 font-semibold">Attempts</th>
                  <th className="px-4 py-2.5 font-semibold">Median to clear</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.moduleId} className="border-b border-line/60 last:border-0">
                    <td className="max-w-[220px] px-4 py-2.5">
                      <span className="block truncate font-medium text-foreground">{node.title}</span>
                      <span className="text-[10px] text-fg-subtle">Node {node.orderIndex}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums text-foreground">{node.reached}</span>
                      <Bar value={node.reached} total={learners} tone="bg-arcane" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums text-foreground">{node.started}</span>
                      <Bar value={node.started} total={learners} tone="bg-gold/70" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums text-foreground">{node.cleared}</span>
                      <Bar value={node.cleared} total={learners} tone="bg-success" />
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-fg-muted">{node.attempts}</td>
                    <td className="px-4 py-2.5 tabular-nums text-fg-muted">
                      {hours(node.medianHoursToClear)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-fg-subtle">
            <BarChart3 size={11} />
            Reached means a learner has the node unlocked. Started means at least one attempt.
          </p>
        </>
      )}
    </div>
  );
}
