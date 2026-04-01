import api from './client';
import type { Agent } from '../types';

export async function getAgents(): Promise<Agent[]> {
  const { data } = await api.get('/agents');
  return data;
}

export async function createAgent(payload: {
  username: string;
  password: string;
  display_name: string;
}): Promise<Agent> {
  const { data } = await api.post('/agents', payload);
  return data;
}

export async function updateAgent(id: string, payload: {
  display_name?: string;
  password?: string;
  is_active?: boolean;
}): Promise<Agent> {
  const { data } = await api.patch(`/agents/${id}`, payload);
  return data;
}

export async function deactivateAgent(id: string): Promise<void> {
  await api.delete(`/agents/${id}`);
}
