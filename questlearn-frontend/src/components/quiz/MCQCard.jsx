import { AnimatePresence, motion } from 'framer-motion';

export default function MCQCard({ questions, answers, onSelect, disabled }) {
  return (
    <div className="space-y-6">
      {questions.map((question, questionIndex) => (
        <div key={question.id ?? questionIndex}>
          <p className="text-sm font-medium leading-relaxed text-slate-100">
            <span className="mr-2 text-xs font-bold uppercase tracking-wider text-arcane-soft">
              Q{questionIndex + 1}
            </span>
            {question.prompt}
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {question.options.map((option, optionIndex) => {
              const selected = answers[question.id] === optionIndex;
              return (
                <motion.button
                  key={optionIndex}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(question.id, optionIndex)}
                  whileTap={disabled ? {} : { scale: 0.985 }}
                  className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                    selected
                      ? 'border-gold/70 bg-gold/15 text-gold-soft shadow-glow'
                      : 'border-white/10 bg-ink-900/60 text-slate-200 hover:border-white/25 hover:bg-ink-700/60'
                  } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold ${
                      selected ? 'bg-gold text-ink-900' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span>{option}</span>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {answers[question.id] === undefined && !disabled && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-[11px] text-slate-500"
              >
                Pick one answer to continue.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
