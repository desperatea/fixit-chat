/**
 * Session persistence via localStorage.
 *
 * SECURITY NOTE: visitor_token is stored in plain localStorage.
 * Any script on the host page can read it. This is an accepted trade-off:
 * - visitor_token gives access only to one chat session (read/write messages)
 * - httpOnly cookie alternative would require complex CORS setup
 * - Shadow DOM isolates CSS but NOT JavaScript context
 *
 * For production with sensitive data, consider httpOnly cookie approach.
 */
const PREFIX = 'fixit_chat_';

export function saveSession(sessionId: string, visitorToken: string, glpiUserId?: string): void {
  try {
    localStorage.setItem(`${PREFIX}session_id`, sessionId);
    localStorage.setItem(`${PREFIX}visitor_token`, visitorToken);
    if (glpiUserId) {
      localStorage.setItem(`${PREFIX}glpi_user_id`, glpiUserId);
    }
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

export function getSavedGlpiUserId(): string | null {
  try {
    return localStorage.getItem(`${PREFIX}glpi_user_id`);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(`${PREFIX}session_id`);
    localStorage.removeItem(`${PREFIX}visitor_token`);
    localStorage.removeItem(`${PREFIX}glpi_user_id`);
  } catch {
    // ignore
  }
}
