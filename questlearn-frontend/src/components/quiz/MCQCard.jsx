import { AnimatePresence, motion } from 'framer-motion';

export default function MCQCard({ questions, answers, onSelect, disabled }) {
  return (
    <div className="space-y-7">
      {questions.map((question, questionIndex) => (
        <div key={question.id ?? questionIndex}>
          <p className="text-sm font-medium leading-relaxed text-foreground">
            <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-arcane-text">
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
                  aria-pressed={selected}
                  className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors duration-150 ${
                    selected
                      ? 'border-gold/60 bg-gold/[0.12] text-foreground'
                      : 'border-line bg-card/60 text-foreground hover:border-line-strong hover:bg-muted/60'
                  } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold transition-colors duration-150 ${
                      selected
                        ? 'bg-gold text-[hsl(var(--primary-foreground))]'
                        : 'bg-muted text-fg-muted'
                    }`}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span className="leading-relaxed">{option}</span>
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
                className="mt-2 text-[11px] text-fg-subtle"
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
