import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/common/Navbar.jsx';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

// The skill tree, dashboards and studio pull in framer-motion, lottie and
// confetti. Loading them on demand keeps the sign-in page small on a phone.
const StudentDashboard = lazy(() => import('./pages/StudentDashboard.jsx'));
const SkillTreePage = lazy(() => import('./pages/SkillTreePage.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const InstructorStudio = lazy(() => import('./pages/InstructorStudio.jsx'));
const AdminPanel = lazy(() => import('./pages/AdminPanel.jsx'));

function RouteFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-sm text-slate-400">
      Loading your quest…
    </div>
  );
}

function HomeRedirect() {
  const { user, booting } = useAuth();
  if (booting) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-slate-400">
        Loading your quest…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'INSTRUCTOR') return <Navigate to="/studio" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      {user && <Navbar />}
      <main className="flex-1">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login />}
            />
            <Route
              path="/register"
              element={user ? <Navigate to="/" replace /> : <Register />}
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['STUDENT']}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses/:courseId"
              element={
                <ProtectedRoute roles={['STUDENT', 'INSTRUCTOR', 'ADMIN']}>
                  <SkillTreePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leaderboard"
              element={
                <ProtectedRoute roles={['STUDENT', 'ADMIN']}>
                  <Leaderboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio"
              element={
                <ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}>
                  <InstructorStudio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
