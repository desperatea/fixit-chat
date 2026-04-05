/**
 * FixIT Chat Widget Loader
 * Lightweight entry point (~1KB minified).
 * Async loads the main widget bundle.
 *
 * Usage (on your domain):
 *   <script async src="https://chat.fixitmail.ru/widget/loader.js"></script>
 *
 * Usage (by IP / custom server):
 *   <script async src="http://10.66.1.15/widget/loader.js"></script>
 *
 * Optional data attributes (on the script tag):
 *   data-api-url="http://10.66.1.15"   — override API base URL
 *   data-ws-url="ws://10.66.1.15"      — override WebSocket URL
 *   data-glpi-token="..."              — signed GLPI user token (skips pre-chat form)
 */

(function () {
  if (document.getElementById('fixit-chat-root')) return;

  const script = document.currentScript as HTMLScriptElement | null;
  const baseUrl = script?.getAttribute('data-api-url')
    || (script?.src ? new URL(script.src).origin : window.location.origin);

  const wsUrl = script?.getAttribute('data-ws-url')
    || baseUrl.replace(/^http/, 'ws');

  const glpiToken = script?.getAttribute('data-glpi-token') || '';

  // Create root container
  const root = document.createElement('div');
  root.id = 'fixit-chat-root';
  root.dataset.apiUrl = baseUrl;
  root.dataset.wsUrl = wsUrl;
  if (glpiToken) root.dataset.glpiToken = glpiToken;
  document.body.appendChild(root);

  // Async load main widget bundle
  const widgetScript = document.createElement('script');
  widgetScript.type = 'module';
  widgetScript.src = `${baseUrl}/widget/widget.js`;
  document.head.appendChild(widgetScript);
})();
