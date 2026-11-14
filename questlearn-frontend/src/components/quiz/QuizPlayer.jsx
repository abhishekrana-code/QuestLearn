import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Send, XCircle } from 'lucide-react';
import { apiError } from '../../services/api.js';
import FormattedText from '../common/FormattedText.jsx';
import CodeOrderQuiz from './CodeOrderQuiz.jsx';
import DragDropQuiz from './DragDropQuiz.jsx';
import MCQCard from './MCQCard.jsx';

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function QuizPlayer({ quiz, onSubmit, disabled = false, retake = false }) {
  const { type, payload, passingScore } = quiz;
  const questions = payload?.questions ?? [];
  const lines = payload?.lines ?? [];
  const items = payload?.items ?? [];
  const targets = payload?.targets ?? [];

  const [mcqAnswers, setMcqAnswers] = useState({});
  const initialOrder = useMemo(
    () => shuffle(lines.map((_, index) => index)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quiz.id, lines.length],
  );
  const [order, setOrder] = useState(initialOrder);
  const [matches, setMatches] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const buildAnswers = () => {
    if (type === 'MULTIPLE_CHOICE') {
      return Object.entries(mcqAnswers).map(([questionId, selectedIndex]) => ({
        questionId,
        selectedIndex,
      }));
    }
    if (type === 'CODE_ORDER') {
      return [{ questionId: 'code-order', order: order.map((index) => lines[index]) }];
    }
    return [{ questionId: 'drag-drop', matches }];
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await onSubmit(buildAnswers());
      setResult(response);
    } catch (submitError) {
      setError(apiError(submitError, 'Could not submit your answers.'));
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(mcqAnswers).length;
  const allMatched = Object.keys(matches).length === items.length;
  const canSubmit =
    !disabled &&
    !submitting &&
    (type === 'MULTIPLE_CHOICE'
      ? answeredCount === questions.length && questions.length > 0
      : type === 'CODE_ORDER'
        ? lines.length > 0
        : allMatched);

  return (
    <div className="panel p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-arcane-text">
            Micro-assessment
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">
            {type === 'MULTIPLE_CHOICE'
              ? 'Knowledge check'
              : type === 'CODE_ORDER'
                ? 'Rebuild the snippet'
                : 'Match the pairs'}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {type === 'MULTIPLE_CHOICE' && questions.length > 0 && (
            <span className="chip tabular-nums">
              {answeredCount}/{questions.length} answered
            </span>
          )}
          <span className="chip border-gold/30 bg-gold/[0.08] text-gold-text">
            Pass mark {passingScore}%
          </span>
        </div>
      </div>

      {type === 'MULTIPLE_CHOICE' && (
        <MCQCard
          questions={questions}
          answers={mcqAnswers}
          onSelect={(id, index) => setMcqAnswers((prev) => ({ ...prev, [id]: index }))}
          disabled={disabled}
        />
      )}

      {type === 'CODE_ORDER' && (
        <CodeOrderQuiz
          prompt={payload.prompt}
          lines={lines}
          order={order}
          setOrder={setOrder}
          disabled={disabled}
        />
      )}

      {type === 'DRAG_DROP' && (
        <DragDropQuiz
          prompt={payload.prompt}
          items={items}
          targets={targets}
          matches={matches}
          setMatches={setMatches}
          disabled={disabled}
        />
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-4 flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm ${
              result.passed
                ? 'border-success/35 bg-success/[0.08] text-success'
                : 'border-warning/35 bg-warning/[0.08] text-warning'
            }`}
          >
            {result.passed ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            ) : (
              <XCircle size={18} className="mt-0.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold tabular-nums">
                Score {result.score}% · {result.passed ? 'Node cleared' : 'Not cleared yet'}
              </p>
              <p className="mt-0.5 text-xs opacity-90">
                <FormattedText text={result.message} />
              </p>
              {result.explanations?.length > 0 && (
                <div className="mt-3 rounded-lg border border-line/60 bg-muted/40 p-3 text-xs">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-text">
                    Explanations & Key Insights
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {result.explanations.map((exp, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-fg-muted">
                        <span className="mt-0.5 text-gold">•</span>
                        <span>
                          <FormattedText text={exp} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[11px] text-fg-subtle">
          {disabled
            ? 'Completed. Use “Try again” in the attempt history to retake.'
            : retake
              ? 'A retake keeps your best score and awards no extra XP.'
              : 'Answers are scored on the server: XP cannot be faked.'}
        </p>
        <button type="button" onClick={submit} disabled={!canSubmit} className="btn-primary">
          <Send size={15} />
          {submitting ? 'Scoring…' : result && !result.passed ? 'Try again' : 'Submit answers'}
        </button>
      </div>
    </div>
  );
}
