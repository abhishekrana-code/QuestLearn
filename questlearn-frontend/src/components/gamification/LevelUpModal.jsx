import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import lottieModule from 'lottie-react';
import confetti from 'canvas-confetti';
import { Trophy } from 'lucide-react';
import levelUpAnimation from '../../assets/animations/level-up.json';

// lottie-react is CommonJS, and the bundler hands its whole module object to the
// default import, so the component sits one level down. Unwrap it explicitly
// rather than trusting the interop, which changed under Vite 8.
const Lottie = lottieModule?.default ?? lottieModule;

export default function LevelUpModal({ level, xpGained, unlocked = 0, onClose }) {
  useEffect(() => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#FA4614', '#FF8F66', '#F5C8A8', '#2F7D6B'],
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
        className="scrim fixed inset-0 z-[60] grid place-items-center p-4"
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--gold)/0.16),transparent_62%)]" />

          <div className="relative mx-auto -mt-4 h-40 w-40">
            <Lottie animationData={levelUpAnimation} loop={false} autoplay />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <Trophy size={40} className="text-gold drop-shadow-[0_0_12px_hsl(var(--gold)/0.45)]" />
            </div>
          </div>

          <p className="eyebrow justify-center">Level up</p>
          <h2 className="mt-2 font-display text-[52px] font-semibold leading-none tracking-[-0.05em] text-foreground">
            {level}
          </h2>
          {xpGained > 0 && (
            <p className="mt-2 text-[13px] text-fg-muted">+{xpGained} XP earned this node</p>
          )}
          {unlocked > 0 && (
            <p className="mt-1 text-[13px] text-rune-text">
              {unlocked} new {unlocked === 1 ? 'node' : 'nodes'} unlocked on the skill tree
            </p>
          )}

          <button type="button" onClick={onClose} className="btn-primary mt-6 h-11 w-full text-[13px]">
            Keep going
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
