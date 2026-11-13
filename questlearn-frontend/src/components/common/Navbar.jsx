import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, KeyRound, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ChangePasswordDialog from './ChangePasswordDialog.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import Logo from './Logo.jsx';
import XPBar from '../gamification/XPBar.jsx';
import StreakCounter from '../gamification/StreakCounter.jsx';

const LINKS_BY_ROLE = {
  STUDENT: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/explore', label: 'Courses' },
    { to: '/performance', label: 'Progress' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
  INSTRUCTOR: [
    { to: '/studio/courses', label: 'My courses' },
    { to: '/studio', label: 'Course studio', end: true },
  ],
  ADMIN: [
    { to: '/studio/courses', label: 'My courses' },
    { to: '/studio', label: 'Course studio', end: true },
    { to: '/admin', label: 'Admin' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
};

const HOME_BY_ROLE = {
  STUDENT: { to: '/dashboard', label: 'Your dashboard' },
  INSTRUCTOR: { to: '/studio/courses', label: 'Your courses' },
  ADMIN: { to: '/admin', label: 'Admin panel' },
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const accountRef = useRef(null);
  const mobileRef = useRef(null);

  const links = LINKS_BY_ROLE[user.role] ?? [];
  const home = HOME_BY_ROLE[user.role] ?? HOME_BY_ROLE.STUDENT;
  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // A menu that survives navigation is the fastest way to make a site feel
  // broken. Close both on every route (or query) change.
  useEffect(() => {
    setAccountOpen(false);
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setMobileOpen(false);
      }
    };
    const onPointer = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountOpen(false);
      }
      if (mobileRef.current && !mobileRef.current.contains(event.target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const handleLogout = () => {
    setAccountOpen(false);
    setMobileOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-background/85 backdrop-blur-md">
      <div className="shell flex h-16 items-center gap-2">
        <Link to="/" className="shrink-0" aria-label="QuestLearn home">
          <Logo />
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 md:flex" aria-label="Main">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `relative px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                  isActive ? 'text-foreground' : 'text-fg-muted hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {link.label}
                  <span
                    className={`absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full transition-colors duration-150 ${
                      isActive ? 'bg-gold' : 'bg-transparent'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user.role === 'STUDENT' && (
            <>
              <span className="hidden lg:block">
                <XPBar compact />
              </span>
              <div className="hidden xl:block">
                <StreakCounter compact />
              </div>
            </>
          )}

          <div className="hidden sm:block">
            <ThemeToggle compact />
          </div>

          <div ref={accountRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setAccountOpen((open) => !open);
                setMobileOpen(false);
              }}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-card px-1.5 pr-1.5 text-left transition-colors duration-150 hover:border-line-strong sm:gap-2 sm:pr-2"
            >
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-tint text-[10px] font-bold text-gold-text">
                {initials || 'QL'}
              </span>
              <span className="hidden max-w-[110px] truncate text-[12px] font-semibold text-foreground lg:block">
                {user.name.split(' ')[0]}
              </span>
              <ChevronDown
                size={13}
                className={`text-fg-subtle transition-transform duration-150 ${
                  accountOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {accountOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-2xl border border-line bg-card shadow-raised"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-[13px] font-semibold text-foreground">{user.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-fg-subtle">{user.email}</p>
                  <span className="chip mt-2 text-gold-text">{user.role.toLowerCase()}</span>
                </div>
                <div className="p-1.5">
                  <Link
                    to={home.to}
                    role="menuitem"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LayoutDashboard size={15} />
                    {home.label}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      setPasswordOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-fg-muted transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <KeyRound size={15} />
                    Change password
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-fg-muted transition-colors hover:bg-danger/[0.08] hover:text-danger"
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setMobileOpen((open) => !open);
              setAccountOpen(false);
            }}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card text-fg-muted transition-colors hover:text-foreground md:hidden"
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-nav"
          ref={mobileRef}
          className="border-t border-line bg-background px-5 pb-5 pt-3 md:hidden"
        >
          <nav className="grid gap-1" aria-label="Mobile">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-tint text-gold-text'
                      : 'text-fg-muted hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <ThemeToggle compact />
            <span className="chip text-gold-text">{user.role.toLowerCase()}</span>
          </div>

          <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-[11px] font-bold text-gold-text">
              {initials || 'QL'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-[11px] text-fg-subtle">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setPasswordOpen(true);
              }}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-foreground"
              aria-label="Change password"
            >
              <KeyRound size={15} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line text-fg-muted transition-colors hover:border-danger/40 hover:text-danger"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      )}

      {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}
    </header>
  );
}
