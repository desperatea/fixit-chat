interface MessageInputOptions {
  primaryColor: string;
  allowedFileTypes: string[];
  maxFileSizeMb: number;
  onSend: (content: string) => void;
  onTyping: () => void;
  onFile: (file: File) => void;
}

export class MessageInput {
  private el: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: MessageInputOptions) {
    this.el = document.createElement('div');
    this.el.className = 'fixit-input';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'fixit-input-text';
    this.textarea.placeholder = 'Введите сообщение...';
    this.textarea.rows = 1;

    const fileBtn = document.createElement('button');
    fileBtn.className = 'fixit-input-file';
    fileBtn.type = 'button';
    fileBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>`;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.accept = options.allowedFileTypes.map((t) => `.${t}`).join(',');

    const sendBtn = document.createElement('button');
    sendBtn.className = 'fixit-input-send';
    sendBtn.type = 'button';
    sendBtn.style.backgroundColor = options.primaryColor;
    sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>`;

    this.el.appendChild(fileBtn);
    this.el.appendChild(this.textarea);
    this.el.appendChild(sendBtn);
    this.el.appendChild(fileInput);

    // Events
    sendBtn.addEventListener('click', () => this.handleSend());
    fileBtn.addEventListener('click', () => fileInput.click());

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.textarea.addEventListener('input', () => {
      this.autoResize();
      this.handleTyping();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      if (file.size > options.maxFileSizeMb * 1024 * 1024) {
        alert(`Файл слишком большой. Максимум ${options.maxFileSizeMb} МБ`);
        return;
      }

      options.onFile(file);
      fileInput.value = '';
    });
  }

  render(): HTMLDivElement {
    return this.el;
  }

  setDisabled(disabled: boolean): void {
    this.textarea.disabled = disabled;
    const sendBtn = this.el.querySelector('.fixit-input-send') as HTMLButtonElement;
    if (sendBtn) sendBtn.disabled = disabled;
  }

  private handleSend(): void {
    const text = this.textarea.value.trim();
    if (!text) return;
    this.options.onSend(text);
    this.textarea.value = '';
    this.autoResize();
  }

  private handleTyping(): void {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.options.onTyping();
    this.typingTimeout = setTimeout(() => {
      this.typingTimeout = null;
    }, 2000);
  }

  private autoResize(): void {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = Math.min(this.textarea.scrollHeight, 120) + 'px';
  }
}
