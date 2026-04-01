import type { Message } from '../types';

export class MessageList {
  private el: HTMLDivElement;
  private listEl: HTMLDivElement;
  private typingEl: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'fixit-messages';

    this.listEl = document.createElement('div');
    this.listEl.className = 'fixit-messages-list';
    this.el.appendChild(this.listEl);

    this.typingEl = document.createElement('div');
    this.typingEl.className = 'fixit-typing';
    this.typingEl.style.display = 'none';
    this.typingEl.innerHTML = '<span class="fixit-typing-dots"><i></i><i></i><i></i></span> печатает...';
    this.el.appendChild(this.typingEl);
  }

  render(): HTMLDivElement {
    return this.el;
  }

  setMessages(messages: Message[]): void {
    this.listEl.innerHTML = '';
    messages.forEach((msg) => this.appendMessage(msg));
    this.scrollToBottom();
  }

  appendMessage(msg: Message): void {
    const bubble = document.createElement('div');
    bubble.className = `fixit-bubble fixit-bubble--${msg.sender_type}`;
    bubble.dataset.messageId = msg.id;

    const content = document.createElement('div');
    content.className = 'fixit-bubble-content';
    content.textContent = msg.content;

    const time = document.createElement('div');
    time.className = 'fixit-bubble-time';
    time.textContent = this.formatTime(msg.created_at);

    bubble.appendChild(content);
    bubble.appendChild(time);

    if (msg.attachments && msg.attachments.length > 0) {
      const attachDiv = document.createElement('div');
      attachDiv.className = 'fixit-bubble-attachments';
      msg.attachments.forEach((att) => {
        const link = document.createElement('a');
        link.className = 'fixit-attachment-link';
        link.textContent = `📎 ${att.file_name}`;
        link.href = '#';
        attachDiv.appendChild(link);
      });
      bubble.appendChild(attachDiv);
    }

    this.listEl.appendChild(bubble);
    this.scrollToBottom();
  }

  showTyping(show: boolean): void {
    this.typingEl.style.display = show ? 'flex' : 'none';
    if (show) this.scrollToBottom();
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.el.scrollTop = this.el.scrollHeight;
    });
  }

  private formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
}
