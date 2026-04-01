import { create } from 'zustand';
import { login as apiLogin, logout as apiLogout } from '../api/auth';

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!sessionStorage.getItem('access_token'),
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const token = await apiLogin(username, password);
      sessionStorage.setItem('access_token', token);
      set({ isAuthenticated: true, loading: false });
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Ошибка входа';
      set({ error: message, loading: false });
    }
  },

  logout: async () => {
    await apiLogout();
    set({ isAuthenticated: false });
  },

  checkAuth: () => {
    set({ isAuthenticated: !!sessionStorage.getItem('access_token') });
  },
}));
