import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  FileText,
  Flame,
  GraduationCap,
  Lock,
  Menu,
  Mic,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import Logo from '../components/common/Logo.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';

const HIGHLIGHTS = [
  { icon: Route, label: 'Branching skill trees' },
  { icon: Brain, label: 'Micro-quizzes' },
  { icon: Mic, label: 'Spoken assessment' },
  { icon: Trophy, label: 'XP and streaks' },
  { icon: GraduationCap, label: 'Instructor studio' },
  { icon: BarChart3, label: 'Progress reporting' },
];

const FEATURES = [
  {
    icon: Route,
    title: 'A path, not a pile of files',
    body: 'Every course becomes a branching skill tree. Students always know what is open, what is next, and why it matters.',
    note: 'Prerequisites handled for you',
  },
  {
    icon: Target,
    title: 'Practice that answers back',
    body: 'Multiple choice, ordering, drag and drop, and a spoken viva. Answers are scored on the server, so progress means something.',
    note: 'Four assessment formats',
  },
  {
    icon: Zap,
    title: 'Momentum you can measure',
    body: 'XP, levels, streaks, and a leaderboard turn small sessions into a habit without turning the course into a game.',
    note: 'Visible progress every session',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Map the course',
    body: 'An instructor lays out nodes, prerequisites, and rewards in the studio. The same content powers every student path.',
  },
  {
    number: '02',
    title: 'Learn by doing',
    body: 'Students open one node at a time: a short lesson, a real assessment, and immediate feedback before the next branch unlocks.',
  },
  {
    number: '03',
    title: 'See what stuck',
    body: 'Teachers get completion and quiz averages by subject. Students get a clear next step instead of a wall of deadlines.',
  },
];

const TABS = [
  { id: 'tree', label: 'Skill tree', icon: Route },
  { id: 'quiz', label: 'Quizzes', icon: Brain },
  { id: 'viva', label: 'Voice viva', icon: Mic },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

const ROLES = [
  {
    icon: BookOpen,
    label: 'Students',
    body: 'A dashboard that answers one question: what do I do next?',
  },
  {
    icon: GraduationCap,
    label: 'Instructors',
    body: 'Build a course once and publish a path students can actually follow.',
  },
  {
    icon: ShieldCheck,
    label: 'Admins',
    body: 'Manage accounts, courses, and access from one quiet control room.',
  },
];

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-background/85 backdrop-blur-md">
      <div className="shell flex h-16 items-center gap-4">
        <Link to="/" aria-label="QuestLearn home">
          <Logo />
        </Link>

        <nav className="ml-5 hidden items-center gap-1 md:flex" aria-label="Main">
          <a
            href="#product"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-foreground"
          >
            Product
          </a>
          <a
            href="#how"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#roles"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-foreground"
          >
            Who it is for
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/login"
            className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-fg-muted transition-colors hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-foreground px-3.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90 sm:inline-flex"
          >
            Get started
            <ArrowRight size={13} />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-card text-fg-muted transition-colors hover:text-foreground md:hidden"
          >
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="landing-menu" className="border-t border-line bg-background px-5 pb-5 pt-4 md:hidden">
          <nav className="grid gap-1" aria-label="Mobile">
            {[
              { href: '#product', label: 'Product' },
              { href: '#how', label: 'How it works' },
              { href: '#roles', label: 'Who it is for' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-4">
            <ThemeToggle compact />
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 items-center rounded-[10px] border border-line px-3.5 text-[12px] font-semibold text-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-foreground px-3.5 text-[12px] font-semibold text-background"
              >
                Get started
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function HeroVisual() {
  const nodes = [
    { state: 'done', title: 'Cell structure', meta: 'Lesson · 4 min', xp: '+40 XP' },
    { state: 'active', title: 'Membrane transport', meta: 'Quiz · 5 questions', xp: '+60 XP' },
    { state: 'locked', title: 'Energy in the cell', meta: 'Unlocks next', xp: '+80 XP' },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[420px] pb-8 pt-2" aria-hidden="true">
      <div className="absolute inset-4 rounded-[36px] bg-brand-tint blur-2xl" />

      <div className="relative rounded-[24px] border border-line bg-card p-5 shadow-[0_36px_90px_-48px_hsl(var(--shadow-color)/0.5)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-subtle">
              Course in progress
            </p>
            <p className="mt-1 truncate font-display text-[19px] font-semibold tracking-[-0.03em] text-foreground">
              Cell Biology
            </p>
          </div>
          <span className="chip shrink-0 border-transparent bg-brand-tint text-gold-text">62%</span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-gold to-gold-soft" />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-fg-subtle">
          <span>5 of 8 nodes cleared</span>
          <span>+320 XP earned</span>
        </div>

        <div className="relative mt-5">
          <span className="absolute bottom-6 left-[17px] top-6 w-px bg-line" />
          <div className="space-y-2.5">
            {nodes.map((node) => (
              <div
                key={node.title}
                className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  node.state === 'active'
                    ? 'border-gold/35 bg-brand-tint/70'
                    : 'border-line bg-background/40'
                }`}
              >
                <span
                  className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 ${
                    node.state === 'done'
                      ? 'border-gold bg-gold text-white'
                      : node.state === 'active'
                        ? 'border-gold bg-card text-gold-text'
                        : 'border-line bg-muted text-fg-subtle'
                  }`}
                >
                  {node.state === 'done' ? (
                    <Check size={15} strokeWidth={3} />
                  ) : node.state === 'active' ? (
                    <Play size={14} className="ml-0.5" fill="currentColor" />
                  ) : (
                    <Lock size={13} />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-foreground">{node.title}</p>
                  <p className="truncate text-[10px] text-fg-subtle">{node.meta}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold text-fg-muted">{node.xp}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          tabIndex={-1}
          className="btn-primary mt-4 h-10 w-full text-[13px]"
        >
          Continue lesson
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="absolute -bottom-1 -left-3 hidden w-44 rotate-[-2deg] rounded-2xl border border-line bg-card p-3.5 shadow-raised sm:block">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            Quiz score
          </p>
          <Sparkles size={12} className="text-gold" />
        </div>
        <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.05em] text-foreground">
          92<span className="text-sm text-fg-muted">%</span>
        </p>
        <div className="mt-2 flex items-end gap-1">
          {[40, 58, 46, 72, 64, 88, 96].map((height, index) => (
            <span
              key={index}
              className={`w-full rounded-sm ${index > 4 ? 'bg-gold' : 'bg-muted'}`}
              style={{ height: `${height / 3}px` }}
            />
          ))}
        </div>
      </div>

      <div className="absolute -right-2 top-12 hidden items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-card sm:flex">
        <Flame size={13} className="text-warning" />
        7 day streak
      </div>
    </div>
  );
}

function TreePanel() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <h3 className="font-display text-[clamp(1.35rem,2vw,1.7rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground">
          See the whole path before you start.
        </h3>
        <p className="mt-3 text-sm leading-7 text-fg-muted">
          Nodes unlock in order, so a course reads like a route instead of a folder. Students can
          preview the shape of the work without opening a dozen tabs.
        </p>
        <ul className="mt-5 space-y-2.5">
          {[
            'Prerequisites are enforced, not suggested',
            'Every node shows its XP reward up front',
            'Teachers can rearrange the path in the studio',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-foreground/85">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-text" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-background/70 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-foreground">Introduction to Psychology</p>
          <span className="chip">8 nodes</span>
        </div>
        <div className="mt-4 space-y-2">
          {[
            { label: 'Foundations of behaviour', state: 'done' },
            { label: 'Memory and attention', state: 'active' },
            { label: 'Learning and conditioning', state: 'open' },
            { label: 'Research methods', state: 'locked' },
          ].map((node, index) => (
            <div key={node.label} className="flex items-center gap-3">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                  node.state === 'done'
                    ? 'border-gold bg-gold text-white'
                    : node.state === 'active'
                      ? 'border-gold bg-brand-tint text-gold-text ring-4 ring-gold/10'
                      : node.state === 'open'
                        ? 'border-line-strong bg-card text-fg-muted'
                        : 'border-line bg-muted text-fg-subtle'
                }`}
              >
                {node.state === 'done' ? (
                  <Check size={14} strokeWidth={3} />
                ) : node.state === 'locked' ? (
                  <Lock size={12} />
                ) : (
                  <span className="text-[10px] font-bold">{index + 1}</span>
                )}
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2">
                <p className="truncate text-[12px] font-medium text-foreground">{node.label}</p>
              </div>
              <span className="hidden w-12 shrink-0 text-right text-[10px] font-semibold text-fg-subtle sm:block">
                +{40 + index * 20} XP
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuizPanel() {
  const options = [
    { key: 'A', text: 'The nucleus', state: 'idle' },
    { key: 'B', text: 'The mitochondrion', state: 'correct' },
    { key: 'C', text: 'The Golgi apparatus', state: 'wrong' },
  ];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <h3 className="font-display text-[clamp(1.35rem,2vw,1.7rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground">
          Feedback while it still matters.
        </h3>
        <p className="mt-3 text-sm leading-7 text-fg-muted">
          Every answer is scored on the server, then explained. Students can retry a node without
          losing the record of how they improved.
        </p>
        <ul className="mt-5 space-y-2.5">
          {[
            'Multiple choice, code order, and drag and drop',
            'Server-side scoring, not browser trust',
            'Attempt history kept for teachers and students',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-foreground/85">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-text" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-background/70 p-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            Question 3 of 5
          </span>
          <span className="text-[10px] font-semibold text-gold-text">+60 XP</span>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-foreground">
          Which organelle produces most of the cell&apos;s ATP?
        </p>
        <div className="mt-3 space-y-2">
          {options.map((option) => (
            <div
              key={option.key}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px] ${
                option.state === 'correct'
                  ? 'border-success/40 bg-success/[0.08] text-foreground'
                  : option.state === 'wrong'
                    ? 'border-danger/30 bg-danger/[0.06] text-foreground'
                    : 'border-line bg-card text-fg-muted'
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  option.state === 'correct'
                    ? 'bg-success text-white'
                    : option.state === 'wrong'
                      ? 'bg-danger text-white'
                      : 'bg-muted text-fg-subtle'
                }`}
              >
                {option.state === 'correct' ? <Check size={11} strokeWidth={3} /> : option.key}
              </span>
              <span className="flex-1">{option.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-line bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Why
          </p>
          <p className="mt-1 text-[11px] leading-5 text-fg-muted">
            Mitochondria generate ATP through oxidative phosphorylation. The nucleus stores DNA; the
            Golgi packages proteins.
          </p>
        </div>
      </div>
    </div>
  );
}

function VivaPanel() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <h3 className="font-display text-[clamp(1.35rem,2vw,1.7rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground">
          Say it out loud, or type it.
        </h3>
        <p className="mt-3 text-sm leading-7 text-fg-muted">
          Boss nodes end in a short viva. Students answer by voice or keyboard and get a structured
          score against the same rubric every time.
        </p>
        <ul className="mt-5 space-y-2.5">
          {[
            'Voice or typed answers, no microphone required',
            'A clear pass threshold before XP is awarded',
            'Every attempt is reviewable in the briefing panel',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-foreground/85">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-text" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-background/70 p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold/12 text-gold-text">
            <Mic size={15} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-foreground">Viva · Cell respiration</p>
            <p className="text-[10px] text-fg-subtle">Examiner asks 3 questions · 70% to pass</p>
          </div>
          <span className="ml-auto chip border-transparent bg-success/10 text-success">78%</span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-card px-3.5 py-2.5">
            <p className="text-[10px] font-semibold text-fg-subtle">Examiner</p>
            <p className="mt-0.5 text-[12px] leading-5 text-foreground">
              Where does glycolysis happen, and what does it produce?
            </p>
          </div>
          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-gold/10 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold text-gold-text">You</p>
            <p className="mt-0.5 text-[12px] leading-5 text-foreground">
              In the cytoplasm. It turns glucose into pyruvate, with a small net gain of ATP and
              NADH.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            <span className="h-2 w-2 rounded-full bg-success" />
            Answer graded · 2 of 3 complete
          </div>
          <span className="text-[11px] font-semibold text-gold-text">+90 XP</span>
        </div>
      </div>
    </div>
  );
}

function ProgressPanel() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <h3 className="font-display text-[clamp(1.35rem,2vw,1.7rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground">
          Know what is working.
        </h3>
        <p className="mt-3 text-sm leading-7 text-fg-muted">
          Completion, quiz averages, and weak topics are grouped by subject, so a teacher can see
          where a class is stuck without exporting a spreadsheet.
        </p>
        <ul className="mt-5 space-y-2.5">
          {[
            'Completion by course and by subject',
            'Quiz averages only where quizzes exist',
            'Weak topics surfaced with a direct link',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-foreground/85">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-text" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-background/70 p-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Completion', value: '68%' },
            { label: 'Avg score', value: '84%' },
            { label: 'Streak', value: '7d' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-line bg-card p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                {stat.label}
              </p>
              <p className="mt-1 font-display text-lg font-semibold tracking-[-0.04em] text-foreground">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-foreground">Weekly study time</p>
            <span className="text-[10px] text-fg-subtle">Last 7 days</span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-2">
            {[45, 70, 38, 86, 62, 40, 78].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={`w-full rounded-md ${index === 3 ? 'bg-gold' : 'bg-brand-tint'}`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[8px] font-medium text-fg-subtle">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5">
          <Target size={14} className="text-warning" />
          <p className="text-[11px] text-fg-muted">
            Focus next: <span className="font-semibold text-foreground">Cell respiration</span> · 61%
          </p>
          <ArrowUpRight size={13} className="ml-auto text-fg-subtle" />
        </div>
      </div>
    </div>
  );
}

const PANELS = {
  tree: TreePanel,
  quiz: QuizPanel,
  viva: VivaPanel,
  progress: ProgressPanel,
};

export default function Landing() {
  const [tab, setTab] = useState('tree');
  const ActivePanel = PANELS[tab];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero ------------------------------------------------------------ */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-grain opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"
          />
          <div className="shell relative grid items-center gap-12 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-semibold text-fg-muted shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)]">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                Built for real courses, not demo content
              </span>

              <h1 className="mt-6 font-display text-[clamp(2.45rem,6.4vw,5rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-foreground">
                Turn a course
                <br />
                into a path
                <br />
                <span className="text-gold-text">you can finish.</span>
              </h1>

              <p className="mt-6 max-w-xl text-[16px] leading-7 text-fg-muted sm:text-[17px] sm:leading-8">
                QuestLearn turns a syllabus into a guided skill tree — short lessons, instant
                quizzes, and progress you can actually see. Less tab-juggling, more finishing.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/register" className="btn-primary h-12 px-6 text-[15px]">
                  Start learning
                  <ArrowRight size={16} />
                </Link>
                <Link to="/login" className="btn-ghost h-12 px-5 text-[15px]">
                  Sign in
                </Link>
              </div>

              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <Check size={12} className="text-gold-text" />
                  Free for students
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check size={12} className="text-gold-text" />
                  No credit card
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check size={12} className="text-gold-text" />
                  Phone, tablet, desktop
                </span>
              </p>
            </div>

            <HeroVisual />
          </div>
        </section>

        {/* Capability strip ----------------------------------------------- */}
        <section className="border-y border-line bg-card/45">
          <div className="shell flex flex-wrap items-center gap-x-8 gap-y-4 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              One workspace for
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 text-[12px] font-medium text-fg-muted"
                >
                  <Icon size={14} className="text-gold-text" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Product tabs ---------------------------------------------------- */}
        <section id="product" className="shell scroll-mt-24 py-20 sm:py-24 lg:py-28">
          <div className="max-w-2xl">
            <p className="eyebrow">The product</p>
            <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.03] tracking-[-0.045em] text-foreground">
              More than a course list.
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-fg-muted sm:text-base">
              The path, the practice, and the proof all live in the same place. Pick a piece to see
              how it works.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[220px_1fr]">
            <div
              role="tablist"
              aria-label="Product features"
              className="grid min-w-0 grid-cols-2 gap-1 sm:flex sm:overflow-x-auto sm:pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(id)}
                    className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                      active
                        ? 'bg-card text-foreground shadow-card ring-1 ring-line'
                        : 'text-fg-muted hover:bg-card/60 hover:text-foreground'
                    }`}
                  >
                    <Icon size={15} className={active ? 'text-gold-text' : 'text-fg-subtle'} />
                    {label}
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" className="panel-raised min-h-[360px] min-w-0 p-5 sm:p-8">
              <ActivePanel />
            </div>
          </div>
        </section>

        {/* Feature grid ---------------------------------------------------- */}
        <section className="border-y border-line bg-card/35">
          <div className="shell py-20 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-xl">
                <p className="eyebrow">Why it works</p>
                <h2 className="mt-4 font-display text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-foreground">
                  Three ideas, held together.
                </h2>
              </div>
              <p className="max-w-sm text-[13px] leading-6 text-fg-muted">
                Most study tools optimise one moment. QuestLearn connects the path, the practice, and
                the evidence.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body, note }, index) => (
                <article
                  key={title}
                  className="card-hover flex flex-col rounded-[20px] border border-line bg-card p-6"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-tint text-gold-text">
                    <Icon size={18} />
                  </span>
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                    0{index + 1}
                  </p>
                  <h3 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.02em] text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2.5 flex-1 text-[13px] leading-6 text-fg-muted">{body}</p>
                  <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-4 text-[11px] font-medium text-fg-subtle">
                    <CheckCircle2 size={13} className="text-gold-text" />
                    {note}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Instructor panel ------------------------------------------------ */}
        <section className="shell py-20 sm:py-24">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#191614] px-6 py-12 text-[#FCF6F5] sm:px-10 sm:py-14 lg:px-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#FA4614]/20 blur-[90px]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#2F7D6B]/15 blur-[90px]"
            />

            <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
              <div>
                <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FF9A73]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FA4614]" />
                  For instructors
                </p>
                <h2 className="mt-4 font-display text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-[#FCF6F5]">
                  Build the course once.
                  <br />
                  Publish a path.
                </h2>
                <p className="mt-4 max-w-lg text-[14px] leading-7 text-[#C9C1BB]">
                  The studio handles nodes, prerequisites, lessons, video, and four quiz formats. Add
                  an AI-assisted draft if you want a starting point, then edit every word.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'A visual outline of every node and branch',
                    'Lesson, video, and quiz editing in one place',
                    'Publish when the path is ready, not when the syllabus is',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] text-[#DED7D1]">
                      <Check size={15} className="mt-0.5 shrink-0 text-[#FF9A73]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Link
                    to="/login"
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#D5340B] px-5 text-[13px] font-semibold text-white shadow-[0_3px_0_#8F2506] transition-transform hover:translate-y-[1px] hover:shadow-[0_2px_0_#8F2506]"
                  >
                    Open the studio
                    <ArrowRight size={15} />
                  </Link>
                  <a
                    href="#how"
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-5 text-[13px] font-semibold text-[#FCF6F5] transition-colors hover:bg-white/5"
                  >
                    See the workflow
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#211D1A] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9C948E]">
                      Course outline
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#FCF6F5]">
                      Intro to Psychology
                    </p>
                  </div>
                  <span className="rounded-full border border-[#FA4614]/40 bg-[#FA4614]/10 px-2.5 py-1 text-[10px] font-semibold text-[#FF9A73]">
                    Draft
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    { title: 'Foundations of behaviour', meta: 'Lesson · Quiz · 40 XP', state: 'ready' },
                    { title: 'Memory and attention', meta: 'Video · Quiz · 60 XP', state: 'ready' },
                    { title: 'Learning and conditioning', meta: 'Lesson · Viva · 90 XP', state: 'edit' },
                    { title: 'Research methods', meta: 'Not started', state: 'empty' },
                  ].map((node, index) => (
                    <div
                      key={node.title}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                        node.state === 'edit'
                          ? 'border-[#FA4614]/40 bg-[#FA4614]/[0.07]'
                          : 'border-white/10 bg-white/[0.025]'
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[9px] font-bold ${
                          node.state === 'empty'
                            ? 'border-white/10 bg-white/5 text-[#8C847E]'
                            : 'border-[#FA4614]/30 bg-[#FA4614]/10 text-[#FF9A73]'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-[#F0EAE5]">{node.title}</p>
                        <p className="truncate text-[9px] text-[#9C948E]">{node.meta}</p>
                      </div>
                      {node.state === 'ready' ? (
                        <CheckCircle2 size={14} className="shrink-0 text-[#63C39B]" />
                      ) : node.state === 'edit' ? (
                        <span className="shrink-0 text-[9px] font-semibold text-[#FF9A73]">Editing</span>
                      ) : (
                        <span className="shrink-0 text-[9px] text-[#8C847E]">+ Add</span>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  tabIndex={-1}
                  className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#D5340B] text-[11px] font-semibold text-white"
                >
                  <FileText size={13} />
                  Publish course
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How it works ---------------------------------------------------- */}
        <section id="how" className="scroll-mt-24 border-t border-line">
          <div className="shell py-20 sm:py-24">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="mt-4 font-display text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-foreground">
                Three steps, one loop.
              </h2>
            </div>

            <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {STEPS.map((step, index) => (
                <div
                  key={step.number}
                  className={`relative ${index > 0 ? 'md:border-l md:border-line md:pl-6' : ''}`}
                >
                  <p className="font-display text-[2.4rem] font-semibold leading-none tracking-[-0.06em] text-gold">
                    {step.number}
                  </p>
                  <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-sm text-[13px] leading-6 text-fg-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roles ------------------------------------------------------------ */}
        <section id="roles" className="scroll-mt-24 border-t border-line bg-card/35">
          <div className="shell py-20 sm:py-24">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="eyebrow">Who it is for</p>
                <h2 className="mt-4 font-display text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-foreground">
                  One course.
                  <br />
                  Three clear views.
                </h2>
                <p className="mt-4 max-w-md text-[14px] leading-7 text-fg-muted">
                  Students see the next step. Instructors see the whole path. Admins see who has
                  access. Nobody has to learn a second product.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {ROLES.map(({ icon: Icon, label, body }) => (
                  <div
                    key={label}
                    className="rounded-[20px] border border-line bg-card p-5"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-fg-muted">
                      <Icon size={16} />
                    </span>
                    <h3 className="mt-4 text-[14px] font-semibold text-foreground">{label}</h3>
                    <p className="mt-1.5 text-[12px] leading-5 text-fg-muted">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA -------------------------------------------------------- */}
        <section className="shell py-16 sm:py-20">
          <div className="relative overflow-hidden rounded-[28px] bg-[#FA4614] px-6 py-14 text-center text-[#191817] sm:px-10 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, #191817 1px, transparent 0)',
                backgroundSize: '22px 22px',
              }}
            />
            <div className="relative mx-auto max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2A0F05]">
                Start where you are
              </p>
              <h2 className="mt-4 font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-[#191817]">
                Your next lesson is waiting.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-[14px] leading-6 text-[#2A0F05] sm:text-[15px]">
                Join a course, open one node, and see how it feels to finish something today.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/register"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#191817] px-6 text-[14px] font-semibold text-[#FAF6F0] shadow-[0_3px_0_rgba(0,0,0,0.35)] transition-transform hover:translate-y-[1px]"
                >
                  Create an account
                  <ArrowRight size={15} />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#191817]/25 px-5 text-[14px] font-semibold text-[#191817] transition-colors hover:bg-[#191817]/5"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-[11px] text-[#2A0F05]">
                Students join with a class code. Instructors need an invite from an admin.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-card/40">
      <div className="shell py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[12px] leading-6 text-fg-muted">
              A clearer way to learn. Built for students who want momentum and teachers who want
              evidence.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Product
            </p>
            <ul className="mt-3 space-y-2 text-[12px] text-fg-muted">
              <li>
                <a href="#product" className="transition-colors hover:text-foreground">
                  Skill trees
                </a>
              </li>
              <li>
                <a href="#product" className="transition-colors hover:text-foreground">
                  Quizzes and viva
                </a>
              </li>
              <li>
                <a href="#product" className="transition-colors hover:text-foreground">
                  Progress
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              For
            </p>
            <ul className="mt-3 space-y-2 text-[12px] text-fg-muted">
              <li>
                <Link to="/register" className="transition-colors hover:text-foreground">
                  Students
                </Link>
              </li>
              <li>
                <Link to="/login" className="transition-colors hover:text-foreground">
                  Instructors
                </Link>
              </li>
              <li>
                <Link to="/login" className="transition-colors hover:text-foreground">
                  Admins
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Account
            </p>
            <ul className="mt-3 space-y-2 text-[12px] text-fg-muted">
              <li>
                <Link to="/login" className="transition-colors hover:text-foreground">
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/register" className="transition-colors hover:text-foreground">
                  Create account
                </Link>
              </li>
              <li>
                <a href="#how" className="transition-colors hover:text-foreground">
                  How it works
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-[11px] text-fg-subtle">
            © 2026 Group 28, Inc. All rights reserved.
          </p>
          <p className="text-[11px] text-fg-subtle">
            Designed to be read on a phone, a tablet, or a projector.
          </p>
        </div>
      </div>
    </footer>
  );
}
