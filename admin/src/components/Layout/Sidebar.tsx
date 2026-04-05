import {
  Backup as BackupIcon,
  Chat as ChatIcon,
  Dashboard as DashboardIcon,
  Logout as LogoutIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const DRAWER_WIDTH = 240;

const menuItems = [
  { path: '/admin', label: 'Дашборд', icon: <DashboardIcon /> },
  { path: '/admin/sessions', label: 'Сессии', icon: <ChatIcon /> },
  { path: '/admin/agents', label: 'Агенты', icon: <PeopleIcon /> },
  { path: '/admin/settings', label: 'Настройки', icon: <SettingsIcon /> },
  { path: '/admin/backups', label: 'Бэкапы', icon: <BackupIcon /> },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          FixIT Chat
        </Typography>
      </Box>

      <List sx={{ flex: 1 }}>
        {menuItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <List>
        <ListItemButton onClick={handleLogout}>
          <ListItemIcon><LogoutIcon /></ListItemIcon>
          <ListItemText primary="Выход" />
        </ListItemButton>
      </List>
    </Drawer>
  );
}
