import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useGamification } from '../../context/GamificationContext.jsx';

export default function XPBar({ compact = false }) {
  const { totalXp, currentLevel, nextLevelXp } = useGamification();

  const levelStart = 100 * (currentLevel - 1) ** 2;
  const levelEnd = Math.max(nextLevelXp || 100 * currentLevel ** 2, levelStart + 1);
  const percent = Math.min(100, Math.max(0, ((totalXp - levelStart) / (levelEnd - levelStart)) * 100));

  if (compact) {
    return (
      <div className="flex min-w-[150px] items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/10 text-xs font-bold text-gold">
          {currentLevel}
        </span>
        <div className="flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold via-gold-soft to-rune"
              initial={false}
              animate={{ width: `${percent}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            />
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {totalXp} / {levelEnd} XP
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-gold" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Level {currentLevel}
          </span>
        </div>
        <span className="text-xs font-medium text-slate-300">
          {totalXp.toLocaleString()} / {levelEnd.toLocaleString()} XP
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-white/10 bg-ink-900">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-gold via-gold-soft to-rune shadow-[0_0_18px_rgba(244,201,93,0.5)]"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {Math.max(0, levelEnd - totalXp).toLocaleString()} XP to level {currentLevel + 1}
      </p>
    </div>
  );
}
