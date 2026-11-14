import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, CheckCircle2, MailCheck } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import AuthShell from '../components/auth/AuthShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function VerificationAside() {
  return (
    <div className="max-w-[520px]">
      <p className="eyebrow">One small step</p>
      <h1 className="mt-4 font-display text-[clamp(2.35rem,4.5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-foreground">
        Prove the address
        <br />
        is yours.
      </h1>
      <p className="mt-4 max-w-md text-[14px] leading-7 text-fg-muted">
        Confirming your email is how QuestLearn knows a real person owns the account. It changes
        nothing about your courses, XP or streak — you keep working either way.
      </p>

      <div className="mt-8 rounded-[20px] border border-line bg-card p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-gold-text">
            <MailCheck size={16} />
          </span>
          <p className="text-[12px] font-semibold text-foreground">What confirmation does</p>
        </div>
        <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-fg-muted">
          <li>• Ties the address to the person using the account.</li>
          <li>• Makes password recovery reach the right inbox.</li>
          <li>• Stops the dashboard reminder for good.</li>
        </ul>
      </div>
    </div>
  );
}

export default function VerifyEmail() {
  const { user, refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState(token ? 'verifying' : 'missing');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return undefined;
    // The token is single use, so guard the automatic submit against a repeated
    // effect (React StrictMode in development) burning the link twice. The
    // request is intentionally not cancelled on cleanup: StrictMode runs that
    // cleanup between the two development effect passes, and the first pass is
    // the request that matters.
    started.current = true;

    api
      .post('/auth/verify-email', { token })
      .then(({ data }) => {
        setStatus('done');
        setMessage(data?.message || 'Email confirmed. Your account is fully set up.');
        if (user) {
          refreshProfile().catch(() => {
            /* The banner will clear on the next profile load. */
          });
        }
      })
      .catch((verifyError) => {
        setStatus('error');
        setMessage(
          apiError(
            verifyError,
            'That confirmation link could not be used. Request a new one and try again.',
          ),
        );
      });

    return undefined;
  }, [token, user, refreshProfile]);

  const home = user ? '/' : '/login';
  const homeLabel = user ? 'Go to your dashboard' : 'Go to sign in';

  return (
    <AuthShell aside={<VerificationAside />}>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised p-6 sm:p-8"
      >
        <p className="eyebrow">Email confirmation</p>
        <h2 className="mt-3 font-display text-[27px] font-semibold leading-tight tracking-[-0.04em] text-foreground">
          {status === 'done'
            ? 'Address confirmed'
            : status === 'error'
              ? 'That link did not work'
              : 'Confirm your email'}
        </h2>

        {status === 'missing' && (
          <>
            <p className="mt-2 text-[13px] leading-6 text-fg-muted">
              This page needs the link from your confirmation email. Open that link, or ask for a
              fresh one from the reminder on your dashboard.
            </p>
            <Link to={home} className="btn-primary mt-6 h-11 w-full text-[14px]">
              {homeLabel}
              <ArrowRight size={15} />
            </Link>
          </>
        )}

        {status === 'verifying' && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-background/40 px-4 py-3.5">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-gold" />
            <p className="text-[12px] leading-5 text-fg-muted">Confirming your address…</p>
          </div>
        )}

        {status === 'done' && (
          <>
            <p className="mt-2 flex items-start gap-2 text-[13px] leading-6 text-fg-muted">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
              {message}
            </p>
            <Link to={home} className="btn-primary mt-6 h-11 w-full text-[14px]">
              {homeLabel}
              <ArrowRight size={15} />
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/[0.07] px-3.5 py-2.5 text-[12px] leading-5 text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {message}
            </p>
            <p className="mt-3 text-[12px] leading-5 text-fg-subtle">
              {user
                ? 'Use the reminder on your dashboard to send a fresh link.'
                : 'Sign in, then use the reminder on your dashboard to send a fresh link.'}
            </p>
            <Link to={home} className="btn-primary mt-6 h-11 w-full text-[14px]">
              {homeLabel}
              <ArrowRight size={15} />
            </Link>
          </>
        )}
      </motion.section>
    </AuthShell>
  );
}
