import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { playMessageSound, playSessionSound } from './useSound';
import type { Message, WSEvent } from '../types';

const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// Singleton WebSocket — shared across all components
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function connect() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws/admin`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectAttempts = 0;
  };

  ws.onmessage = (e) => {
    try {
      const event: WSEvent = JSON.parse(e.data);
      handleEvent(event);
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    ws = null;
    // Auto-reconnect with backoff
    const delay = Math.min(2000 * 2 ** reconnectAttempts, 30000);
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  ws?.close();
  ws = null;
}

export function useWebSocket() {
  useEffect(() => {
    connect();
    return () => {
      // Don't disconnect on unmount — singleton persists across route changes
    };
  }, []);

  const sendTyping = useCallback((sessionId: string) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'typing',
        data: { session_id: sessionId },
      }));
    }
  }, []);

  return { sendTyping };
}

// Call on logout to clean up
export function disconnectWebSocket() {
  disconnect();
}

function handleEvent(event: WSEvent) {
  const store = useSessionStore.getState();
  const data = event.data;

  switch (event.type) {
    case 'new_message': {
      const msg: Message = {
        id: data.id as string,
        session_id: data.session_id as string,
        sender_type: data.sender_type as 'visitor',
        sender_id: null,
        content: data.content as string,
        is_read: false,
        read_at: null,
        created_at: data.created_at as string,
        attachments: [],
      };
      store.addIncomingMessage(msg);
      store.fetchSessions();
      playMessageSound();
      break;
    }
    case 'new_session':
      store.fetchSessions();
      playSessionSound();
      break;
    case 'session_closed':
      store.updateSessionInList({
        id: data.session_id as string,
        status: 'closed',
      });
      store.fetchSessions();
      break;
    case 'session_rated':
      store.updateSessionInList({
        id: data.session_id as string,
        rating: data.rating as number,
      });
      store.fetchSessions();
      break;
    case 'typing': {
      const sid = data.session_id as string;
      store.setTyping(sid);
      if (typingTimers[sid]) clearTimeout(typingTimers[sid]);
      typingTimers[sid] = setTimeout(() => {
        store.clearTyping(sid);
        delete typingTimers[sid];
      }, 3000);
      break;
    }
  }
}
