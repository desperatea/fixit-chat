import type { Message, Session, WidgetSettings } from '../types';

let apiUrl = '';

export function initApi(url: string): void {
  apiUrl = url.replace(/\/$/, '');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function visitorHeaders(token: string): Record<string, string> {
  return { 'X-Visitor-Token': token };
}

export async function fetchSettings(): Promise<WidgetSettings> {
  return request<WidgetSettings>('/api/v1/widget/settings');
}

export async function getSessionInfo(
  sessionId: string,
  token: string,
): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/v1/widget/sessions/${sessionId}`, {
    headers: visitorHeaders(token),
  });
}

export async function createSession(data: {
  visitor_name: string;
  visitor_phone?: string;
  visitor_org?: string;
  initial_message: string;
  consent_given: boolean;
  captcha_token?: string;
  custom_fields?: Record<string, string>;
}): Promise<Session> {
  return request<Session>('/api/v1/widget/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createGlpiSession(
  glpiToken: string,
  initialMessage: string,
): Promise<Session> {
  return request<Session>('/api/v1/widget/sessions/glpi', {
    method: 'POST',
    body: JSON.stringify({ glpi_token: glpiToken, initial_message: initialMessage }),
  });
}

export async function getMessages(
  sessionId: string,
  token: string,
): Promise<Message[]> {
  return request<Message[]>(`/api/v1/widget/sessions/${sessionId}/messages`, {
    headers: visitorHeaders(token),
  });
}

export async function sendMessage(
  sessionId: string,
  token: string,
  content: string,
): Promise<Message> {
  return request<Message>(`/api/v1/widget/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: visitorHeaders(token),
    body: JSON.stringify({ content }),
  });
}

export async function closeSession(
  sessionId: string,
  token: string,
): Promise<void> {
  return request<void>(`/api/v1/widget/sessions/${sessionId}/close`, {
    method: 'POST',
    headers: visitorHeaders(token),
  });
}

export async function markRead(
  sessionId: string,
  token: string,
  messageIds: string[],
): Promise<void> {
  return request<void>(`/api/v1/widget/sessions/${sessionId}/read`, {
    method: 'POST',
    headers: visitorHeaders(token),
    body: JSON.stringify({ message_ids: messageIds }),
  });
}

export async function rateSession(
  sessionId: string,
  token: string,
  rating: number,
): Promise<void> {
  return request<void>(`/api/v1/widget/sessions/${sessionId}/rating`, {
    method: 'POST',
    headers: visitorHeaders(token),
    body: JSON.stringify({ rating }),
  });
}

export async function reopenSession(
  sessionId: string,
  token: string,
): Promise<void> {
  return request<void>(`/api/v1/widget/sessions/${sessionId}/reopen`, {
    method: 'POST',
    headers: visitorHeaders(token),
  });
}

export async function uploadFile(
  sessionId: string,
  token: string,
  file: File,
): Promise<Message> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${apiUrl}/api/v1/widget/sessions/${sessionId}/files`, {
    method: 'POST',
    headers: { 'X-Visitor-Token': token },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || 'Ошибка загрузки файла');
  }
  return res.json();
}
