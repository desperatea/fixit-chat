import { create } from 'zustand';

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

interface Notification {
  id: number;
  message: string;
  type: NotificationType;
}

interface NotificationState {
  notifications: Notification[];
  push: (message: string, type?: NotificationType) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  push: (message, type = 'error') => {
    const id = nextId++;
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }],
    }));
  },

  dismiss: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

/** Shorthand for pushing an error from a caught exception. */
export function notifyError(err: unknown, fallback = 'Произошла ошибка') {
  const message =
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    || (err instanceof Error ? err.message : null)
    || fallback;
  useNotificationStore.getState().push(message, 'error');
}
