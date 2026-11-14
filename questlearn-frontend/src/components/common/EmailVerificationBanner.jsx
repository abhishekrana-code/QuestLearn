import { useState } from 'react';
import { MailCheck, Send, X } from 'lucide-react';
import api, { apiError } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * The soft reminder for an unconfirmed address.
 *
 * <p>It appears on the dashboard of a signed-in account that has not opened its
 * confirmation link. Everything else on the page keeps working; this only offers
 * to resend the link or get out of the way.</p>
 */
export default function EmailVerificationBanner({ className = '' }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  if (!user || user.emailVerified !== false || hidden) {
    return null;
  }

  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/verify-email/resend');
      setSent(true);
    } catch (resendError) {
      setError(apiError(resendError, 'Could not resend the confirmation email. Try again shortly.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Email confirmation reminder"
      className={`flex flex-wrap items-start gap-3 rounded-[18px] border border-gold/30 bg-brand-tint/60 px-4 py-3.5 ${className}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-gold-text">
        <MailCheck size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-foreground">Confirm your email address</p>
        <p className="mt-0.5 text-[11px] leading-5 text-fg-muted">
          We sent a link to <span className="font-semibold text-foreground">{user.email}</span>.
          Your courses, XP and streak are unaffected — confirming just proves the address is yours.
        </p>
        {error && <p className="mt-1.5 text-[11px] leading-5 text-danger">{error}</p>}
        {sent && (
          <p className="mt-1.5 text-[11px] font-semibold leading-5 text-success">
            A new link is on its way. It can take a minute to arrive.
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={resend}
          disabled={busy || sent}
          className="btn-ghost h-8 px-3 text-[11px]"
        >
          <Send size={12} />
          {busy ? 'Sending…' : sent ? 'Link sent' : 'Resend link'}
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss email confirmation reminder"
          className="grid h-8 w-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
    </aside>
  );
}
