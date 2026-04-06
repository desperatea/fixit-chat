/**
 * FixIT Chat Widget — GLPI injection (anonymous/login page)
 * Loads widget without GLPI token — user fills form manually.
 */
(function() {
    if (document.getElementById("fixit-chat-root")) return;
    var CHAT_URL = "http://localhost";
    var s = document.createElement("script");
    s.async = true;
    s.src = CHAT_URL + "/widget/loader.js";
    s.setAttribute("data-api-url", CHAT_URL);
    s.setAttribute("data-ws-url", CHAT_URL.replace(/^http/, "ws"));
    document.body.appendChild(s);
})();
