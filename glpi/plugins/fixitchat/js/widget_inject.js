/**
 * FixIT Chat Widget — GLPI injection (authenticated)
 * Reads GLPI token from <meta name="fixit-glpi-token"> (set by plugin hook)
 */
(function() {
    if (document.getElementById("fixit-chat-root")) return;
    var metaUrl   = document.querySelector("meta[name=fixit-chat-url]");
    var metaToken = document.querySelector("meta[name=fixit-glpi-token]");
    var chatUrl   = metaUrl ? metaUrl.content : "http://localhost";
    var token     = metaToken ? metaToken.content : "";

    var s = document.createElement("script");
    s.async = true;
    s.src = chatUrl + "/widget/loader.js";
    s.setAttribute("data-api-url", chatUrl);
    s.setAttribute("data-ws-url", chatUrl.replace(/^http/, "ws"));
    if (token) s.setAttribute("data-glpi-token", token);
    document.body.appendChild(s);
})();
