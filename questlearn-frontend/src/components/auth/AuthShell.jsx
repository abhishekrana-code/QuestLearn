import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../common/Logo.jsx';
import ThemeToggle from '../common/ThemeToggle.jsx';

/**
 * Shared shell for sign-in and registration: a quiet header, an editorial left
 * column, and one white form card. Keeping the two pages on the same frame is
 * what makes the auth flow feel like part of the product.
 */
export default function AuthShell({ aside, children }) {
  return (
    <div className="relative min-h-screen bg-background">
      <header className="shell flex h-16 items-center justify-between">
        <Link to="/" aria-label="QuestLearn home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-fg-muted transition-colors hover:text-foreground sm:inline-flex"
          >
            <ArrowLeft size={13} />
            Back to site
          </Link>
          <ThemeToggle compact />
        </div>
      </header>

      <div className="shell grid gap-10 pb-14 pt-6 sm:pb-20 lg:grid-cols-[1.02fr_1fr] lg:items-start lg:gap-16 lg:pb-24 lg:pt-10">
        <aside className="hidden lg:block">{aside}</aside>

        <div className="w-full max-w-[460px] justify-self-center lg:justify-self-end">
          {children}
        </div>
      </div>
    </div>
  );
}
