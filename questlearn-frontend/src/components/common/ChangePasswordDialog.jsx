import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiError } from '../../services/api.js';

const MIN_LENGTH = 8;

/**
 * Rotates the signed-in user's password.
 *
 * <p>Successful rotation revokes every other session, so the copy says so
 * plainly instead of leaving the user to discover it on their phone.</p>
 */
export default function ChangePasswordDialog({ onClose }) {
  const { changePassword } = useAuth();
  const titleId = useId();
  const hintId = useId();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [visible, setVisible] = useState({ current: false, next: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose]);

  const update = (field) => (event) => setForm((previous) => ({
    ...previous,
    [field]: event.target.value,
  }));

  const validation = (() => {
    if (!form.current) return 'Enter your current password.';
    if (form.next.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
    if (form.next === form.current) return 'The new password must be different.';
    if (form.next !== form.confirm) return 'The two new passwords do not match.';
    return null;
  })();

  const submit = async (event) => {
    event.preventDefault();
    if (validation || busy) return;
    setBusy(true);
    setError(null);
    try {
      await changePassword(form.current, form.next);
      setDone(true);
    } catch (requestError) {
      setError(apiError(requestError, 'Could not change your password.'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close the dialog"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 cursor-default scrim"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised relative flex max-h-full w-full max-w-md flex-col overflow-hidden shadow-raised"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/30 bg-brand-tint text-gold-text">
            {done ? <CheckCircle2 size={15} /> : <KeyRound size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-fg-subtle">
              Account security
            </p>
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              {done ? 'Password updated' : 'Change your password'}
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

        {done ? (
          <>
            <div className="px-4 py-4 sm:px-5">
              <p className="text-xs leading-relaxed text-fg-muted">
                Your password has been changed. Every other device signed in to this account
                has been signed out, and this browser stays signed in.
              </p>
            </div>
            <div className="flex items-center justify-end border-t border-line bg-muted/40 px-4 py-2.5 sm:px-5">
              <button type="button" onClick={onClose} className="btn-primary text-xs">
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              <div>
                <label className="label" htmlFor="current-password">
                  Current password
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    type={visible.current ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    autoFocus
                    className="field pr-11"
                    value={form.current}
                    onChange={update('current')}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((v) => ({ ...v, current: !v.current }))}
                    aria-label={visible.current ? 'Hide current password' : 'Show current password'}
                    className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors hover:text-foreground"
                  >
                    {visible.current ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="new-password">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={visible.next ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={MIN_LENGTH}
                    aria-describedby={hintId}
                    className="field pr-11"
                    value={form.next}
                    onChange={update('next')}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((v) => ({ ...v, next: !v.next }))}
                    aria-label={visible.next ? 'Hide new password' : 'Show new password'}
                    className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors hover:text-foreground"
                  >
                    {visible.next ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p id={hintId} className="mt-1.5 text-[11px] text-fg-subtle">
                  At least {MIN_LENGTH} characters. Other devices will be signed out.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={visible.next ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="field"
                  value={form.confirm}
                  onChange={update('confirm')}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-xs leading-relaxed text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line bg-muted/40 px-4 py-2.5 sm:px-5">
              <p className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
                {form.next && form.confirm && validation ? validation : '\u00A0'}
              </p>
              <button type="button" onClick={onClose} disabled={busy} className="btn-ghost text-xs">
                Cancel
              </button>
              <button
                type="submit"
                disabled={Boolean(validation) || busy}
                className="btn-primary text-xs"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                Save password
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
