import { initApi, fetchSettings } from './services/api';
import { FloatingButton } from './components/FloatingButton';
import { ChatWindow } from './components/ChatWindow';
import type { WidgetConfig } from './types';
import widgetStyles from './styles/widget.css?inline';

export class FixitChatWidget {
  private shadow: ShadowRoot;
  private chatWindow: ChatWindow | null = null;
  private fab: FloatingButton | null = null;
  private isOpen = false;

  constructor(container: HTMLElement, private config: WidgetConfig) {
    this.shadow = container.attachShadow({ mode: 'open' });
    this.init();
  }

  private async init(): Promise<void> {
    // Inject styles into Shadow DOM
    const style = document.createElement('style');
    style.textContent = widgetStyles;
    this.shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = 'fixit-widget';
    this.shadow.appendChild(wrapper);

    initApi(this.config.apiUrl);

    try {
      const settings = await fetchSettings();

      // FAB button
      this.fab = new FloatingButton(settings.primary_color, () => this.toggle());
      wrapper.appendChild(this.fab.render());

      // Chat window
      this.chatWindow = new ChatWindow(
        settings, this.config.wsUrl, this.config.glpiToken,
      );
      wrapper.appendChild(this.chatWindow.render());
    } catch (err) {
      console.error('[FixIT Chat] Failed to load settings:', err);
    }
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;
    this.chatWindow?.toggle(this.isOpen);
    this.fab?.setOpen(this.isOpen);
  }

  destroy(): void {
    this.chatWindow?.destroy();
  }
}

// Auto-init if loaded as module
const root = document.getElementById('fixit-chat-root');
if (root) {
  const config: WidgetConfig = {
    apiUrl: root.dataset.apiUrl || window.location.origin,
    wsUrl: root.dataset.wsUrl || window.location.origin.replace('http', 'ws'),
    glpiToken: root.dataset.glpiToken || undefined,
  };
  new FixitChatWidget(root, config);
}
