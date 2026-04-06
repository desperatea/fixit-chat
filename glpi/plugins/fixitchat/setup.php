<?php
define("PLUGIN_FIXITCHAT_VERSION", "1.0.3");
define("FIXIT_SECRET", "fixit_glpi_shared_secret_change_me_in_production");
define("FIXIT_CHAT_URL", "http://localhost");

function plugin_init_fixitchat() {
    global $PLUGIN_HOOKS;
    $PLUGIN_HOOKS["csrf_compliant"]["fixitchat"] = true;

    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::ADD_JAVASCRIPT]["fixitchat"] = ["js/widget_inject.js"];
    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::ADD_JAVASCRIPT_ANONYMOUS_PAGE]["fixitchat"] = ["js/widget_inject_anon.js"];

    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::INIT_SESSION]["fixitchat"] = "plugin_fixitchat_on_session";
    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::CHANGE_PROFILE]["fixitchat"] = "plugin_fixitchat_on_session";
    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::CHANGE_ENTITY]["fixitchat"] = "plugin_fixitchat_on_session";

    if (isset($_SESSION["glpiID"]) && $_SESSION["glpiID"] > 0 && !isset($_SESSION["fixitchat_token"])) {
        plugin_fixitchat_on_session();
    }

    $tags = [["tag" => "meta", "properties" => ["name" => "fixit-chat-url", "content" => FIXIT_CHAT_URL]]];
    if (!empty($_SESSION["fixitchat_token"])) {
        $tags[] = ["tag" => "meta", "properties" => ["name" => "fixit-glpi-token", "content" => $_SESSION["fixitchat_token"]]];
    }
    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::ADD_HEADER_TAG]["fixitchat"] = $tags;
    $PLUGIN_HOOKS[Glpi\Plugin\Hooks::ADD_HEADER_TAG_ANONYMOUS_PAGE]["fixitchat"] = [
        ["tag" => "meta", "properties" => ["name" => "fixit-chat-url", "content" => FIXIT_CHAT_URL]],
    ];
}

function plugin_fixitchat_on_session() {
    global $DB;
    if (!isset($_SESSION["glpiID"]) || $_SESSION["glpiID"] <= 0) return;

    $uid   = (string)$_SESSION["glpiID"];
    $fn    = $_SESSION["glpifirstname"] ?? "";
    $ln    = $_SESSION["glpirealname"] ?? "";
    $name  = trim($fn . " " . $ln) ?: ($_SESSION["glpiname"] ?? "User #" . $uid);
    $phone = $_SESSION["glpiphone"] ?? "";

    $org = "";
    $entity_id = "";
    try {
        if (isset($DB) && $DB->connected) {
            $sql = "SELECT e.id, e.name FROM glpi_profiles_users pu
                    JOIN glpi_entities e ON pu.entities_id = e.id
                    WHERE pu.users_id = " . (int)$uid . "
                    ORDER BY pu.entities_id DESC LIMIT 1";
            $result = $DB->query($sql);
            if ($result && $row = $DB->fetchAssoc($result)) {
                $org = $row["name"] ?? "";
                $entity_id = (string)($row["id"] ?? "");
            }
        }
    } catch (\Throwable $e) {}

    if (empty($org)) {
        $org = $_SESSION["glpiactive_entity_name"] ?? "";
    }

    $payload = [
        "user_id" => $uid,
        "name" => $name,
        "phone" => $phone,
        "org" => $org,
        "glpi_entity_id" => $entity_id,
        "exp" => time() + 7200,
    ];
    $pjson = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $pb64  = rtrim(strtr(base64_encode($pjson), "+/", "-_"), "=");
    $_SESSION["fixitchat_token"] = $pb64 . "." . hash_hmac("sha256", $pb64, FIXIT_SECRET);
}

function plugin_version_fixitchat() {
    return ["name"=>"FixIT Chat","version"=>PLUGIN_FIXITCHAT_VERSION,"author"=>"FixIT","license"=>"GPLv3",
            "requirements"=>["glpi"=>["min"=>"10.0.0"]]];
}
function plugin_fixitchat_check_prerequisites() { return true; }
function plugin_fixitchat_check_config() { return true; }
function plugin_fixitchat_install() { return true; }
function plugin_fixitchat_uninstall() { return true; }
