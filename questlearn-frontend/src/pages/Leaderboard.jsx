import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Flame, Medal, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../services/api.js';

const MEDAL_STYLES = {
  1: 'from-gold/30 to-gold/5 text-gold border-gold/50',
  2: 'from-slate-300/25 to-slate-300/5 text-slate-200 border-slate-300/40',
  3: 'from-amber-600/30 to-amber-600/5 text-amber-400 border-amber-600/40',
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
      <div className="grid min-h-[70vh] place-items-center text-sm text-slate-400">
        Counting the XP…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold/10 text-gold shadow-glow">
          <Trophy size={24} />
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold text-slate-50">Hall of adventurers</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ranked by total XP earned across every completed node.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <ol className="space-y-2.5">
        {entries.length === 0 && !error && (
          <li className="panel p-8 text-center text-sm text-slate-400">
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
              className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
                entry.currentUser
                  ? 'border-gold/50 bg-gold/10'
                  : medal
                    ? `border bg-gradient-to-r ${medal}`
                    : 'border-white/10 bg-ink-800/60'
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-900/60 font-display text-sm font-bold">
                {entry.rank <= 3 ? <Medal size={17} /> : entry.rank}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {entry.name}
                  {entry.currentUser && <span className="ml-1.5 text-gold">(you)</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <Crown size={11} className="text-gold/80" /> Level {entry.currentLevel}
                  <span className="inline-flex items-center gap-1">
                    <Flame size={11} className="text-orange-400" /> {entry.streakDays}d
                  </span>
                </p>
              </div>

              <p className="shrink-0 font-display text-lg font-bold text-gold">
                {entry.totalXp.toLocaleString()}
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  xp
                </span>
              </p>
            </motion.li>
          );
        })}
      </ol>

      <p className="mt-6 text-center text-[11px] text-slate-500">
        Your current rank is based on {user.role === 'STUDENT' ? 'student' : 'account'} XP.
      </p>
    </div>
  );
}
