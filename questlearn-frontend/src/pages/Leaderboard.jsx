import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Flame, Medal } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../services/api.js';

/* Only the current user's row gets accent colour; the podium is carried by
   the rank badge, so a board of ten does not read as ten highlights. */
const MEDAL_STYLES = {
  1: 'bg-gold/[0.14] text-gold-text ring-1 ring-inset ring-gold/30',
  2: 'bg-muted text-fg-muted ring-1 ring-inset ring-line-strong',
  3: 'bg-warning/[0.14] text-warning ring-1 ring-inset ring-warning/25',
};

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/leaderboard');
      setEntries(data);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load the leaderboard.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center text-sm text-fg-muted">
        Counting the XP…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <p className="eyebrow">Standings</p>
        <h1 className="page-title mt-2">Hall of adventurers</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          Ranked by total XP earned across every completed node.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <ol className="space-y-2.5">
        {entries.length === 0 && !error && (
          <li className="panel p-8 text-center text-sm text-fg-muted">
            No students on the board yet — clear a node to claim the first slot.
          </li>
        )}

        {entries.map((entry, index) => {
          const medal = MEDAL_STYLES[entry.rank];
          return (
            <motion.li
              key={entry.userId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors duration-150 ${
                entry.currentUser
                  ? 'border-gold/40 bg-gold/[0.07]'
                  : 'border-line bg-card/70 hover:border-line-strong'
              }`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                  medal ?? 'bg-muted text-fg-muted'
                }`}
              >
                {entry.rank <= 3 ? <Medal size={16} /> : entry.rank}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {entry.name}
                  {entry.currentUser && <span className="ml-1.5 text-gold-text">(you)</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
                  <Crown size={11} className="text-gold-text" /> Level {entry.currentLevel}
                  <span className="inline-flex items-center gap-1">
                    <Flame size={11} className="text-warning" /> {entry.streakDays}d
                  </span>
                </p>
              </div>

              <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
                {entry.totalXp.toLocaleString()}
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                  xp
                </span>
              </p>
            </motion.li>
          );
        })}
      </ol>

      <p className="mt-6 text-center text-[11px] text-fg-subtle">
        Your current rank is based on {user.role === 'STUDENT' ? 'student' : 'account'} XP.
      </p>
    </div>
  );
}
