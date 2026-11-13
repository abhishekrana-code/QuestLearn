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
      <div className="flex min-w-[142px] items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-tint text-[11px] font-bold text-gold-text">
          {currentLevel}
        </span>
        <div className="flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft"
              initial={false}
              animate={{ width: `${percent}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            />
          </div>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
            {totalXp.toLocaleString()} / {levelEnd.toLocaleString()} XP
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-raised flex h-full flex-col justify-center gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-gold-text">
            <Sparkles size={16} />
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Level
            </p>
            <p className="font-display text-lg font-semibold leading-none tracking-[-0.04em] text-foreground">
              {currentLevel}
            </p>
          </div>
        </div>
        <p className="text-[11px] font-semibold tabular-nums text-fg-muted">
          {totalXp.toLocaleString()} / {levelEnd.toLocaleString()} XP
        </p>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        />
      </div>

      <p className="text-[10px] text-fg-subtle">
        {Math.max(0, levelEnd - totalXp).toLocaleString()} XP to reach level {currentLevel + 1}
      </p>
    </div>
  );
}
