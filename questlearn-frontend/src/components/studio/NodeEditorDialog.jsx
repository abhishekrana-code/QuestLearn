import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import api, { apiError } from '../../services/api.js';
import { EMPTY_LESSON, lessonPayload } from '../../services/lesson.js';
import LessonEditor from './LessonEditor.jsx';

/**
 * Edit a node that already exists: its title, summary, lesson and XP reward.
 *
 * <p>The lesson itself is loaded on open rather than taken from the tree, which
 * only carries the summary. The node's video is left alone - the upload panel
 * owns it, and the API carries it across a lesson save.</p>
 */
export default function NodeEditorDialog({ node, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/modules/${node.id}`)
      .then(({ data }) => {
        if (cancelled) return;
        setForm({
          title: data.title ?? '',
          summary: data.summary ?? '',
          xpReward: data.xpReward ?? 100,
          content: data.content ?? EMPTY_LESSON,
        });
      })
      .catch((loadError) => {
        if (!cancelled) setError(apiError(loadError, 'Could not open this node.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  // Escape closes, and the page behind the dialog must not scroll.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const save = async (event) => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put(`/modules/${node.id}`, {
        title: form.title.trim(),
        summary: form.summary.trim(),
        xpReward: Number(form.xpReward),
        content: lessonPayload(form.content),
      });
      onSaved?.(data);
    } catch (saveError) {
      setError(apiError(saveError, 'Could not save this node.'));
    } finally {
      setSaving(false);
    }
  };

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const canSave = Boolean(form && form.title.trim().length > 0) && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close the node editor"
        onClick={onClose}
        className="absolute inset-0 cursor-default scrim"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-editor-title"
        initial={{ opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden shadow-raised"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg border border-gold/30 bg-gold/[0.12] text-gold-text">
            <Save size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-text">
              Edit node
            </p>
            <h2 id="node-editor-title" className="truncate text-sm font-semibold text-foreground">
              {node.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-line bg-muted/60 p-1.5 text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-fg-muted">
                <Loader2 size={14} className="animate-spin" /> Opening the node…
              </div>
            ) : !form ? (
              <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-xs leading-relaxed text-danger">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {error ?? 'This node could not be loaded.'}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="edit-node-title">
                    Node title
                  </label>
                  <input
                    id="edit-node-title"
                    required
                    maxLength={160}
                    className="field"
                    value={form.title}
                    onChange={(event) => set({ title: event.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <div>
                    <label className="label" htmlFor="edit-node-summary">
                      Summary
                    </label>
                    <input
                      id="edit-node-summary"
                      maxLength={800}
                      className="field"
                      placeholder="One line shown on the skill tree"
                      value={form.summary}
                      onChange={(event) => set({ summary: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-node-xp">
                      XP reward
                    </label>
                    <input
                      id="edit-node-xp"
                      type="number"
                      min={0}
                      max={5000}
                      className="field"
                      value={form.xpReward}
                      onChange={(event) => set({ xpReward: event.target.value })}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-muted/30 p-3">
                  <LessonEditor
                    value={form.content}
                    onChange={(content) => set({ content })}
                    disabled={saving}
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-xs leading-relaxed text-danger">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-muted/40 px-4 py-2.5 sm:px-5">
            <button type="button" onClick={onClose} className="btn-ghost text-xs">
              Cancel
            </button>
            <button type="submit" disabled={!canSave} className="btn-primary text-xs">
              <Save size={14} /> Save changes
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
