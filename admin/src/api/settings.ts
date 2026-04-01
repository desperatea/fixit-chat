import api from './client';
import type { WidgetSettings } from '../types';

export async function getSettings(): Promise<WidgetSettings> {
  const { data } = await api.get('/settings');
  return data;
}

export async function updateSettings(payload: Partial<WidgetSettings>): Promise<WidgetSettings> {
  const { data } = await api.put('/settings', payload);
  return data;
}

export async function getStats() {
  const { data } = await api.get('/stats');
  return data;
}

export async function getDailyStats(days = 30) {
  const { data } = await api.get('/stats/daily', { params: { days } });
  return data;
}
