import type { WSEvent } from '../types';

type EventHandler = (event: WSEvent) => void;

interface AuthMessage {
  type: string;
  data: Record<string, unknown>;
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private authMessage: AuthMessage | null;
  private handlers: EventHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private closed = false;

  constructor(url: string, authMessage?: AuthMessage) {
    this.url = url;
    this.authMessage = authMessage || null;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.closed = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Send auth as first message if provided
      if (this.authMessage && this.ws) {
        this.ws.send(JSON.stringify(this.authMessage));
      }
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        // Skip auth_ok / pong responses
        if (data.type === 'auth_ok' || data.type === 'pong') return;
        this.handlers.forEach((h) => h(data));
      } catch {
        // ignore invalid messages
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  on(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  off(handler: EventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  send(type: string, data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  disconnect(): void {
    this.closed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', data: {} }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
