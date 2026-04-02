import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { playMessageSound, playSessionSound } from './useSound';
import type { Message, WSEvent } from '../types';

const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('access_token');
    if (!token) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/admin?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        handleEvent(event);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimer.current = setTimeout(() => {
        // Re-mount will reconnect
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.close();
      wsRef.current = null;
    };
  }, []); // No dependencies — connect once on mount

  const sendTyping = useCallback((sessionId: string) => {
    wsRef.current?.send(JSON.stringify({
      type: 'typing',
      data: { session_id: sessionId },
    }));
  }, []);

  return { sendTyping };
}

function handleEvent(event: WSEvent) {
  // Access store directly via getState() — no reactive dependencies
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
