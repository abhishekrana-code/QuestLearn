import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import LevelUpModal from '../components/gamification/LevelUpModal.jsx';
import { useAuth } from './AuthContext.jsx';

const GamificationContext = createContext(null);

const EMPTY_STATS = {
  totalXp: 0,
  currentLevel: 1,
  streakDays: 0,
  nextLevelXp: 100,
};

export function GamificationProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [stats, setStats] = useState(EMPTY_STATS);
  const [xpBurst, setXpBurst] = useState(null);
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    if (user) {
      setStats({
        totalXp: user.totalXp ?? 0,
        currentLevel: user.currentLevel ?? 1,
        streakDays: user.streakDays ?? 0,
        nextLevelXp: user.nextLevelXp ?? 100,
      });
    } else {
      setStats(EMPTY_STATS);
    }
  }, [user]);

  useEffect(() => {
    if (!xpBurst) return undefined;
    const timer = setTimeout(() => setXpBurst(null), 2200);
    return () => clearTimeout(timer);
  }, [xpBurst]);

  /** Applies an XpAwardResponse coming from the backend. */
  const award = useCallback(
    (result) => {
      const next = {
        totalXp: result.newTotalXp,
        currentLevel: result.newLevel,
        streakDays: result.streakDays,
        nextLevelXp: result.nextLevelXp ?? 100,
      };
      setStats(next);

      if (result.xpGained > 0) {
        setXpBurst({ amount: result.xpGained, id: Date.now() });
      }
      if (result.leveledUp) {
        setCelebration({
          level: result.newLevel,
          xpGained: result.xpGained,
          unlocked: result.unlockedModuleIds?.length ?? 0,
        });
      }

      updateUser({
        totalXp: next.totalXp,
        currentLevel: next.currentLevel,
        streakDays: next.streakDays,
        nextLevelXp: next.nextLevelXp,
      });
    },
    [updateUser],
  );

  const value = useMemo(
    () => ({
      ...stats,
      xpBurst,
      award,
      dismissCelebration: () => setCelebration(null),
    }),
    [stats, xpBurst, award],
  );

  return (
    <GamificationContext.Provider value={value}>
      {children}

      {xpBurst && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center">
          <div className="animate-float rounded-full border border-gold/40 bg-ink-800/95 px-5 py-2 text-sm font-bold text-gold-text shadow-glow">
            +{xpBurst.amount} XP
          </div>
        </div>
      )}

      {celebration && (
        <LevelUpModal
          level={celebration.level}
          xpGained={celebration.xpGained}
          unlocked={celebration.unlocked}
          onClose={() => setCelebration(null)}
        />
      )}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used inside <GamificationProvider>');
  }
  return context;
}
