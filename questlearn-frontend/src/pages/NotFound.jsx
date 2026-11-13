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
    <div className="shell py-16 sm:py-24">
      <div className="max-w-xl">
        <p className="eyebrow">Off the map</p>
        <p className="mt-6 font-display text-[64px] font-semibold leading-none tracking-[-0.06em] text-line-strong sm:text-[88px]">
          404
        </p>
        <h1 className="page-title mt-3">This path leads nowhere.</h1>
        <p className="page-subtitle mt-3">
          There is no page at{' '}
          <code className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[0.82em] text-foreground">
            {location.pathname}
          </code>
          . The link may be out of date, or the address may have a typo in it.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/" className="btn-primary h-11 px-5 text-[13px]">
            <Compass size={15} />
            {user ? (HOME_LABEL[user.role] ?? 'Back to QuestLearn') : 'Back to the home page'}
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-ghost h-11 px-5 text-[13px]"
          >
            <ArrowLeft size={15} />
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
