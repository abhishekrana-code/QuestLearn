import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Sword } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import XPBar from '../gamification/XPBar.jsx';
import StreakCounter from '../gamification/StreakCounter.jsx';

const LINKS_BY_ROLE = {
  STUDENT: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
  INSTRUCTOR: [{ to: '/studio', label: 'Instructor Studio' }],
  ADMIN: [
    { to: '/studio', label: 'Course Studio' },
    { to: '/admin', label: 'Admin' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = LINKS_BY_ROLE[user.role] ?? [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold shadow-glow">
            <Sword size={18} />
          </span>
          <span className="font-display text-lg font-bold tracking-wide text-slate-50">
            Quest<span className="text-gold">Learn</span>
          </span>
        </NavLink>

        <nav className="order-3 flex w-full gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/10 text-gold'
                    : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user.role !== 'INSTRUCTOR' && <XPBar compact />}
          <div className="hidden sm:block">
            <StreakCounter compact />
          </div>

          <div className="flex items-center gap-2 border-l border-white/10 pl-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[130px] truncate text-xs font-semibold text-slate-100">
                {user.name}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gold/80">
                {user.role.toLowerCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-rose-400/40 hover:text-rose-300"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
