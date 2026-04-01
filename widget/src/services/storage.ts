const PREFIX = 'fixit_chat_';

export function saveSession(sessionId: string, visitorToken: string): void {
  try {
    localStorage.setItem(`${PREFIX}session_id`, sessionId);
    localStorage.setItem(`${PREFIX}visitor_token`, visitorToken);
  } catch {
    // localStorage may be unavailable
  }
}

export function getSession(): { sessionId: string; visitorToken: string } | null {
  try {
    const sessionId = localStorage.getItem(`${PREFIX}session_id`);
    const visitorToken = localStorage.getItem(`${PREFIX}visitor_token`);
    if (sessionId && visitorToken) {
      return { sessionId, visitorToken };
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearSession(): void {
  try {
    localStorage.removeItem(`${PREFIX}session_id`);
    localStorage.removeItem(`${PREFIX}visitor_token`);
  } catch {
    // ignore
  }
}
