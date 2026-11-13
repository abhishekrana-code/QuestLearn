import { useAnimationControls, motion } from 'framer-motion';
import { Brain, Check, Code2, Lock, Play, Shapes } from 'lucide-react';

const QUIZ_ICON = {
  MULTIPLE_CHOICE: Brain,
  CODE_ORDER: Code2,
  DRAG_DROP: Shapes,
};

const NODE_SIZE = 84;

export default function SkillNode({ node, x, y, active, onSelect, onLockedClick }) {
  const controls = useAnimationControls();
  const locked = node.status === 'LOCKED';
  const completed = node.status === 'COMPLETED';
  const QuizIcon = node.quizType ? QUIZ_ICON[node.quizType] : null;

  const handleClick = () => {
    if (locked) {
      controls.start({
        x: [0, -6, 6, -4, 4, 0],
        transition: { duration: 0.45 },
      });
      onLockedClick?.(node);
      return;
    }
    onSelect?.(node);
  };

  return (
    <motion.div
      className="absolute flex w-[190px] flex-col items-center"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: node.orderIndex * 0.06, type: 'spring', stiffness: 200, damping: 18 }}
    >
      <motion.button
        type="button"
        onClick={handleClick}
        animate={controls}
        whileHover={locked ? {} : { scale: 1.06 }}
        className={`relative grid place-items-center rounded-full border-2 transition-shadow ${
          completed
            ? 'border-gold bg-gold text-white shadow-glow'
            : locked
              ? 'cursor-not-allowed border-line bg-muted text-fg-subtle'
              : 'border-gold bg-brand-tint text-gold-text shadow-glow'
        } ${active ? 'ring-2 ring-gold ring-offset-2 ring-offset-background' : ''}`}
        style={{ width: NODE_SIZE, height: NODE_SIZE }}
        aria-label={`${node.title} (${node.status.toLowerCase()})`}
      >
        {!locked && !completed && (
          <span className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-full border border-gold/50" />
        )}

        {completed ? (
          <Check size={30} strokeWidth={3} />
        ) : locked ? (
          <Lock size={26} />
        ) : (
          <Play size={28} className="ml-0.5" />
        )}

        {QuizIcon && (
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-line bg-card text-fg-muted shadow-card">
            <QuizIcon size={13} />
          </span>
        )}

        {completed && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full border border-gold/50 bg-card px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-gold-text shadow-card">
            {node.score}%
          </span>
        )}
      </motion.button>

      <div className="mt-3 text-center">
        <p
          className={`text-[12px] font-semibold leading-tight ${
            locked ? 'text-fg-subtle' : 'text-foreground'
          }`}
        >
          {node.title}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-gold-text">
          +{node.xpReward} XP
        </p>
        {locked && (
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-fg-subtle">Locked</p>
        )}
      </div>
    </motion.div>
  );
}
