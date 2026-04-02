import type { Message, WidgetSettings, WSEvent } from '../types';
import * as api from '../services/api';
import { WebSocketClient } from '../services/websocket';
import { clearSession, getSession, saveSession } from '../services/storage';
import { playNotificationSound } from '../services/sound';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { PreChatForm } from './PreChatForm';
import { RatingForm } from './RatingForm';

type ChatState = 'form' | 'chat' | 'closed';

export class ChatWindow {
  private el: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  state: ChatState = 'form';
  private sessionId: string | null = null;
  private visitorToken: string | null = null;
  private ws: WebSocketClient | null = null;
  private messageList: MessageList;
  private messageInput: MessageInput;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private settings: WidgetSettings,
    private wsUrl: string,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'fixit-window';
    this.el.style.display = 'none';

    // Header (built with DOM API to prevent XSS)
    const header = document.createElement('div');
    header.className = 'fixit-header';
    header.style.backgroundColor = settings.primary_color;
    if (settings.logo_url) {
      const logo = document.createElement('img');
      logo.className = 'fixit-header-logo';
      logo.src = settings.logo_url;
      logo.alt = '';
      header.appendChild(logo);
    }
    const title = document.createElement('span');
    title.className = 'fixit-header-title';
    title.textContent = settings.header_title;
    header.appendChild(title);
    this.el.appendChild(header);

    // Body
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'fixit-body';
    this.el.appendChild(this.bodyEl);

    // Init components
    this.messageList = new MessageList();
    this.messageInput = new MessageInput({
      primaryColor: settings.primary_color,
      allowedFileTypes: settings.allowed_file_types,
      maxFileSizeMb: settings.max_file_size_mb,
      onSend: (content) => this.handleSend(content),
      onTyping: () => this.handleTyping(),
      onFile: (file) => this.handleFile(file),
    });

    // Try to restore session
    this.tryRestoreSession();
  }

  render(): HTMLDivElement {
    return this.el;
  }

  toggle(show: boolean): void {
    this.el.style.display = show ? 'flex' : 'none';
  }

  private async tryRestoreSession(): Promise<void> {
    const saved = getSession();
    if (saved) {
      try {
        const sessionInfo = await api.getSessionInfo(saved.sessionId, saved.visitorToken);
        this.sessionId = saved.sessionId;
        this.visitorToken = saved.visitorToken;

        const messages = await api.getMessages(saved.sessionId, saved.visitorToken).catch(() => []);

        if (sessionInfo.status === 'closed') {
          this.showChat(messages);
          this.showClosed(!!(sessionInfo as Record<string, unknown>).rating);
          return;
        }

        this.showChat(messages);
        return;
      } catch {
        clearSession();
      }
    }
    this.showForm();
  }

  private showForm(): void {
    this.state = 'form';
    this.bodyEl.innerHTML = '';

    const welcome = document.createElement('div');
    welcome.className = 'fixit-welcome';
    welcome.textContent = this.settings.welcome_message;
    this.bodyEl.appendChild(welcome);

    const form = new PreChatForm({
      fields: this.settings.form_fields,
      privacyPolicyUrl: this.settings.privacy_policy_url,
      primaryColor: this.settings.primary_color,
      onSubmit: (data) => this.handleFormSubmit(data, form),
    });
    this.bodyEl.appendChild(form.render());
  }

  private showChat(messages: Message[] = []): void {
    this.state = 'chat';
    this.bodyEl.innerHTML = '';

    this.bodyEl.appendChild(this.messageList.render());

    // Close session button
    const closeBar = document.createElement('div');
    closeBar.className = 'fixit-close-bar';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'fixit-close-btn';
    closeBtn.textContent = 'Завершить чат';
    closeBtn.addEventListener('click', () => this.handleClose());
    closeBar.appendChild(closeBtn);
    this.bodyEl.appendChild(closeBar);

    const inputEl = this.messageInput.render();
    inputEl.style.display = '';
    this.messageInput.setDisabled(false);
    this.bodyEl.appendChild(inputEl);

    if (messages.length > 0) {
      this.messageList.setMessages(messages);
    }

    this.connectWebSocket();

    // Mark unread agent messages as read
    const unreadIds = messages
      .filter((m) => m.sender_type === 'agent' && !m.is_read)
      .map((m) => m.id);
    if (unreadIds.length > 0 && this.sessionId && this.visitorToken) {
      api.markRead(this.sessionId, this.visitorToken, unreadIds).catch(() => {});
    }
  }

  private showClosed(alreadyRated = false): void {
    this.state = 'closed';

    // Hide input, close button
    const inputEl = this.messageInput.render();
    if (inputEl.parentElement) inputEl.style.display = 'none';
    const closeBar = this.bodyEl.querySelector('.fixit-close-bar');
    if (closeBar) (closeBar as HTMLElement).style.display = 'none';

    if (!alreadyRated) {
      const ratingForm = new RatingForm({
        primaryColor: this.settings.primary_color,
        onRate: (rating) => this.handleRate(rating),
      });
      this.bodyEl.appendChild(ratingForm.render());
    }

    // "New Chat" button
    const newChatBtn = document.createElement('button');
    newChatBtn.className = 'fixit-new-chat-btn';
    newChatBtn.textContent = 'Начать новый чат';
    newChatBtn.style.backgroundColor = this.settings.primary_color;
    newChatBtn.addEventListener('click', () => this.handleNewChat());
    this.bodyEl.appendChild(newChatBtn);
  }

  private handleNewChat(): void {
    this.ws?.disconnect();
    this.ws = null;
    clearSession();
    this.sessionId = null;
    this.visitorToken = null;
    this.showForm();
  }

  private onSessionReopened(): void {
    if (this.state !== 'closed') return;
    this.state = 'chat';

    // Show input back
    const inputEl = this.messageInput.render();
    inputEl.style.display = '';
    this.messageInput.setDisabled(false);

    // Remove rating form and new-chat button
    const rating = this.bodyEl.querySelector('.fixit-rating');
    if (rating) rating.remove();
    const newChatBtn = this.bodyEl.querySelector('.fixit-new-chat-btn');
    if (newChatBtn) newChatBtn.remove();

    // Restore close bar
    const closeBar = this.bodyEl.querySelector('.fixit-close-bar');
    if (closeBar) (closeBar as HTMLElement).style.display = '';
  }

  private async handleFormSubmit(data: Record<string, string>, form: PreChatForm): Promise<void> {
    form.setLoading(true);

    try {
      const session = await api.createSession({
        visitor_name: data.visitor_name || '',
        visitor_phone: data.visitor_phone,
        visitor_org: data.visitor_org,
        initial_message: data.initial_message || '',
        consent_given: true,
      });

      this.sessionId = session.id;
      this.visitorToken = session.visitor_token;
      saveSession(session.id, session.visitor_token);

      // Show chat immediately with the initial message
      const initialMsg: Message = {
        id: 'initial',
        session_id: session.id,
        sender_type: 'visitor',
        sender_id: null,
        content: data.initial_message || '',
        is_read: false,
        created_at: session.created_at,
        attachments: [],
      };
      this.showChat([initialMsg]);
    } catch (err) {
      form.setLoading(false);
      form.showError(err instanceof Error ? err.message : 'Ошибка создания сессии');
    }
  }

  private async handleSend(content: string): Promise<void> {
    if (!this.sessionId || !this.visitorToken) return;

    try {
      const msg = await api.sendMessage(this.sessionId, this.visitorToken, content);
      this.messageList.appendMessage(msg);
    } catch {
      // Fallback: send via WebSocket
      this.ws?.send('message', { content });
    }
  }

  private async handleClose(): Promise<void> {
    if (!this.sessionId || !this.visitorToken) return;
    try {
      await api.closeSession(this.sessionId, this.visitorToken);
      this.showClosed();
    } catch {
      // ignore
    }
  }

  private handleTyping(): void {
    this.ws?.send('typing', {});
  }

  private async handleFile(file: File): Promise<void> {
    if (!this.sessionId || !this.visitorToken) return;
    try {
      await api.uploadFile(this.sessionId, this.visitorToken, file);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }

  private async handleRate(rating: number): Promise<void> {
    if (!this.sessionId || !this.visitorToken) return;
    try {
      await api.rateSession(this.sessionId, this.visitorToken, rating);
    } catch {
      // ignore
    }
  }

  private connectWebSocket(): void {
    if (!this.sessionId || !this.visitorToken) return;

    // Token sent in first message, NOT in URL (security)
    const url = `${this.wsUrl}/ws/chat/${this.sessionId}`;
    this.ws = new WebSocketClient(url, {
      type: 'auth',
      data: { token: this.visitorToken },
    });

    this.ws.on((event: WSEvent) => {
      switch (event.type) {
        case 'message':
          this.onWsMessage(event.data as Record<string, unknown>);
          break;
        case 'typing':
          this.onWsTyping();
          break;
        case 'read':
          break;
        case 'session_closed':
          this.showClosed();
          break;
        case 'session_reopened':
          this.onSessionReopened();
          break;
      }
    });

    this.ws.connect();
  }

  private onWsMessage(data: Record<string, unknown>): void {
    if (data.sender_type === 'visitor') return; // own message, already shown

    const msg: Message = {
      id: data.id as string,
      session_id: this.sessionId!,
      sender_type: data.sender_type as 'agent',
      sender_id: (data.sender_id as string) || null,
      content: data.content as string,
      is_read: false,
      created_at: data.created_at as string,
      attachments: [],
    };

    this.messageList.appendMessage(msg);
    this.messageList.showTyping(false);
    playNotificationSound();

    // Auto mark as read
    if (this.sessionId && this.visitorToken) {
      api.markRead(this.sessionId, this.visitorToken, [msg.id]).catch(() => {});
    }
  }

  private onWsTyping(): void {
    this.messageList.showTyping(true);
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.messageList.showTyping(false);
    }, 3000);
  }

  destroy(): void {
    this.ws?.disconnect();
    if (this.typingTimer) clearTimeout(this.typingTimer);
  }
}
