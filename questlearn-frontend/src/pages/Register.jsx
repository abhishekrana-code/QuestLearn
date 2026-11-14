import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Compass,
  Eye,
  EyeOff,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/auth/AuthShell.jsx';

const ROLES = [
  {
    value: 'STUDENT',
    label: 'Student',
    description: 'Follow a course, take quizzes, earn XP.',
    icon: Compass,
  },
  {
    value: 'INSTRUCTOR',
    label: 'Instructor',
    description: 'Build courses, nodes, and assessments.',
    icon: GraduationCap,
  },
];

const BENEFITS = [
  'One dashboard that shows the next step',
  'Quizzes scored on the server, not the browser',
  'Progress and streaks you can trust',
];

function RegisterAside() {
  return (
    <div className="max-w-[520px]">
      <p className="eyebrow">Getting started</p>
      <h1 className="mt-4 font-display text-[clamp(2.35rem,4.5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-foreground">
        Start with one
        <br />
        clear next step.
      </h1>
      <p className="mt-4 max-w-md text-[14px] leading-7 text-fg-muted">
        Students join a class with a code. Instructors join with an invite from an admin. Either way,
        your first screen is a path, not an empty dashboard.
      </p>

      <div className="mt-8 rounded-[20px] border border-line bg-card p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-gold-text">
            <Sparkles size={16} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-foreground">What you get on day one</p>
            <p className="text-[10px] text-fg-subtle">No setup, no empty state</p>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-[12px] leading-5 text-fg-muted">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/12 text-success">
                <Check size={10} strokeWidth={3} />
              </span>
              {benefit}
            </li>
          ))}
        </ul>

        <div className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            <Compass size={14} className="text-gold-text" />
            Student paths
          </div>
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            <GraduationCap size={14} className="text-gold-text" />
            Instructor studio
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-background/50 p-3.5">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
        <p className="text-[11px] leading-5 text-fg-subtle">
          Your account is tied to your institution. Instructors need an invite code from an
          administrator before they can publish a course.
        </p>
      </div>
    </div>
  );
}

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
  const [showPassword, setShowPassword] = useState(false);

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
    <AuthShell aside={<RegisterAside />}>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised p-6 sm:p-8"
      >
        <p className="eyebrow">Create account</p>
        <h2 className="mt-3 font-display text-[27px] font-semibold leading-tight tracking-[-0.04em] text-foreground">
          Join QuestLearn
        </h2>
        <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
          A few details, then you are on your way.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Display name
            </label>
            <div className="relative">
              <UserRound
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                id="name"
                required
                className="field pl-9"
                placeholder="Leo the Learner"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                className="field pr-11"
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
            <span className="label">I am joining as</span>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(({ value, label, description, icon: Icon }) => {
                const active = form.role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, role: value })}
                    aria-pressed={active}
                    className={`relative rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-gold/50 bg-brand-tint/70'
                        : 'border-line bg-background/40 hover:border-line-strong'
                    }`}
                  >
                    {active && (
                      <Check
                        size={12}
                        strokeWidth={3}
                        className="absolute right-2.5 top-2.5 text-gold-text"
                      />
                    )}
                    <Icon size={16} className={active ? 'text-gold-text' : 'text-fg-subtle'} />
                    <p className="mt-2 text-[12px] font-semibold text-foreground">{label}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-fg-subtle">{description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="inviteCode">
              {form.role === 'INSTRUCTOR' ? 'Instructor invite code' : 'Class code'}
              <span className="ml-1 font-normal text-fg-subtle">(optional)</span>
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
            <p className="mt-1.5 text-[10px] leading-4 text-fg-subtle">
              {form.role === 'INSTRUCTOR'
                ? 'Instructor sign-up is disabled unless the deployment sets an invite code.'
                : 'Leave blank on a local install. A class deployment asks for the code your teacher gave you.'}
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-danger/25 bg-danger/[0.07] px-3.5 py-2.5 text-[12px] leading-5 text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary h-11 w-full text-[14px]">
            {busy ? 'Creating account…' : 'Create account'}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-fg-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-gold-text hover:underline">
            Sign in
          </Link>
        </p>
      </motion.section>
    </AuthShell>
  );
}
