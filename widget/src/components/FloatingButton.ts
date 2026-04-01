export class FloatingButton {
  private el: HTMLButtonElement;
  private badge: HTMLSpanElement;
  private unreadCount = 0;

  constructor(color: string, private onClick: () => void) {
    this.el = document.createElement('button');
    this.el.className = 'fixit-fab';
    this.el.setAttribute('aria-label', 'Открыть чат');
    this.el.style.backgroundColor = color;
    this.el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    this.el.addEventListener('click', this.onClick);

    this.badge = document.createElement('span');
    this.badge.className = 'fixit-fab-badge';
    this.badge.style.display = 'none';
    this.el.appendChild(this.badge);
  }

  render(): HTMLButtonElement {
    return this.el;
  }

  setUnread(count: number): void {
    this.unreadCount = count;
    if (count > 0) {
      this.badge.textContent = count > 9 ? '9+' : String(count);
      this.badge.style.display = 'flex';
    } else {
      this.badge.style.display = 'none';
    }
  }

  setOpen(isOpen: boolean): void {
    this.el.innerHTML = isOpen
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>`;
    if (!isOpen) {
      this.el.appendChild(this.badge);
      this.setUnread(this.unreadCount);
    }
  }
}
