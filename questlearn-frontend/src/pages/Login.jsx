import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Flame, Sparkles, Sword, Trophy } from 'lucide-react';
import { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';

const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'student@questlearn.dev', password: 'password123' },
  { label: 'Instructor', email: 'instructor@questlearn.dev', password: 'password123' },
  { label: 'Admin', email: 'admin@questlearn.dev', password: 'password123' },
];

const HIGHLIGHTS = [
  { icon: Sword, text: 'Branching skill trees instead of static module lists' },
  { icon: Sparkles, text: 'Server-scored micro-quizzes with instant XP feedback' },
  { icon: Flame, text: 'Daily streaks and level-ups that actually feel earned' },
  { icon: Trophy, text: 'A leaderboard that rewards consistency, not cramming' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
    <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-14 px-4 py-12 lg:grid-cols-[1.05fr_1fr] lg:px-8">
      <div className="absolute right-4 top-5 sm:right-8">
        <ThemeToggle />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:block"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold/25 bg-gold/[0.12] text-gold">
            <Sword size={19} />
          </span>
          <span className="leading-none">
            <span className="block font-display text-xl font-extrabold tracking-[-0.045em] text-foreground">
              Quest<span className="text-gold-text">Learn</span>
            </span>
            <span className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.19em] text-fg-subtle">
              Playable curriculum
            </span>
          </span>
        </div>

        <h1 className="mt-10 max-w-xl font-display text-[2.6rem] font-bold leading-[1.08] tracking-[-0.035em] text-foreground">
          Turn your curriculum into a{' '}
          <span className="text-gold-text">playable skill tree</span>.
        </h1>
        <p className="mt-5 max-w-lg text-sm leading-7 text-fg-muted">
          QuestLearn replaces flat module lists with interconnected nodes. Clear a node, earn XP,
          unlock the next branch, and keep your streak alive — all backed by a secured Spring Boot
          API.
        </p>

        <div className="mt-9 grid gap-2.5">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 rounded-xl border border-line bg-card/60 px-3.5 py-2.5"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/20 bg-gold/[0.09] text-gold">
                <Icon size={15} />
              </span>
              <span className="text-[13px] font-medium text-foreground/85">{text}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised mx-auto w-full max-w-md p-7"
      >
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold/25 bg-gold/[0.12] text-gold">
            <Sword size={17} />
          </span>
          <span className="font-display text-lg font-extrabold tracking-[-0.045em] text-foreground">
            Quest<span className="text-gold">Learn</span>
          </span>
        </div>

        <p className="eyebrow">Sign in</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.03em] text-foreground">
          Resume your quest
        </h2>
        <p className="mt-1.5 text-sm text-fg-muted">Sign in to keep your XP and streak moving.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
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
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="field"
              placeholder="••••••••"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          <span className="h-px flex-1 bg-line" />
          demo accounts
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.label}
              type="button"
              disabled={busy}
              onClick={() => {
                setForm({ email: account.email, password: account.password });
                signIn(account.email, account.password);
              }}
              className="btn-ghost px-2 py-2 text-xs"
            >
              {account.label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-fg-muted">
          New here?{' '}
          <Link to="/register" className="font-semibold text-gold-text hover:underline">
            Create an account
          </Link>
        </p>
      </motion.section>
    </div>
  );
}
