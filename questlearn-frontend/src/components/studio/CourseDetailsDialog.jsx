import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, PencilLine, Save, X } from 'lucide-react';
import api, { apiError } from '../../services/api.js';

/**
 * Edit the details a course owns: title, description, category and emoji.
 *
 * <p>Nodes, quizzes and videos each have their own editors, so this dialog stays
 * small on purpose. A teacher fixing a typo in a course description should not
 * have to walk through the whole studio to do it.</p>
 */
export default function CourseDetailsDialog({ course, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: course.title ?? '',
    description: course.description ?? '',
    category: course.category ?? '',
    emoji: course.emoji || '🗺️',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const canSave = form.title.trim().length > 0 && !saving;

  const save = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put(`/courses/${course.id}`, {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        emoji: form.emoji.trim() || '🗺️',
      });
      onSaved?.(data);
    } catch (saveError) {
      setError(apiError(saveError, 'Could not save this course.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close the course editor"
        onClick={onClose}
        className="absolute inset-0 cursor-default scrim"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-editor-title"
        initial={{ opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised relative flex max-h-full w-full max-w-lg flex-col overflow-hidden shadow-raised"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg border border-gold/30 bg-gold/[0.12] text-gold-text">
            <PencilLine size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-text">
              Course details
            </p>
            <h2 id="course-editor-title" className="truncate text-sm font-semibold text-foreground">
              {course.title}
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
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            <div>
              <label className="label" htmlFor="course-edit-title">
                Title
              </label>
              <input
                id="course-edit-title"
                required
                maxLength={160}
                className="field"
                value={form.title}
                onChange={(event) => set({ title: event.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="course-edit-description">
                Description
              </label>
              <textarea
                id="course-edit-description"
                rows={3}
                maxLength={1200}
                className="field resize-none"
                placeholder="What will students conquer?"
                value={form.description}
                onChange={(event) => set({ description: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-[1fr_84px] gap-3">
              <div>
                <label className="label" htmlFor="course-edit-category">
                  Category
                </label>
                <input
                  id="course-edit-category"
                  maxLength={60}
                  className="field"
                  placeholder="Computer Science"
                  value={form.category}
                  onChange={(event) => set({ category: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="course-edit-emoji">
                  Emoji
                </label>
                <input
                  id="course-edit-emoji"
                  maxLength={4}
                  className="field text-center"
                  value={form.emoji}
                  onChange={(event) => set({ emoji: event.target.value })}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-xs leading-relaxed text-danger">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {error}
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
