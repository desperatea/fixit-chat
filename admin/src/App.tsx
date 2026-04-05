import { Box, CircularProgress } from '@mui/material';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Layout/Sidebar';
import NotificationSnackbar from './components/NotificationSnackbar';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuthStore } from './store/authStore';
import AgentsPage from './pages/AgentsPage';
import BackupPage from './pages/BackupPage';
import ChatPage from './pages/ChatPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SessionListPage from './pages/SessionListPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthStore();
  useWebSocket();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Box>
  );
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/admin/sessions" element={<ProtectedLayout><SessionListPage /></ProtectedLayout>} />
        <Route path="/admin/sessions/:id" element={<ProtectedLayout><ChatPage /></ProtectedLayout>} />
        <Route path="/admin/agents" element={<ProtectedLayout><AgentsPage /></ProtectedLayout>} />
        <Route path="/admin/settings" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />
        <Route path="/admin/backups" element={<ProtectedLayout><BackupPage /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      <NotificationSnackbar />
    </ErrorBoundary>
  );
}
