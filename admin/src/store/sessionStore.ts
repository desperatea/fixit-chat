import { create } from 'zustand';
import * as sessionsApi from '../api/sessions';
import { notifyError } from './notificationStore';
import type { Message, Note, Rating, Session } from '../types';

interface SessionState {
  sessions: Session[];
  total: number;
  loading: boolean;
  activeSession: Session | null;
  messages: Message[];
  notes: Note[];
  typingSessionIds: Set<string>;

  fetchSessions: (params?: {
    status?: string;
    search?: string;
    offset?: number;
    limit?: number;
  }) => Promise<void>;
  fetchSession: (id: string) => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  closeSession: (id: string) => Promise<void>;
  reopenSession: (id: string) => Promise<void>;
  fetchNotes: (sessionId: string) => Promise<void>;
  addNote: (sessionId: string, content: string) => Promise<void>;
  markRead: (sessionId: string, messageIds: string[]) => Promise<void>;
  addIncomingMessage: (msg: Message) => void;
  updateSessionInList: (session: Partial<Session> & { id: string }) => void;
  addRating: (sessionId: string, rating: Rating) => void;
  setTyping: (sessionId: string) => void;
  clearTyping: (sessionId: string) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  total: 0,
  loading: false,
  activeSession: null,
  messages: [],
  notes: [],
  typingSessionIds: new Set<string>(),

  fetchSessions: async (params) => {
    set({ loading: true });
    try {
      const data = await sessionsApi.getSessions(params || {});
      set({ sessions: data.items, total: data.total, loading: false });
    } catch (err) {
      set({ loading: false });
      notifyError(err, 'Не удалось загрузить сессии');
    }
  },

  fetchSession: async (id) => {
    try {
      const session = await sessionsApi.getSession(id);
      set({ activeSession: session });
    } catch (err) {
      notifyError(err, 'Не удалось загрузить сессию');
    }
  },

  fetchMessages: async (sessionId) => {
    try {
      const messages = await sessionsApi.getMessages(sessionId);
      set({ messages });
    } catch (err) {
      notifyError(err, 'Не удалось загрузить сообщения');
    }
  },

  sendMessage: async (sessionId, content) => {
    try {
      const msg = await sessionsApi.sendMessage(sessionId, content);
      set({ messages: [...get().messages, msg] });
    } catch (err) {
      notifyError(err, 'Не удалось отправить сообщение');
    }
  },

  closeSession: async (id) => {
    try {
      const session = await sessionsApi.closeSession(id);
      set({ activeSession: session });
      get().updateSessionInList(session);
    } catch (err) {
      notifyError(err, 'Не удалось закрыть сессию');
    }
  },

  reopenSession: async (id) => {
    try {
      const session = await sessionsApi.reopenSession(id);
      set({ activeSession: session });
      get().updateSessionInList(session);
    } catch (err) {
      notifyError(err, 'Не удалось переоткрыть сессию');
    }
  },

  fetchNotes: async (sessionId) => {
    try {
      const notes = await sessionsApi.getNotes(sessionId);
      set({ notes });
    } catch (err) {
      notifyError(err, 'Не удалось загрузить заметки');
    }
  },

  addNote: async (sessionId, content) => {
    try {
      const note = await sessionsApi.createNote(sessionId, content);
      set({ notes: [...get().notes, note] });
    } catch (err) {
      notifyError(err, 'Не удалось добавить заметку');
    }
  },

  markRead: async (sessionId, messageIds) => {
    try {
      await sessionsApi.markRead(sessionId, messageIds);
      set({
        messages: get().messages.map((m) =>
          messageIds.includes(m.id) ? { ...m, is_read: true } : m,
        ),
      });
    } catch {
      // Mark-read failure is non-critical, don't notify
    }
  },

  addIncomingMessage: (msg) => {
    const { messages, activeSession } = get();
    if (activeSession?.id === msg.session_id) {
      set({ messages: [...messages, msg] });
    }
  },

  addRating: (sessionId, rating) => {
    const { activeSession } = get();
    if (activeSession?.id === sessionId) {
      set({
        activeSession: {
          ...activeSession,
          ratings: [...(activeSession.ratings || []), rating],
          latest_rating: rating.rating,
        },
      });
    }
  },

  setTyping: (sessionId) => {
    const next = new Set(get().typingSessionIds);
    next.add(sessionId);
    set({ typingSessionIds: next });
  },

  clearTyping: (sessionId) => {
    const next = new Set(get().typingSessionIds);
    next.delete(sessionId);
    set({ typingSessionIds: next });
  },

  updateSessionInList: (updated) => {
    const { activeSession } = get();
    set({
      sessions: get().sessions.map((s) =>
        s.id === updated.id ? { ...s, ...updated } : s,
      ),
      // Also update active session if agent is viewing it
      activeSession: activeSession?.id === updated.id
        ? { ...activeSession, ...updated }
        : activeSession,
    });
  },
}));
