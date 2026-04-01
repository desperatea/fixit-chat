import { Box } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuthStore } from './store/authStore';
import AgentsPage from './pages/AgentsPage';
import ChatPage from './pages/ChatPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SessionListPage from './pages/SessionListPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useWebSocket();

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
  return (
    <Routes>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
      <Route path="/admin/sessions" element={<ProtectedLayout><SessionListPage /></ProtectedLayout>} />
      <Route path="/admin/sessions/:id" element={<ProtectedLayout><ChatPage /></ProtectedLayout>} />
      <Route path="/admin/agents" element={<ProtectedLayout><AgentsPage /></ProtectedLayout>} />
      <Route path="/admin/settings" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
