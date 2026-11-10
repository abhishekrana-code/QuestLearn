import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, GraduationCap, Compass, Sword } from 'lucide-react';
import { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';

const ROLES = [
  {
    value: 'STUDENT',
    label: 'Student',
    description: 'Play skill trees, earn XP, keep streaks.',
    icon: Compass,
  },
  {
    value: 'INSTRUCTOR',
    label: 'Instructor',
    description: 'Build courses, nodes and JSONB quizzes.',
    icon: GraduationCap,
  },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STUDENT',
    inviteCode: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (registerError) {
      setError(apiError(registerError, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mx-auto grid min-h-screen max-w-md items-center px-4 py-12">
      <div className="absolute right-4 top-5">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel-raised w-full p-7"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold/25 bg-gold/[0.12] text-gold">
            <Sword size={17} />
          </span>
          <span className="leading-none">
            <span className="block font-display text-lg font-extrabold tracking-[-0.045em] text-foreground">
              Quest<span className="text-gold">Learn</span>
            </span>
            <span className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.19em] text-fg-subtle">
              Playable curriculum
            </span>
          </span>
        </div>

        <p className="eyebrow">Create account</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.03em] text-foreground">
          Start a new quest
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          Students need the institution code from their teacher. Instructor accounts need an
          invite code from an admin.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Display name
            </label>
            <input
              id="name"
              required
              className="field"
              placeholder="Leo the Learner"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={6}
              className="field"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>

          <div>
            <span className="label">Role</span>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(({ value, label, description, icon: Icon }) => {
                const active = form.role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, role: value })}
                    aria-pressed={active}
                    className={`relative rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-gold/60 bg-card ring-1 ring-inset ring-gold/25'
                        : 'border-line bg-card/60 hover:border-line-strong'
                    }`}
                  >
                    {active && (
                      <Check
                        size={13}
                        strokeWidth={3}
                        className="absolute right-2.5 top-2.5 text-gold"
                      />
                    )}
                    <Icon size={16} className={active ? 'text-gold' : 'text-fg-subtle'} />
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        active ? 'text-foreground' : 'text-fg-muted'
                      }`}
                    >
                      {label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="inviteCode">
              {form.role === 'INSTRUCTOR' ? 'Instructor invite code' : 'Institution code'}
            </label>
            <input
              id="inviteCode"
              className="field"
              placeholder={
                form.role === 'INSTRUCTOR'
                  ? 'Ask your admin for this code'
                  : 'Ask your teacher for this code'
              }
              value={form.inviteCode}
              onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
            />
            <p className="mt-1 text-[11px] text-fg-subtle">
              {form.role === 'INSTRUCTOR'
                ? 'Instructor sign-up is disabled unless the deployment sets an invite code.'
                : 'Left blank on a local install. A class deployment asks for the code your teacher gave you.'}
            </p>
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-fg-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-gold-text hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
