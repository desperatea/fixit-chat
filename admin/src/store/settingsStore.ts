import { create } from 'zustand';
import * as settingsApi from '../api/settings';
import type { WidgetSettings } from '../types';

interface SettingsState {
  settings: WidgetSettings | null;
  loading: boolean;
  fetch: () => Promise<void>;
  update: (data: Partial<WidgetSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const settings = await settingsApi.getSettings();
      set({ settings, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  update: async (data) => {
    set({ loading: true });
    try {
      const settings = await settingsApi.updateSettings(data);
      set({ settings, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
