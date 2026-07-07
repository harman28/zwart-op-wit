import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import NavBar from './components/NavBar.js';
import { AdminProvider, useAdmin } from './context/AdminContext.js';
import LeaderboardPage from './pages/LeaderboardPage.js';
import LoginPage from './pages/LoginPage.js';
import NewRoundPage from './pages/NewRoundPage.js';
import PlayersPage from './pages/PlayersPage.js';
import ReviewPairingsPage from './pages/ReviewPairingsPage.js';
import RoundsPage from './pages/RoundsPage.js';
import SettingsPage from './pages/SettingsPage.js';

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAdmin();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<RoundsPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/admin/new-round"
          element={
            <RequireAdmin>
              <NewRoundPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/rounds/:id/review"
          element={
            <RequireAdmin>
              <ReviewPairingsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/players"
          element={
            <RequireAdmin>
              <PlayersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AdminProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AdminProvider>
  );
}
