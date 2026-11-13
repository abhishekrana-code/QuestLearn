import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useGamification } from '../../context/GamificationContext.jsx';

export default function StreakCounter({ compact = false }) {
  const { streakDays } = useGamification();
  const active = streakDays > 0;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${
          active
            ? 'border-warning/30 bg-warning/10 text-warning'
            : 'border-line bg-card text-fg-subtle'
        }`}
        title={`${streakDays} day learning streak`}
      >
        <Flame size={13} className={active ? 'text-warning' : ''} />
        {streakDays}d
      </div>
    );
  }

  return (
    <div className="panel-raised flex h-full items-center gap-3 p-4">
      <motion.div
        animate={active ? { scale: [1, 1.06, 1] } : {}}
        transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          active ? 'bg-warning/12 text-warning' : 'bg-muted text-fg-subtle'
        }`}
      >
        <Flame size={21} />
      </motion.div>
      <div>
        <p className="stat-value">{streakDays}</p>
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-fg-muted">
          Day streak
        </p>
      </div>
    </div>
  );
}
