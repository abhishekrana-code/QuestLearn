import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Flame, Layers, Medal } from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import api, { apiError } from '../services/api.js';

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const PODIUM_STYLE = {
  1: {
    card: 'border-gold/35 bg-brand-tint/70',
    avatar: 'bg-gold text-white',
    icon: Crown,
    label: 'First place',
  },
  2: {
    card: 'border-line bg-card',
    avatar: 'bg-muted text-fg-muted',
    icon: Medal,
    label: 'Second place',
  },
  3: {
    card: 'border-warning/25 bg-warning/[0.05]',
    avatar: 'bg-warning/15 text-warning',
    icon: Medal,
    label: 'Third place',
  },
};

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/leaderboard');
      setEntries(data);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load the leaderboard.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const { paused: retryPaused, reset: resetAutoRetry, retryNow: retryLoadNow } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: load,
  });

  useEffect(() => {
    load();
  }, [load, loadAttempt]);

  useEffect(() => {
    if (!error && !loading) resetAutoRetry();
  }, [error, loading, resetAutoRetry]);

  if (loading) {
    return (
      <div className="shell py-8 sm:py-10">
        <header className="mb-7">
          <p className="eyebrow">Standings</p>
          <h1 className="page-title mt-3">Leaderboard</h1>
        </header>
        <div className="panel grid min-h-[260px] place-items-center p-8">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
        </div>
      </div>
    );
  }

  const podium = [entries[1], entries[0], entries[2]].filter(Boolean);
  const rest = entries.slice(3);

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-7 max-w-2xl">
        <p className="eyebrow">Standings</p>
        <h1 className="page-title mt-3">Leaderboard</h1>
        <p className="page-subtitle mt-2">
          Ranked by total XP earned across every completed node. Consistency beats cramming.
        </p>
      </header>

      <LoadErrorBanner
        className="mb-5"
        message={error}
        paused={retryPaused}
        onRetry={retryLoadNow}
      />

      {entries.length === 0 && !error ? (
        <div className="panel grid min-h-[260px] place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
              <Crown size={18} />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">No students on the board yet</p>
            <p className="mt-1 text-[12px] leading-5 text-fg-muted">
              Clear a node to claim the first slot.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {podium.map((entry) => {
              const style = PODIUM_STYLE[entry.rank] ?? PODIUM_STYLE[3];
              const Icon = style.icon;
              return (
                <motion.article
                  key={entry.userId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (entry.rank - 1) * 0.05 }}
                  className={`relative overflow-hidden rounded-[20px] border p-5 text-center ${style.card} ${
                    entry.rank === 1 ? 'md:-mt-2 md:pb-7' : ''
                  } ${entry.currentUser ? 'ring-2 ring-gold/30' : ''}`}
                >
                  <span className="absolute right-4 top-4 text-fg-subtle/70">
                    <Icon size={15} />
                  </span>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                    {style.label}
                  </p>
                  <span
                    className={`mx-auto mt-3 grid h-14 w-14 place-items-center rounded-full text-[15px] font-bold ${style.avatar}`}
                  >
                    {initials(entry.name)}
                  </span>
                  <h2 className="mt-3 truncate text-[14px] font-semibold text-foreground">
                    {entry.name}
                    {entry.currentUser && <span className="ml-1 text-gold-text">(you)</span>}
                  </h2>
                  <p className="mt-0.5 text-[10px] text-fg-subtle">
                    Level {entry.currentLevel} · {entry.streakDays}d streak
                  </p>
                  <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em] text-foreground">
                    {entry.totalXp.toLocaleString()}
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                      xp
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] text-fg-subtle">
                    {entry.modulesCleared} {entry.modulesCleared === 1 ? 'node' : 'nodes'} cleared
                  </p>
                </motion.article>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                  Everyone else
                </p>
                <p className="text-[10px] text-fg-subtle">{entries.length} learners ranked</p>
              </div>
              <ol>
                {rest.map((entry, index) => (
                  <motion.li
                    key={entry.userId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.025 }}
                    className={`flex items-center gap-3 border-b border-line/70 px-4 py-3 last:border-b-0 sm:px-5 ${
                      entry.currentUser ? 'bg-brand-tint/60' : 'hover:bg-muted/40'
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center text-[11px] font-semibold tabular-nums text-fg-subtle">
                      {entry.rank}
                    </span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-fg-muted">
                      {initials(entry.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-foreground">
                        {entry.name}
                        {entry.currentUser && <span className="ml-1.5 text-gold-text">(you)</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-fg-subtle">
                        <span className="inline-flex items-center gap-1">
                          <Crown size={10} className="text-gold-text" /> Level {entry.currentLevel}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Flame size={10} className="text-warning" /> {entry.streakDays}d
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Layers size={10} /> {entry.modulesCleared}{' '}
                          {entry.modulesCleared === 1 ? 'node' : 'nodes'}
                        </span>
                      </p>
                    </div>
                    <p className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">
                      {entry.totalXp.toLocaleString()}
                      <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                        xp
                      </span>
                    </p>
                  </motion.li>
                ))}
              </ol>
            </div>
          )}

          <p className="mt-6 text-center text-[11px] text-fg-subtle">
            Your current rank is based on {user.role === 'STUDENT' ? 'student' : 'account'} XP.
          </p>
        </>
      )}
    </div>
  );
}
