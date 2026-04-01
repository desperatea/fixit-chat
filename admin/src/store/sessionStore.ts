import { create } from 'zustand';
import * as sessionsApi from '../api/sessions';
import type { Message, Note, Session } from '../types';

interface SessionState {
  sessions: Session[];
  total: number;
  loading: boolean;
  activeSession: Session | null;
  messages: Message[];
  notes: Note[];

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
  fetchNotes: (sessionId: string) => Promise<void>;
  addNote: (sessionId: string, content: string) => Promise<void>;
  markRead: (sessionId: string, messageIds: string[]) => Promise<void>;
  addIncomingMessage: (msg: Message) => void;
  updateSessionInList: (session: Partial<Session> & { id: string }) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  total: 0,
  loading: false,
  activeSession: null,
  messages: [],
  notes: [],

  fetchSessions: async (params) => {
    set({ loading: true });
    try {
      const data = await sessionsApi.getSessions(params || {});
      set({ sessions: data.items, total: data.total, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchSession: async (id) => {
    const session = await sessionsApi.getSession(id);
    set({ activeSession: session });
  },

  fetchMessages: async (sessionId) => {
    const messages = await sessionsApi.getMessages(sessionId);
    set({ messages });
  },

  sendMessage: async (sessionId, content) => {
    const msg = await sessionsApi.sendMessage(sessionId, content);
    set({ messages: [...get().messages, msg] });
  },

  closeSession: async (id) => {
    const session = await sessionsApi.closeSession(id);
    set({ activeSession: session });
    get().updateSessionInList(session);
  },

  fetchNotes: async (sessionId) => {
    const notes = await sessionsApi.getNotes(sessionId);
    set({ notes });
  },

  addNote: async (sessionId, content) => {
    const note = await sessionsApi.createNote(sessionId, content);
    set({ notes: [...get().notes, note] });
  },

  markRead: async (sessionId, messageIds) => {
    await sessionsApi.markRead(sessionId, messageIds);
    set({
      messages: get().messages.map((m) =>
        messageIds.includes(m.id) ? { ...m, is_read: true } : m,
      ),
    });
  },

  addIncomingMessage: (msg) => {
    const { messages, activeSession } = get();
    if (activeSession?.id === msg.session_id) {
      set({ messages: [...messages, msg] });
    }
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
