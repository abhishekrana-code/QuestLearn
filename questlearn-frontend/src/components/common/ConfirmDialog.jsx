import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';

/**
 * A small confirmation dialog for destructive actions.
 *
 * <p>Kept generic so callers only supply words: the button stays disabled while
 * the action runs, and an error from the server is shown in place instead of
 * closing the dialog and pretending it worked.</p>
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  error = null,
  onConfirm,
  onClose,
}) {
  const dialogRef = useRef(null);

  // Escape closes unless the action is already running; focus stays inside and
  // comes back to the button that opened the dialog.
  useDialogFocus(dialogRef, { onEscape: () => !busy && onClose() });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close the dialog"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 cursor-default scrim"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised relative flex max-h-full w-full max-w-md flex-col overflow-hidden shadow-raised"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-danger/30 bg-danger/[0.12] text-danger">
            <AlertTriangle size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-danger">
              Please confirm
            </p>
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-foreground">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg border border-line bg-muted/60 p-1.5 text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground disabled:opacity-50"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <p id="confirm-dialog-message" className="text-xs leading-relaxed text-fg-muted">
            {message}
          </p>
          {error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-xs leading-relaxed text-danger"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-muted/40 px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            autoFocus
            className="btn-ghost text-xs"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-danger text-xs">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
