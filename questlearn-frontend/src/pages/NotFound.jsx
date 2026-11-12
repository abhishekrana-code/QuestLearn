import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const HOME_LABEL = {
  STUDENT: 'Back to your dashboard',
  INSTRUCTOR: 'Back to your courses',
  ADMIN: 'Back to the admin panel',
};

/** A mistyped or dead link should say so, not quietly bounce to another screen. */
export default function NotFound() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="eyebrow">Off the map</p>
      <h1 className="page-title mt-2">This path leads nowhere</h1>
      <p className="page-subtitle mt-2 text-sm text-fg-muted">
        There is no page at{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] text-foreground">
          {location.pathname}
        </code>
        . The link may be out of date, or the address may have a typo in it.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link to="/" className="btn btn-primary inline-flex items-center gap-2 text-sm">
          <Compass size={15} />
          {user ? (HOME_LABEL[user.role] ?? 'Back to your quest') : 'Go to sign in'}
        </Link>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn btn-ghost inline-flex items-center gap-2 border border-line px-3.5 py-2 text-sm font-semibold text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Go back
        </button>
      </div>
    </div>
  );
}
