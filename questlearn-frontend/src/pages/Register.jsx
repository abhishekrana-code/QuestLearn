import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, Compass } from 'lucide-react';
import { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

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
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel-raised w-full p-7"
      >
        <span className="font-display text-xl font-bold text-slate-50">
          Quest<span className="text-gold">Learn</span>
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-slate-50">Start a new quest</h1>
        <p className="mt-1 text-sm text-slate-400">
          Student sign-up is open. Instructor accounts need an invite code from your admin.
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
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-gold/60 bg-gold/10 text-gold-soft'
                        : 'border-white/10 bg-ink-900/60 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <Icon size={16} className={active ? 'text-gold' : 'text-slate-400'} />
                    <p className="mt-2 text-sm font-semibold">{label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {form.role === 'INSTRUCTOR' && (
            <div>
              <label className="label" htmlFor="inviteCode">
                Instructor invite code
              </label>
              <input
                id="inviteCode"
                required
                className="field"
                placeholder="Ask your admin for this code"
                value={form.inviteCode}
                onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Instructor sign-up is disabled unless the deployment sets an invite code.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
