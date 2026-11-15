import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Shown instead of a silent redirect when a signed-in account opens a page its
 * role cannot use. The address stays put, so the back button and a pasted link
 * both behave the way the person expects, and the page says what happened.
 */
const HOME = {
  STUDENT: { to: '/dashboard', label: 'Back to your dashboard' },
  INSTRUCTOR: { to: '/studio/courses', label: 'Back to your courses' },
  ADMIN: { to: '/admin', label: 'Back to the admin panel' },
};

function audienceFor(roles = []) {
  const set = new Set(roles);
  if (set.size === 1 && set.has('ADMIN')) return 'admins';
  if (set.size === 1 && set.has('STUDENT')) return 'learners';
  if (set.has('ADMIN') && set.has('INSTRUCTOR')) return 'teachers and admins';
  return 'teachers';
}

const ROLE_WORD = { STUDENT: 'a learner', INSTRUCTOR: 'a teacher', ADMIN: 'an admin' };

export default function NoAccess({ roles }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const home = HOME[user?.role] ?? { to: '/', label: 'Back to QuestLearn' };

  return (
    <div className="shell py-16 sm:py-24">
      <div className="max-w-xl">
        <p className="eyebrow">Not your page</p>
        <h1 className="page-title mt-3">This page is for {audienceFor(roles)}.</h1>
        <p className="page-subtitle mt-3">
          You are signed in as {ROLE_WORD[user?.role] ?? 'a guest'}, so this page is not open
          to you. Nothing is broken, and nothing was changed.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to={home.to} className="btn-primary h-11 px-5 text-[13px]">
            <Lock size={15} aria-hidden="true" />
            {home.label}
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-ghost h-11 px-5 text-[13px]"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
