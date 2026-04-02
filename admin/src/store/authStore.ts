import { create } from 'zustand';
import { login as apiLogin, logout as apiLogout, checkAuth as apiCheckAuth } from '../api/auth';
import { disconnectWebSocket } from '../hooks/useWebSocket';

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  loading: true,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      await apiLogin(username, password);
      set({ isAuthenticated: true, loading: false });
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Ошибка входа';
      set({ error: message, loading: false });
    }
  },

  logout: async () => {
    disconnectWebSocket();
    await apiLogout();
    set({ isAuthenticated: false, loading: false });
  },

  checkAuth: async () => {
    const ok = await apiCheckAuth();
    set({ isAuthenticated: ok, loading: false });
  },
}));
