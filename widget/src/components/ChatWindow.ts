import type { Message, WidgetSettings, WSEvent } from '../types';
import * as api from '../services/api';
import { WebSocketClient } from '../services/websocket';
import { clearSession, getSession, getSavedGlpiUserId, saveSession } from '../services/storage';
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
    private glpiToken?: string,
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

  /** Extract user_id from GLPI token payload (base64url.signature). */
  private getGlpiUserId(): string | null {
    if (!this.glpiToken) return null;
    try {
      const payloadB64 = this.glpiToken.split('.')[0];
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json).user_id || null;
    } catch {
      return null;
    }
  }

  private async tryRestoreSession(): Promise<void> {
    // If GLPI user changed — clear old session
    const glpiUserId = this.getGlpiUserId();
    if (glpiUserId) {
      const savedGlpiId = getSavedGlpiUserId();
      if (savedGlpiId && savedGlpiId !== glpiUserId) {
        clearSession();
      }
    }

    // 1. Try restoring existing session from localStorage
    const saved = getSession();
    if (saved) {
      try {
        const sessionInfo = await api.getSessionInfo(saved.sessionId, saved.visitorToken);
        this.sessionId = saved.sessionId;
        this.visitorToken = saved.visitorToken;

        const messages = await api.getMessages(saved.sessionId, saved.visitorToken).catch(() => []);

        if (sessionInfo.status === 'closed') {
          const hasRatings = !!((sessionInfo as Record<string, unknown>).latest_rating);
          this.showChat(messages, true);
          this.showClosed(hasRatings);
          return;
        }

        this.showChat(messages);
        return;
      } catch {
        clearSession();
      }
    }

    // 2. If GLPI token present — show prompt to start chat (no form needed)
    if (this.glpiToken) {
      this.showGlpiPrompt();
      return;
    }

    this.showForm();
  }

  private showGlpiPrompt(): void {
    this.state = 'form';
    this.bodyEl.innerHTML = '';

    const prompt = document.createElement('div');
    prompt.className = 'fixit-welcome';
    prompt.textContent = 'Вы авторизованы. Опишите вашу проблему:';
    this.bodyEl.appendChild(prompt);

    // Simple message input + send button
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'padding: 12px;';

    const textarea = document.createElement('textarea');
    textarea.className = 'fixit-input-field';
    textarea.placeholder = 'Сообщение...';
    textarea.rows = 3;
    textarea.style.cssText = 'width:100%;resize:vertical;padding:8px;border:1px solid #ddd;border-radius:6px;font:inherit;box-sizing:border-box;';
    inputWrap.appendChild(textarea);

    const btn = document.createElement('button');
    btn.className = 'fixit-submit-btn';
    btn.textContent = 'Начать чат';
    btn.style.cssText = `width:100%;margin-top:8px;padding:10px;border:none;border-radius:6px;color:#fff;font:inherit;cursor:pointer;background:${this.settings.primary_color};`;
    btn.addEventListener('click', () => {
      const msg = textarea.value.trim();
      if (!msg) return;
      btn.disabled = true;
      btn.textContent = 'Создание...';
      this.handleGlpiAutoSession(msg);
    });
    inputWrap.appendChild(btn);

    this.bodyEl.appendChild(inputWrap);
  }

  private async handleGlpiAutoSession(message: string): Promise<void> {
    try {
      const session = await api.createGlpiSession(this.glpiToken!, message);
      this.sessionId = session.id;
      this.visitorToken = session.visitor_token;
      saveSession(session.id, session.visitor_token, this.getGlpiUserId() || undefined);

      // Backend may return existing session — load messages
      const messages = await api.getMessages(session.id, session.visitor_token).catch(() => []);
      this.showChat(messages.length > 0 ? messages : [{
        id: 'initial',
        session_id: session.id,
        sender_type: 'visitor',
        sender_id: null,
        content: message,
        is_read: false,
        created_at: session.created_at,
        attachments: [],
      }]);
    } catch (err) {
      console.warn('[FixIT] GLPI auto-session failed, showing form:', err);
      this.showForm();
    }
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

  private showChat(messages: Message[] = [], isClosed = false): void {
    this.state = 'chat';
    this.bodyEl.innerHTML = '';

    // Set auth context for file download URLs
    if (this.visitorToken) {
      this.messageList.setContext(this.wsUrl.replace(/^ws/, 'http'), this.visitorToken);
    }

    this.bodyEl.appendChild(this.messageList.render());

    // Close session button
    const closeBar = document.createElement('div');
    closeBar.className = 'fixit-close-bar';
    closeBar.style.display = isClosed ? 'none' : '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'fixit-close-btn';
    closeBtn.textContent = 'Завершить чат';
    closeBtn.addEventListener('click', () => this.handleClose());
    closeBar.appendChild(closeBtn);
    this.bodyEl.appendChild(closeBar);

    const inputEl = this.messageInput.render();
    inputEl.style.display = isClosed ? 'none' : '';
    this.messageInput.setDisabled(isClosed);
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

    if (alreadyRated) {
      // Already rated — just show continue button (enabled)
      const continueBtn = document.createElement('button');
      continueBtn.className = 'fixit-continue-btn';
      continueBtn.textContent = 'Продолжить чат';
      continueBtn.style.backgroundColor = this.settings.primary_color;
      continueBtn.addEventListener('click', () => this.handleContinueChat());
      this.bodyEl.appendChild(continueBtn);
      return;
    }

    // Show rating form
    const ratingForm = new RatingForm({
      primaryColor: this.settings.primary_color,
      onRate: (rating) => {
        this.handleRate(rating);
        // Enable continue button after rating
        const btn = this.bodyEl.querySelector('.fixit-continue-btn') as HTMLButtonElement;
        if (btn) {
          btn.disabled = false;
        }
      },
    });
    this.bodyEl.appendChild(ratingForm.render());

    // "Continue Chat" button — disabled until rated
    const continueBtn = document.createElement('button');
    continueBtn.className = 'fixit-continue-btn';
    continueBtn.textContent = 'Продолжить чат';
    continueBtn.style.backgroundColor = this.settings.primary_color;
    continueBtn.disabled = true;
    continueBtn.addEventListener('click', () => this.handleContinueChat());
    this.bodyEl.appendChild(continueBtn);
  }

  private async handleContinueChat(): Promise<void> {
    if (!this.sessionId || !this.visitorToken) return;
    try {
      await api.reopenSession(this.sessionId, this.visitorToken);
      this.onSessionReopened();
    } catch {
      // ignore — agent may have already reopened
      this.onSessionReopened();
    }
  }

  private onSessionReopened(): void {
    if (this.state !== 'closed') return;
    this.state = 'chat';

    // Show input back
    const inputEl = this.messageInput.render();
    inputEl.style.display = '';
    this.messageInput.setDisabled(false);

    // Remove rating form and continue button
    const rating = this.bodyEl.querySelector('.fixit-rating');
    if (rating) rating.remove();
    const continueBtn = this.bodyEl.querySelector('.fixit-continue-btn');
    if (continueBtn) continueBtn.remove();

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
      const msg = await api.uploadFile(this.sessionId, this.visitorToken, file);
      this.messageList.appendMessage(msg);
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
      attachments: (data.attachments as Message['attachments']) || [],
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
