import api from './client';
import type { Message, Note, Session, SessionList } from '../types';

export async function getSessions(params: {
  status?: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<SessionList> {
  const { data } = await api.get('/sessions', { params });
  return data;
}

export async function getSession(id: string): Promise<Session> {
  const { data } = await api.get(`/sessions/${id}`);
  return data;
}

export async function closeSession(id: string): Promise<Session> {
  const { data } = await api.patch(`/sessions/${id}`, { status: 'closed' });
  return data;
}

export async function reopenSession(id: string): Promise<Session> {
  const { data } = await api.patch(`/sessions/${id}`, { status: 'open' });
  return data;
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const { data } = await api.get(`/sessions/${sessionId}/messages`);
  return data;
}

export async function sendMessage(sessionId: string, content: string): Promise<Message> {
  const { data } = await api.post(`/sessions/${sessionId}/messages`, { content });
  return data;
}

export async function markRead(sessionId: string, messageIds: string[]): Promise<void> {
  await api.post(`/sessions/${sessionId}/read`, { message_ids: messageIds });
}

export async function getNotes(sessionId: string): Promise<Note[]> {
  const { data } = await api.get(`/sessions/${sessionId}/notes`);
  return data;
}

export async function createNote(sessionId: string, content: string): Promise<Note> {
  const { data } = await api.post(`/sessions/${sessionId}/notes`, { content });
  return data;
}
