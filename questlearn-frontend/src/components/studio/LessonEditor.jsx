import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Braces, CheckCircle2, Plus, Trash2 } from 'lucide-react';

const EMPTY = { sections: [], keyTakeaways: [] };

const asSections = (data) =>
  (Array.isArray(data?.sections) ? data.sections : []).map((section) => ({
    heading: section?.heading ?? '',
    body: section?.body ?? '',
  }));

const asTakeaways = (data) =>
  (Array.isArray(data?.keyTakeaways) ? data.keyTakeaways : []).map((item) =>
    typeof item === 'string' ? item : String(item ?? ''),
  );

/**
 * The lesson a student actually reads: ordered sections plus a few takeaways.
 *
 * <p>Teachers write prose here instead of typing JSON. The advanced box stays
 * available for pasting a lesson drafted elsewhere, and it is applied only when
 * the JSON parses, so a half-typed brace can never reach the save button.</p>
 */
export default function LessonEditor({ value, onChange, disabled = false }) {
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState(null);

  const sections = asSections(value);
  const takeaways = asTakeaways(value);

  useEffect(() => {
    if (showJson) {
      setJsonDraft(JSON.stringify(value ?? {}, null, 2));
      setJsonError(null);
    }
    // Re-seed only when the JSON box is opened; typing inside it is local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJson]);

  const write = (patch) => onChange({ ...(value ?? EMPTY), ...patch });

  const updateSection = (index, patch) =>
    write({ sections: sections.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  const moveSection = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    write({ sections: next });
  };

  const applyJson = () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonDraft || '{}');
    } catch {
      setJsonError('That is not valid JSON yet. Fix the highlighted braces and try again.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setJsonError('A lesson must be a JSON object, for example { "sections": [] }.');
      return;
    }
    onChange(parsed);
    setJsonError(null);
    setShowJson(false);
  };

  if (showJson) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label mb-0">Lesson content as JSON</span>
          <span className="text-[11px] tabular-nums text-fg-subtle">
            {sections.length} section(s) · {takeaways.length} takeaway(s)
          </span>
        </div>
        <textarea
          rows={14}
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
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={applyJson}>
            Apply JSON
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">Lesson content</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-fg-subtle">
            {sections.length} section(s) · {takeaways.length} takeaway(s)
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-text hover:underline"
            onClick={() => setShowJson(true)}
          >
            <Braces size={12} /> Edit as JSON
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sections.length === 0 && (
          <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-[11px] leading-relaxed text-fg-subtle">
            No sections yet. A lesson usually has two or three: the idea, a worked example, then a
            gotcha.
          </p>
        )}

        {sections.map((section, index) => (
          <div
            key={index}
            className="rounded-lg border border-line bg-card/60 p-3 transition-colors duration-150 hover:border-line-strong"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-fg-subtle">
                {index + 1}
              </span>
              <input
                className="field flex-1 py-1.5 text-[13px]"
                placeholder="Section heading — e.g. How flex lays out a row"
                maxLength={120}
                disabled={disabled}
                value={section.heading}
                onChange={(event) => updateSection(index, { heading: event.target.value })}
              />
              <button
                type="button"
                aria-label={`Move section ${index + 1} up`}
                title="Move up"
                disabled={disabled || index === 0}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                onClick={() => moveSection(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`Move section ${index + 1} down`}
                title="Move down"
                disabled={disabled || index === sections.length - 1}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                onClick={() => moveSection(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                aria-label={`Remove section ${index + 1}`}
                title="Remove section"
                disabled={disabled}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                onClick={() => write({ sections: sections.filter((_, i) => i !== index) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              rows={3}
              className="field mt-2 resize-y text-[13px] leading-relaxed"
              placeholder="What the student should read here. Leave a blank line between paragraphs."
              maxLength={4000}
              disabled={disabled}
              value={section.body}
              onChange={(event) => updateSection(index, { body: event.target.value })}
            />
          </div>
        ))}

        <button
          type="button"
          disabled={disabled}
          className="btn-ghost w-full px-3 py-2 text-xs"
          onClick={() => write({ sections: [...sections, { heading: '', body: '' }] })}
        >
          <Plus size={13} /> Add a section
        </button>
      </div>

      <div>
        <span className="label mb-1.5 block">Key takeaways</span>
        <div className="space-y-1.5">
          {takeaways.map((takeaway, index) => (
            <div key={index} className="flex items-center gap-2">
              <CheckCircle2 size={14} className="shrink-0 text-gold-text" />
              <input
                className="field flex-1 py-1.5 text-[13px]"
                placeholder="One thing they should remember"
                maxLength={300}
                disabled={disabled}
                value={takeaway}
                onChange={(event) =>
                  write({
                    keyTakeaways: takeaways.map((item, i) =>
                      i === index ? event.target.value : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove takeaway ${index + 1}`}
                title="Remove takeaway"
                disabled={disabled}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                onClick={() => write({ keyTakeaways: takeaways.filter((_, i) => i !== index) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            className="text-[11px] font-semibold text-gold-text hover:underline"
            onClick={() => write({ keyTakeaways: [...takeaways, ''] })}
          >
            + Add a takeaway
          </button>
        </div>
      </div>
    </div>
  );
}
