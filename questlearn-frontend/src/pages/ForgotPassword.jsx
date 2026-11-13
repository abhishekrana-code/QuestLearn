import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import AuthShell from '../components/auth/AuthShell.jsx';

function ForgotAside() {
  return (
    <div className="max-w-[520px]">
      <p className="eyebrow">Account recovery</p>
      <h1 className="mt-4 font-display text-[clamp(2.35rem,4.5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-foreground">
        Find your way
        <br />
        back in.
      </h1>
      <p className="mt-4 max-w-md text-[14px] leading-7 text-fg-muted">
        A reset link is all it takes. It expires after 30 minutes and works exactly once, so an old
        email is never a way back into your account.
      </p>

      <div className="mt-8 rounded-[20px] border border-line bg-card p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-gold-text">
            <ShieldCheck size={16} />
          </span>
          <p className="text-[12px] font-semibold text-foreground">What a reset does</p>
        </div>
        <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-fg-muted">
          <li>• Your progress, XP and streak stay exactly as they are.</li>
          <li>• Any other signed-in session is signed out.</li>
          <li>• The link stops working once it has been used.</li>
        </ul>
      </div>
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/password-reset/request', { email });
      setSent(true);
    } catch (requestError) {
      setError(apiError(requestError, 'Could not start the reset. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell aside={<ForgotAside />}>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised p-6 sm:p-8"
      >
        <p className="eyebrow">Forgot password</p>
        <h2 className="mt-3 font-display text-[27px] font-semibold leading-tight tracking-[-0.04em] text-foreground">
          {sent ? 'Check your inbox' : 'Reset your password'}
        </h2>

        {sent ? (
          <>
            <p className="mt-2 text-[13px] leading-6 text-fg-muted">
              If <span className="font-semibold text-foreground">{email}</span> belongs to an
              account, a reset link is on its way. It expires in 30 minutes and can be used once.
            </p>
            <p className="mt-3 text-[12px] leading-5 text-fg-subtle">
              Nothing arrived? Ask your teacher or an administrator to confirm the address on your
              account, then request another link.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={() => setSent(false)} className="btn-ghost h-10 text-xs">
                Use a different email
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="btn-primary h-11 text-[14px]"
              >
                Back to sign in
                <ArrowRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
              Enter the email on your account and we will send a single-use link.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="field pl-9"
                    placeholder="you@questlearn.dev"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-danger/25 bg-danger/[0.07] px-3.5 py-2.5 text-[12px] leading-5 text-danger">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary h-11 w-full text-[14px]">
                {busy ? 'Sending…' : 'Send reset link'}
                {!busy && <ArrowRight size={15} />}
              </button>
            </form>

            <Link
              to="/login"
              className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-fg-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft size={13} />
              Back to sign in
            </Link>
          </>
        )}
      </motion.section>
    </AuthShell>
  );
}
