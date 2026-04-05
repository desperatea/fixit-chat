import axios from 'axios';
import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { playMessageSound, playSessionSound } from './useSound';
import type { Message, WSEvent } from '../types';

const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// Singleton WebSocket — shared across all components
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', data: {} }));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function refreshTokenIfNeeded() {
  try {
    await axios.post('/api/v1/admin/auth/refresh', null, { withCredentials: true });
  } catch {
    // Refresh failed — token may still be valid, try connecting anyway
  }
}

function connect() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  // Refresh access token before (re)connecting to ensure cookie is fresh
  refreshTokenIfNeeded().then(() => {
    doConnect();
  });
}

function doConnect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws/admin`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectAttempts = 0;
    startHeartbeat();
  };

  ws.onmessage = (e) => {
    try {
      const event: WSEvent = JSON.parse(e.data);
      if (event.type === 'pong') return; // heartbeat response, ignore
      handleEvent(event);
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    ws = null;
    stopHeartbeat();
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
  stopHeartbeat();
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
    case 'session_closed': {
      const closedId = data.session_id as string;
      store.updateSessionInList({ id: closedId, status: 'closed' });
      store.fetchSessions();
      // Reload messages if agent is viewing this chat (to show system close message)
      if (store.activeSession?.id === closedId) {
        store.fetchMessages(closedId);
        store.fetchSession(closedId);
      }
      break;
    }
    case 'session_rated': {
      const newRating = {
        id: data.rating_id as string,
        rating: data.rating as number,
        created_at: data.created_at as string,
      };
      store.addRating(data.session_id as string, newRating);
      store.fetchSessions();
      break;
    }
    case 'session_reopened': {
      const reopenedId = data.session_id as string;
      store.updateSessionInList({ id: reopenedId, status: 'open' });
      store.fetchSessions();
      if (store.activeSession?.id === reopenedId) {
        store.fetchSession(reopenedId);
      }
      break;
    }
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
