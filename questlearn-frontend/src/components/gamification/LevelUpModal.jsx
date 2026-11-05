import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Lottie from 'lottie-react';
import confetti from 'canvas-confetti';
import { Trophy } from 'lucide-react';
import levelUpAnimation from '../../assets/animations/level-up.json';

export default function LevelUpModal({ level, xpGained, unlocked = 0, onClose }) {
  useEffect(() => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#f4c95d', '#8b5cf6', '#22d3ee', '#f8e3a3'],
      disableForReducedMotion: true,
    });
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/80 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Level ${level} reached`}
      >
        <motion.div
          className="panel-raised relative w-full max-w-md overflow-hidden p-8 text-center"
          initial={{ scale: 0.85, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,201,93,0.22),transparent_60%)]" />

          <div className="relative mx-auto -mt-4 h-40 w-40">
            <Lottie animationData={levelUpAnimation} loop={false} autoplay />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <Trophy size={40} className="text-gold drop-shadow-[0_0_12px_rgba(244,201,93,0.8)]" />
            </div>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-gold">Level up</p>
          <h2 className="mt-2 font-display text-5xl font-bold text-slate-50">{level}</h2>
          {xpGained > 0 && (
            <p className="mt-2 text-sm text-slate-300">
              +{xpGained} XP earned this node
            </p>
          )}
          {unlocked > 0 && (
            <p className="mt-1 text-sm text-rune">
              {unlocked} new {unlocked === 1 ? 'node' : 'nodes'} unlocked on the skill tree
            </p>
          )}

          <button type="button" onClick={onClose} className="btn-primary mt-6 w-full">
            Continue the quest
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
