import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

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

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
