import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Flame, Route, Sparkles, Trophy } from 'lucide-react';
import { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/auth/AuthShell.jsx';

const HIGHLIGHTS = [
  { icon: Route, text: 'Skill trees that show the next step' },
  { icon: Sparkles, text: 'Instant quiz feedback and XP' },
  { icon: Flame, text: 'Streaks that reward small sessions' },
  { icon: Trophy, text: 'A leaderboard built on consistency' },
];

function LoginAside() {
  return (
    <div className="max-w-[520px]">
      <p className="eyebrow">Your learning space</p>
      <h1 className="mt-4 font-display text-[clamp(2.4rem,4.6vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-foreground">
        Pick up where
        <br />
        you left off.
      </h1>
      <p className="mt-4 max-w-md text-[14px] leading-7 text-fg-muted">
        Your course is exactly where you left it. Open the next node, keep the streak alive, and
        finish something today.
      </p>

      <div className="mt-8 rounded-[20px] border border-line bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-foreground">Your week</p>
          <span className="chip text-gold-text">Level 5</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Streak', value: '7d' },
            { label: 'Total XP', value: '1,240' },
            { label: 'Nodes', value: '12' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-line bg-background/60 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                {stat.label}
              </p>
              <p className="mt-1 font-display text-lg font-semibold tracking-[-0.04em] text-foreground">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {[
            { title: 'Foundations of behaviour', state: 'done' },
            { title: 'Memory and attention', state: 'active' },
            { title: 'Learning and conditioning', state: 'locked' },
          ].map((node) => (
            <div
              key={node.title}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                node.state === 'active'
                  ? 'border-gold/30 bg-brand-tint/70'
                  : 'border-line bg-background/40'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  node.state === 'done'
                    ? 'bg-success'
                    : node.state === 'active'
                      ? 'bg-gold'
                      : 'bg-line-strong'
                }`}
              />
              <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {node.title}
              </p>
              <span className="text-[9px] font-semibold text-fg-subtle">
                {node.state === 'done' ? 'Cleared' : node.state === 'active' ? 'Next' : 'Locked'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
        {HIGHLIGHTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-[12px] text-fg-muted">
            <Icon size={14} className="mt-0.5 shrink-0 text-gold-text" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const signIn = async (email, password) => {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (loginError) {
      setError(apiError(loginError, 'Could not sign you in.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await signIn(form.email, form.password);
  };

  return (
    <AuthShell aside={<LoginAside />}>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised p-6 sm:p-8"
      >
        <p className="eyebrow">Sign in</p>
        <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.04em] text-foreground">
          Welcome back
        </h2>
        <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
          Use your school account to pick up where you left off.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              className="field"
              placeholder="you@questlearn.dev"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="field pr-11"
                placeholder="Enter your password"
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

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-[11.5px] font-semibold text-fg-muted transition-colors hover:text-foreground"
            >
              Forgot your password?
            </Link>
          </div>

          {error && (
            <p className="rounded-xl border border-danger/25 bg-danger/[0.07] px-3.5 py-2.5 text-[12px] leading-5 text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary h-11 w-full text-[14px]">
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-fg-muted">
          New here?{' '}
          <Link to="/register" className="font-semibold text-gold-text hover:underline">
            Create an account
          </Link>
        </p>
      </motion.section>
    </AuthShell>
  );
}
