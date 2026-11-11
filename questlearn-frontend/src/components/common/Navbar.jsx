import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Sword } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
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
  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 md:flex-nowrap">
        <NavLink to="/" className="group flex items-center gap-2.5" aria-label="QuestLearn home">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold/25 bg-gold/[0.12] text-gold transition-transform duration-200 ease-out group-hover:scale-[1.04]">
            <Sword size={17} />
          </span>
          <span className="leading-none">
            <span className="block font-display text-[17px] font-extrabold tracking-[-0.045em] text-foreground">
              Quest<span className="text-gold">Learn</span>
            </span>
            <span className="mt-1 hidden text-[9px] font-semibold uppercase tracking-[0.19em] text-fg-subtle sm:block">
              Playable curriculum
            </span>
          </span>
        </NavLink>

        <nav className="order-3 flex w-full gap-0.5 overflow-x-auto pb-0.5 md:order-none md:w-auto md:pb-0">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
                  isActive
                    ? 'bg-gold/[0.12] text-gold-text ring-1 ring-inset ring-gold/20'
                    : 'text-fg-muted hover:bg-muted hover:text-foreground'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {user.role !== 'INSTRUCTOR' && (
            <span className="hidden sm:block">
              <XPBar compact />
            </span>
          )}
          <div className="hidden md:block">
            <StreakCounter compact />
          </div>

          <ThemeToggle compact />

          <span className="hidden h-7 w-px bg-line sm:block" />

          <div className="flex items-center gap-2">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-muted text-[11px] font-bold text-gold-text"
              title={user.name}
            >
              {initials || 'QL'}
            </span>
            <div className="hidden text-right lg:block">
              <p className="max-w-[130px] truncate text-xs font-semibold text-foreground">
                {user.name}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                {user.role.toLowerCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line text-fg-muted transition-colors duration-150 hover:border-danger/40 hover:text-danger"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
