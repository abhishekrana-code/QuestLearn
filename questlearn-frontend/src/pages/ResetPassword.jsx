import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import AuthShell from '../components/auth/AuthShell.jsx';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password-reset/confirm', { token, password: form.password });
      setDone(true);
    } catch (confirmError) {
      setError(
        apiError(confirmError, 'That reset link could not be used. Request a new one and try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised p-6 sm:p-8"
      >
        <p className="eyebrow">Account recovery</p>
        <h2 className="mt-3 font-display text-[27px] font-semibold leading-tight tracking-[-0.04em] text-foreground">
          {done ? 'Password updated' : 'Choose a new password'}
        </h2>

        {!token && !done && (
          <>
            <p className="mt-2 text-[13px] leading-6 text-fg-muted">
              This page needs the link from your reset email. Request a fresh one and open it from
              your inbox.
            </p>
            <Link to="/forgot-password" className="btn-primary mt-6 h-11 w-full text-[14px]">
              Request a reset link
              <ArrowRight size={15} />
            </Link>
          </>
        )}

        {done && (
          <>
            <p className="mt-2 flex items-start gap-2 text-[13px] leading-6 text-fg-muted">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
              Your password has been changed and other sessions were signed out. Sign in with the
              new password to carry on.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="btn-primary mt-6 h-11 w-full text-[14px]"
            >
              Go to sign in
              <ArrowRight size={15} />
            </button>
          </>
        )}

        {token && !done && (
          <>
            <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
              This link works once and expires 30 minutes after it was sent.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="password">
                  New password
                </label>
                <div className="relative">
                  <KeyRound
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                  />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="field pl-9 pr-11"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="confirm">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="field"
                  placeholder="Type it again"
                  value={form.confirm}
                  onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                />
              </div>

              {error && (
                <p className="rounded-xl border border-danger/25 bg-danger/[0.07] px-3.5 py-2.5 text-[12px] leading-5 text-danger">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary h-11 w-full text-[14px]">
                {busy ? 'Updating…' : 'Set new password'}
                {!busy && <ArrowRight size={15} />}
              </button>
            </form>

            <Link
              to="/forgot-password"
              className="mt-5 inline-block text-[12px] font-semibold text-fg-muted transition-colors hover:text-foreground"
            >
              Need a new link?
            </Link>
          </>
        )}
      </motion.section>
    </AuthShell>
  );
}
