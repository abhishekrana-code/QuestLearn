import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useGamification } from '../../context/GamificationContext.jsx';

export default function StreakCounter({ compact = false }) {
  const { streakDays } = useGamification();
  const active = streakDays > 0;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
          active
            ? 'border-orange-400/40 bg-orange-500/10 text-orange-200'
            : 'border-white/10 bg-white/5 text-slate-400'
        }`}
        title={`${streakDays} day learning streak`}
      >
        <Flame size={14} className={active ? 'text-orange-400' : ''} />
        {streakDays}d
      </div>
    );
  }

  return (
    <div className="panel-raised flex items-center gap-4 p-4">
      <motion.div
        animate={active ? { scale: [1, 1.08, 1] } : {}}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
        className={`grid h-12 w-12 place-items-center rounded-2xl ${
          active ? 'bg-orange-500/15 text-orange-300' : 'bg-white/5 text-slate-500'
        }`}
      >
        <Flame size={24} />
      </motion.div>
      <div>
        <p className="stat-value">{streakDays}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Day streak
        </p>
      </div>
    </div>
  );
}
