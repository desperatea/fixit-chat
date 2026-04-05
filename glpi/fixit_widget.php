<?php
/**
 * FixIT Chat Widget — GLPI Integration
 *
 * Embeds the chat widget for logged-in GLPI users.
 * Auto-identifies the user — skips the pre-chat form.
 *
 * Access: http://glpi-host/fixit_widget.php
 */

// ─── Configuration ───
define('FIXIT_SECRET', 'fixit_glpi_shared_secret_change_me_in_production');
define('FIXIT_CHAT_URL', 'http://localhost');

// ─── Load GLPI session (without full page rendering) ───
define('GLPI_ROOT', __DIR__);

// Start session the GLPI way
if (file_exists(GLPI_ROOT . '/inc/based_config.php')) {
    require_once(GLPI_ROOT . '/inc/based_config.php');
    require_once(GLPI_ROOT . '/inc/db.function.php');
}
// Load autoloader
if (file_exists(GLPI_ROOT . '/vendor/autoload.php')) {
    require_once(GLPI_ROOT . '/vendor/autoload.php');
}

// Start session if not started
if (session_status() === PHP_SESSION_NONE) {
    // Use GLPI session cookie name
    $cookie_name = defined('GLPI_SESSION_COOKIE_NAME') ? GLPI_SESSION_COOKIE_NAME : 'glpi_' . md5(GLPI_ROOT);
    if (isset($_COOKIE[$cookie_name])) {
        session_id($_COOKIE[$cookie_name]);
    }
    session_start();
}

// Check if user is logged in
$logged_in = isset($_SESSION['glpiID']) && $_SESSION['glpiID'] > 0;

if (!$logged_in) {
    // Redirect to GLPI login
    header('Location: /');
    exit;
}

// ─── Get user data from GLPI session ───
$user_id   = (string)$_SESSION['glpiID'];
$firstname = $_SESSION['glpifirstname'] ?? '';
$lastname  = $_SESSION['glpirealname'] ?? '';
$fullname  = trim($firstname . ' ' . $lastname);
if (empty($fullname)) {
    $fullname = $_SESSION['glpiname'] ?? ('User #' . $user_id);
}
$phone = $_SESSION['glpiphone'] ?? '';

// ─── Generate signed token ───
$payload = [
    'user_id' => $user_id,
    'name'    => $fullname,
    'phone'   => $phone,
    'org'     => '',
    'exp'     => time() + 3600,
];
$payload_json = json_encode($payload, JSON_UNESCAPED_UNICODE);
$payload_b64  = rtrim(strtr(base64_encode($payload_json), '+/', '-_'), '=');
$signature    = hash_hmac('sha256', $payload_b64, FIXIT_SECRET);
$token        = $payload_b64 . '.' . $signature;

$chat_url = FIXIT_CHAT_URL;
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Техподдержка FixIT — GLPI</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0; padding: 0; background: #f0f2f5; color: #333;
        }
        .topbar {
            background: #3c4b64; color: #fff; padding: 12px 24px;
            display: flex; align-items: center; gap: 16px;
        }
        .topbar img { height: 28px; }
        .topbar .user { margin-left: auto; font-size: 14px; opacity: 0.9; }
        .content { max-width: 800px; margin: 40px auto; padding: 0 20px; }
        .card {
            background: #fff; border-radius: 8px; padding: 24px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1); margin-bottom: 20px;
        }
        .card h2 { margin-top: 0; color: #3c4b64; }
        table { border-collapse: collapse; }
        table td { padding: 6px 16px 6px 0; }
        table td:first-child { font-weight: 600; color: #666; }
        .hint {
            color: #2563eb; font-size: 14px; padding: 12px;
            background: #eff6ff; border-radius: 6px; margin-top: 16px;
        }
        a.back { color: #2563eb; text-decoration: none; }
        a.back:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="topbar">
        <strong>GLPI</strong>
        <span>|</span>
        <span>Техподдержка FixIT</span>
        <span class="user"><?= htmlspecialchars($fullname) ?> (<?= htmlspecialchars($_SESSION['glpiname'] ?? '') ?>)</span>
    </div>

    <div class="content">
        <p><a class="back" href="/">&larr; Вернуться в GLPI</a></p>

        <div class="card">
            <h2>Чат техподдержки</h2>
            <p>Вы авторизованы в GLPI. Виджет чата внизу справа определил вас автоматически &mdash;
               форма ввода данных <strong>пропущена</strong>.</p>
            <table>
                <tr><td>ID:</td><td><?= htmlspecialchars($user_id) ?></td></tr>
                <tr><td>Имя:</td><td><?= htmlspecialchars($fullname) ?></td></tr>
                <tr><td>Логин:</td><td><?= htmlspecialchars($_SESSION['glpiname'] ?? '') ?></td></tr>
                <tr><td>Телефон:</td><td><?= htmlspecialchars($phone ?: '—') ?></td></tr>
            </table>
        </div>

        <div class="hint">
            Нажмите на кнопку чата внизу справа — сессия создастся с вашими данными из GLPI.
        </div>
    </div>

    <!-- FixIT Chat Widget with signed GLPI token -->
    <script async
        src="<?= htmlspecialchars($chat_url) ?>/widget/loader.js"
        data-api-url="<?= htmlspecialchars($chat_url) ?>"
        data-ws-url="<?= htmlspecialchars(str_replace('http', 'ws', $chat_url)) ?>"
        data-glpi-token="<?= htmlspecialchars($token) ?>">
    </script>
</body>
</html>
