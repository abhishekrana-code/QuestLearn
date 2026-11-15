import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import NoAccess from './NoAccess.jsx';

export default function ProtectedRoute({ roles, children }) {
  const { user, booting } = useAuth();

  if (booting) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-[12px] text-fg-muted">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
          Opening QuestLearn…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // A silent redirect looks like a dead link: the person typed an address and
  // landed somewhere else with no explanation. Say what happened and keep the URL.
  if (roles && !roles.includes(user.role)) {
    return <NoAccess roles={roles} />;
  }

  return children;
}
