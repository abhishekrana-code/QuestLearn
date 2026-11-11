import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  Code2,
  FileText,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';

export const QUIZ_TEMPLATES = {
  MULTIPLE_CHOICE: {
    questions: [
      {
        id: 'q1',
        prompt: 'What does the JWT filter validate?',
        options: ['The password', 'The signature and expiry', 'The database schema', 'The CSS'],
        correctIndex: 1,
        explanation: 'Signature + expiry are checked on every request.',
      },
    ],
  },
  CODE_ORDER: {
    prompt: 'Order these statements correctly.',
    lines: [
      'const res = await fetch(url);',
      'if (!res.ok) throw new Error();',
      'return res.json();',
    ],
    explanation: 'Check the status before parsing.',
  },
  DRAG_DROP: {
    prompt: 'Match each term to its meaning.',
    pairs: [
      { left: 'Hibernate', right: 'JPA implementation' },
      { left: 'HikariCP', right: 'Connection pool' },
    ],
  },
};

function parsePayload(value, type) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      /* fallback to template */
    }
  }
  return QUIZ_TEMPLATES[type] || QUIZ_TEMPLATES.MULTIPLE_CHOICE;
}

export default function QuizEditor({ type, value, onChange, disabled = false }) {
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState(null);

  const payload = parsePayload(value, type);

  useEffect(() => {
    if (showJson) {
      setJsonDraft(JSON.stringify(payload, null, 2));
      setJsonError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJson]);

  const emit = (updated) => {
    // Stringify if parent expects a string
    onChange(typeof value === 'string' ? JSON.stringify(updated, null, 2) : updated);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('A quiz must be a valid JSON object.');
        return;
      }
      emit(parsed);
      setJsonError(null);
      setShowJson(false);
    } catch {
      setJsonError('Invalid JSON format. Check braces, commas, and quotes.');
    }
  };

  const resetToTemplate = () => {
    const template = QUIZ_TEMPLATES[type] || QUIZ_TEMPLATES.MULTIPLE_CHOICE;
    emit(template);
    setJsonDraft(JSON.stringify(template, null, 2));
    setJsonError(null);
  };

  if (showJson) {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Braces size={14} className="text-arcane-text" />
            <span className="label mb-0">Raw JSON editor</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold text-gold-text hover:underline"
              onClick={resetToTemplate}
            >
              Reset to template
            </button>
            <span className="text-fg-subtle">·</span>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              onClick={() => setShowJson(false)}
            >
              <FileText size={13} /> Back to visual builder
            </button>
          </div>
        </div>
        <textarea
          rows={10}
          spellCheck={false}
          disabled={disabled}
          className="field mt-2 resize-y bg-muted/40 font-mono text-[12px] leading-relaxed"
          value={jsonDraft}
          onChange={(event) => {
            setJsonDraft(event.target.value);
            setJsonError(null);
          }}
        />
        {jsonError && <p className="mt-1.5 text-[11px] text-danger">{jsonError}</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={applyJson}>
            <Check size={13} /> Apply JSON
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setShowJson(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">Quiz content builder</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-[11px] font-semibold text-gold-text hover:underline"
            onClick={resetToTemplate}
            title="Reset question fields to default template"
          >
            <RotateCcw size={11} className="mr-1 inline" /> Reset template
          </button>
          <button
            type="button"
            className="btn-ghost px-2.5 py-1 text-[11px]"
            onClick={() => setShowJson(true)}
          >
            <Code2 size={13} /> Edit as JSON
          </button>
        </div>
      </div>

      {type === 'MULTIPLE_CHOICE' && (
        <MultipleChoiceBuilder
          payload={payload}
          disabled={disabled}
          onChange={emit}
        />
      )}

      {type === 'CODE_ORDER' && (
        <CodeOrderBuilder
          payload={payload}
          disabled={disabled}
          onChange={emit}
        />
      )}

      {type === 'DRAG_DROP' && (
        <DragDropBuilder
          payload={payload}
          disabled={disabled}
          onChange={emit}
        />
      )}
    </div>
  );
}

function MultipleChoiceBuilder({ payload, onChange, disabled }) {
  const questions = Array.isArray(payload?.questions) && payload.questions.length > 0
    ? payload.questions
    : [
        {
          id: 'q1',
          prompt: '',
          options: ['', ''],
          correctIndex: 0,
          explanation: '',
        },
      ];

  const updateQuestion = (index, patch) => {
    const updated = questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
    onChange({ ...payload, questions: updated });
  };

  const addQuestion = () => {
    const nextId = `q${questions.length + 1}`;
    onChange({
      ...payload,
      questions: [
        ...questions,
        {
          id: nextId,
          prompt: '',
          options: ['', ''],
          correctIndex: 0,
          explanation: '',
        },
      ],
    });
  };

  const removeQuestion = (index) => {
    if (questions.length <= 1) return;
    onChange({
      ...payload,
      questions: questions.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      {questions.map((question, qIndex) => {
        const options = Array.isArray(question.options) ? question.options : ['', ''];

        const setOption = (optIndex, value) => {
          const nextOptions = options.map((opt, i) => (i === optIndex ? value : opt));
          updateQuestion(qIndex, { options: nextOptions });
        };

        const addOption = () => {
          if (options.length >= 6) return;
          updateQuestion(qIndex, { options: [...options, ''] });
        };

        const removeOption = (optIndex) => {
          if (options.length <= 2) return;
          const nextOptions = options.filter((_, i) => i !== optIndex);
          const nextCorrect =
            question.correctIndex === optIndex
              ? 0
              : question.correctIndex > optIndex
                ? question.correctIndex - 1
                : question.correctIndex;
          updateQuestion(qIndex, { options: nextOptions, correctIndex: nextCorrect });
        };

        return (
          <div
            key={question.id || qIndex}
            className="rounded-xl border border-line bg-card/60 p-4 transition-colors"
          >
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-arcane-text">
                Question {qIndex + 1}
              </span>
              {questions.length > 1 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeQuestion(qIndex)}
                  className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                  title="Remove this question"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div className="mt-2">
              <label className="label">Question prompt</label>
              <input
                type="text"
                disabled={disabled}
                required
                className="field"
                placeholder="e.g. Which React hook manages local component state?"
                value={question.prompt || ''}
                onChange={(e) => updateQuestion(qIndex, { prompt: e.target.value })}
              />
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label className="label mb-1">
                  Options · <span className="text-fg-subtle font-normal">Select the radio button for the correct answer</span>
                </label>
                {options.length < 6 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={addOption}
                    className="mb-1 text-[11px] font-semibold text-gold-text hover:underline"
                  >
                    + Add option
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {options.map((option, optIndex) => {
                  const isCorrect = question.correctIndex === optIndex;
                  return (
                    <div key={optIndex} className="flex items-center gap-2">
                      <label
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                          isCorrect
                            ? 'border-success/40 bg-success/15 font-semibold text-success'
                            : 'border-line bg-muted/40 text-fg-muted hover:border-line-strong'
                        }`}
                        title="Mark as correct answer"
                      >
                        <input
                          type="radio"
                          name={`correct-${qIndex}`}
                          checked={isCorrect}
                          disabled={disabled}
                          onChange={() => updateQuestion(qIndex, { correctIndex: optIndex })}
                          className="h-3.5 w-3.5 text-success accent-success"
                        />
                        <span>{String.fromCharCode(65 + optIndex)}</span>
                      </label>

                      <input
                        type="text"
                        disabled={disabled}
                        required
                        className="field flex-1"
                        placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                        value={option}
                        onChange={(e) => setOption(optIndex, e.target.value)}
                      />

                      {options.length > 2 && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeOption(optIndex)}
                          className="rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                          title="Remove option"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <label className="label">
                Explanation · <span className="text-fg-subtle font-normal">Revealed to student after submission</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                className="field text-xs"
                placeholder="e.g. useState returns the state variable and an updater function."
                value={question.explanation || ''}
                onChange={(e) => updateQuestion(qIndex, { explanation: e.target.value })}
              />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        disabled={disabled}
        onClick={addQuestion}
        className="btn-ghost flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold"
      >
        <Plus size={14} /> Add another question
      </button>
    </div>
  );
}

function CodeOrderBuilder({ payload, onChange, disabled }) {
  const prompt = payload?.prompt || '';
  const lines = Array.isArray(payload?.lines) && payload.lines.length > 0
    ? payload.lines
    : ['', '', ''];
  const explanation = payload?.explanation || '';

  const updateLine = (index, value) => {
    const updated = lines.map((l, i) => (i === index ? value : l));
    onChange({ ...payload, lines: updated });
  };

  const addLine = () => {
    onChange({ ...payload, lines: [...lines, ''] });
  };

  const removeLine = (index) => {
    if (lines.length <= 2) return;
    onChange({ ...payload, lines: lines.filter((_, i) => i !== index) });
  };

  const moveLine = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...payload, lines: next });
  };

  return (
    <div className="rounded-xl border border-line bg-card/60 p-4 space-y-3.5">
      <div>
        <label className="label">Instructions / Prompt</label>
        <input
          type="text"
          disabled={disabled}
          required
          className="field"
          placeholder="e.g. Order these statements so the fetch call handles errors correctly."
          value={prompt}
          onChange={(e) => onChange({ ...payload, prompt: e.target.value })}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label mb-0">
            Code lines · <span className="text-fg-subtle font-normal">Enter lines in their CORRECT order</span>
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={addLine}
            className="text-[11px] font-semibold text-gold-text hover:underline"
          >
            + Add line
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-muted/60 font-mono text-[11px] font-bold text-fg-muted">
                {index + 1}
              </span>
              <input
                type="text"
                disabled={disabled}
                required
                className="field flex-1 font-mono text-xs leading-relaxed"
                placeholder={`Line ${index + 1}`}
                value={line}
                onChange={(e) => updateLine(index, e.target.value)}
              />
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveLine(index, -1)}
                  className="rounded p-1 text-fg-subtle hover:bg-muted hover:text-foreground disabled:opacity-30"
                  title="Move line up"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === lines.length - 1}
                  onClick={() => moveLine(index, 1)}
                  className="rounded p-1 text-fg-subtle hover:bg-muted hover:text-foreground disabled:opacity-30"
                  title="Move line down"
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              {lines.length > 2 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeLine(index)}
                  className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                  title="Remove line"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">
          Explanation · <span className="text-fg-subtle font-normal">Revealed after quiz completion</span>
        </label>
        <input
          type="text"
          disabled={disabled}
          className="field text-xs"
          placeholder="e.g. Check response.ok before attempting to parse response.json()."
          value={explanation}
          onChange={(e) => onChange({ ...payload, explanation: e.target.value })}
        />
      </div>
    </div>
  );
}

function DragDropBuilder({ payload, onChange, disabled }) {
  const prompt = payload?.prompt || '';
  const pairs = Array.isArray(payload?.pairs) && payload.pairs.length > 0
    ? payload.pairs
    : [
        { left: '', right: '' },
        { left: '', right: '' },
      ];

  const updatePair = (index, patch) => {
    const updated = pairs.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ ...payload, pairs: updated });
  };

  const addPair = () => {
    onChange({ ...payload, pairs: [...pairs, { left: '', right: '' }] });
  };

  const removePair = (index) => {
    if (pairs.length <= 2) return;
    onChange({ ...payload, pairs: pairs.filter((_, i) => i !== index) });
  };

  return (
    <div className="rounded-xl border border-line bg-card/60 p-4 space-y-3.5">
      <div>
        <label className="label">Instructions / Prompt</label>
        <input
          type="text"
          disabled={disabled}
          required
          className="field"
          placeholder="e.g. Match each CSS layout property to its description."
          value={prompt}
          onChange={(e) => onChange({ ...payload, prompt: e.target.value })}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label mb-0">
            Matching pairs · <span className="text-fg-subtle font-normal">Learner matches left tile into right slot</span>
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={addPair}
            className="text-[11px] font-semibold text-gold-text hover:underline"
          >
            + Add pair
          </button>
        </div>

        <div className="space-y-2">
          {pairs.map((pair, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted/60 text-[10px] font-bold text-fg-subtle">
                {index + 1}
              </span>
              <input
                type="text"
                disabled={disabled}
                required
                className="field flex-1 text-xs"
                placeholder="Left tile (e.g. display: grid)"
                value={pair.left || ''}
                onChange={(e) => updatePair(index, { left: e.target.value })}
              />
              <span className="text-xs text-fg-subtle font-mono">⇄</span>
              <input
                type="text"
                disabled={disabled}
                required
                className="field flex-1 text-xs"
                placeholder="Right slot (e.g. Two-dimensional layout)"
                value={pair.right || ''}
                onChange={(e) => updatePair(index, { right: e.target.value })}
              />
              {pairs.length > 2 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removePair(index)}
                  className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                  title="Remove pair"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
