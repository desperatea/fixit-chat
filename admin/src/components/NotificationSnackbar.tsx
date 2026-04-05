import { Alert, Snackbar } from '@mui/material';
import { useNotificationStore } from '../store/notificationStore';

export default function NotificationSnackbar() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  const current = notifications[0];
  if (!current) return null;

  return (
    <Snackbar
      open
      autoHideDuration={5000}
      onClose={() => dismiss(current.id)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={() => dismiss(current.id)}
        severity={current.type}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {current.message}
      </Alert>
    </Snackbar>
  );
}
