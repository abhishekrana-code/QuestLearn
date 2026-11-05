import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Flame, Sparkles, Sword, Trophy } from 'lucide-react';
import { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

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
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-10 lg:grid-cols-[1.05fr_1fr] lg:px-8">
      <motion.section
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:block"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold/15 text-gold shadow-glow">
            <Sword size={22} />
          </span>
          <span className="font-display text-2xl font-bold tracking-wide text-slate-50">
            Quest<span className="text-gold">Learn</span>
          </span>
        </div>

        <h1 className="mt-8 font-display text-4xl font-bold leading-tight text-slate-50">
          Turn your curriculum into a{' '}
          <span className="bg-gradient-to-r from-gold via-gold-soft to-rune bg-clip-text text-transparent">
            playable skill tree
          </span>
          .
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
          QuestLearn replaces flat module lists with interconnected nodes. Clear a node, earn XP,
          unlock the next branch, and keep your streak alive — all backed by a secured Spring Boot
          API.
        </p>

        <ul className="mt-8 space-y-3">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-slate-300">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-gold">
                <Icon size={15} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="panel-raised mx-auto w-full max-w-md p-7"
      >
        <div className="lg:hidden">
          <span className="font-display text-xl font-bold text-slate-50">
            Quest<span className="text-gold">Learn</span>
          </span>
        </div>

        <h2 className="mt-2 font-display text-2xl font-bold text-slate-50">Resume your quest</h2>
        <p className="mt-1 text-sm text-slate-400">Sign in to keep your XP and streak moving.</p>

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
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          demo accounts
          <span className="h-px flex-1 bg-white/10" />
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

        <p className="mt-5 text-center text-xs text-slate-400">
          New here?{' '}
          <Link to="/register" className="font-semibold text-gold hover:underline">
            Create an account
          </Link>
        </p>
      </motion.section>
    </div>
  );
}
