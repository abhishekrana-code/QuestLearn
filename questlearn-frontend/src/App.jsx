import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/common/Navbar.jsx';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';

// The skill tree, dashboards and studio pull in framer-motion, lottie and
// confetti. Loading them on demand keeps the landing and sign-in pages small
// on a phone.
const StudentDashboard = lazy(() => import('./pages/StudentDashboard.jsx'));
const SkillTreePage = lazy(() => import('./pages/SkillTreePage.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const InstructorStudio = lazy(() => import('./pages/InstructorStudio.jsx'));
const InstructorCourses = lazy(() => import('./pages/InstructorCourses.jsx'));
const CourseRoster = lazy(() => import('./pages/CourseRoster.jsx'));
const LearnerDetail = lazy(() => import('./pages/LearnerDetail.jsx'));
const InstructorCohorts = lazy(() => import('./pages/InstructorCohorts.jsx'));
const ExploreCourses = lazy(() => import('./pages/ExploreCourses.jsx'));
const StudentPerformance = lazy(() => import('./pages/StudentPerformance.jsx'));
const AdminPanel = lazy(() => import('./pages/AdminPanel.jsx'));

function LoadingScreen({ label = 'Opening QuestLearn…' }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-fg-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
        {label}
      </div>
    </div>
  );
}

function HomeRoute() {
  const { user, booting } = useAuth();

  if (booting) return <LoadingScreen />;

  // Signed-out visitors get the public page instead of an immediate bounce to
  // the sign-in form.
  if (!user) return <Landing />;

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
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
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
              path="/explore"
              element={
                <ProtectedRoute roles={['STUDENT']}>
                  <ExploreCourses />
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
              path="/performance"
              element={
                <ProtectedRoute roles={['STUDENT']}>
                  <StudentPerformance />
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
              path="/studio/courses"
              element={
                <ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}>
                  <InstructorCourses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/courses/:courseId/roster"
              element={
                <ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}>
                  <CourseRoster />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/courses/:courseId/cohorts"
              element={
                <ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}>
                  <InstructorCohorts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/courses/:courseId/roster/:userId"
              element={
                <ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}>
                  <LearnerDetail />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
