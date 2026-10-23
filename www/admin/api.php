<?php
/*
 * Mwasa Musiki : API de l'administration (hébergement OVH, PHP 7.4 ou plus).
 *
 * - L'identifiant et le mot de passe sont lus dans un fichier .env qui n'est jamais publié sur GitHub.
 *   Emplacement recommandé : à la racine de l'hébergement, À CÔTÉ du dossier www (donc inaccessible depuis le web).
 * - Les modifications sont écrites directement sur l'hébergement : content/site.json, index.html, img/uploads/.
 * - Une copie de sauvegarde est gardée avant chaque publication (30 dernières).
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

define('WWW', realpath(__DIR__ . '/..'));
define('MAX_LOGIN_FAILS', 5);          // essais ratés autorisés…
define('LOCK_SECONDS', 15 * 60);       // …par adresse IP sur 15 minutes
define('REMEMBER_DAYS', 30);

function out($code, $data) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail($code, $msg) { out($code, array('ok' => false, 'error' => $msg)); }

/* ---------- Configuration (.env) ---------- */
function env_file() {
    foreach (array(dirname(WWW) . '/.env', WWW . '/.env', __DIR__ . '/.env') as $f) {
        if (is_file($f) && is_readable($f)) return $f;
    }
    return null;
}
function load_env() {
    $f = env_file();
    if (!$f) fail(500, "Fichier .env introuvable. Placez-le à la racine de l'hébergement, à côté du dossier www.");
    $env = array();
    foreach (preg_split('/\r\n|\r|\n/', file_get_contents($f)) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $p = strpos($line, '=');
        if ($p === false) continue;
        $k = trim(substr($line, 0, $p));
        $v = trim(substr($line, $p + 1));
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) $v = substr($v, 1, -1);
        $env[$k] = $v;
    }
    if (empty($env['ADMIN_USER']) || (empty($env['ADMIN_PASSWORD']) && empty($env['ADMIN_PASSWORD_HASH']))) {
        fail(500, 'Le fichier .env doit contenir ADMIN_USER et ADMIN_PASSWORD.');
    }
    return $env;
}

/* ---------- Dossier de données privé (sessions, essais de connexion, sauvegardes) ---------- */
function data_dir() {
    static $dir = null;
    if ($dir !== null) return $dir;
    $candidates = array(dirname(WWW) . '/mwasa-data', __DIR__ . '/data');
    foreach ($candidates as $d) {
        if (!is_dir($d)) @mkdir($d, 0700, true);
        if (is_dir($d) && is_writable($d)) {
            if (strpos($d, WWW) === 0 && !is_file($d . '/.htaccess')) {
                @file_put_contents($d . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
            }
            foreach (array('sessions', 'backups', 'attempts') as $sub) if (!is_dir("$d/$sub")) @mkdir("$d/$sub", 0700);
            return $dir = $d;
        }
    }
    fail(500, "Impossible d'écrire sur l'hébergement (dossier de données).");
}

/* ---------- Session ---------- */
function is_https() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
}
function start_session($remember = null) {
    $path = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
    ini_set('session.save_path', data_dir() . '/sessions');
    ini_set('session.gc_maxlifetime', (string) (REMEMBER_DAYS * 86400));
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('mwasa_admin');
    $lifetime = $remember ? REMEMBER_DAYS * 86400 : 0;
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(array('lifetime' => $lifetime, 'path' => $path, 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict'));
    } else {
        session_set_cookie_params($lifetime, $path . '; samesite=Strict', '', is_https(), true);
    }
    session_start();
}
function logged_in() {
    return !empty($_SESSION['user']) && !empty($_SESSION['csrf']);
}
function require_login() {
    if (!logged_in()) fail(401, 'Session expirée. Reconnectez-vous.');
}
function require_csrf() {
    $h = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if (!logged_in() || !is_string($h) || !hash_equals($_SESSION['csrf'], $h)) fail(403, 'Requête refusée (jeton de sécurité invalide). Rechargez la page.');
}
function json_body() {
    $ct = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($ct, 'application/json') !== 0) fail(415, 'Format de requête non accepté.');
    $raw = file_get_contents('php://input');
    $j = json_decode($raw, true);
    if (!is_array($j)) fail(400, 'Requête illisible.');
    return $j;
}

/* ---------- Limitation des essais de connexion ---------- */
function client_ip() { return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'inconnue'; }
function attempts_file() { return data_dir() . '/attempts/' . hash('sha256', client_ip()) . '.json'; }
function recent_fails() {
    $f = attempts_file();
    $list = is_file($f) ? json_decode((string) file_get_contents($f), true) : array();
    if (!is_array($list)) $list = array();
    $now = time();
    return array_values(array_filter($list, function ($t) use ($now) { return is_int($t) && $t > $now - LOCK_SECONDS; }));
}
function add_fail() { $l = recent_fails(); $l[] = time(); @file_put_contents(attempts_file(), json_encode($l), LOCK_EX); return count($l); }
function clear_fails() { @unlink(attempts_file()); }

/* ---------- Fichiers ---------- */
function atomic_write($path, $content) {
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, "Impossible de créer le dossier $dir.");
    $tmp = $dir . '/.tmp-' . bin2hex(random_bytes(6));
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) fail(500, "Impossible d'écrire " . basename($path) . '.');
    @chmod($tmp, 0644);
    if (!@rename($tmp, $path)) { @unlink($tmp); fail(500, "Impossible de remplacer " . basename($path) . '.'); }
}
function content_path() { return WWW . '/content/site.json'; }
function content_version($text) { return sha1($text); }
function backup_current() {
    $dir = data_dir() . '/backups';
    $stamp = date('Ymd-His');
    if (is_file(content_path())) @copy(content_path(), "$dir/$stamp-site.json");
    if (is_file(WWW . '/index.html')) @copy(WWW . '/index.html', "$dir/$stamp-index.html");
    $files = glob("$dir/*-site.json");
    if ($files && count($files) > 30) {
        sort($files);
        foreach (array_slice($files, 0, count($files) - 30) as $old) { @unlink($old); @unlink(str_replace('-site.json', '-index.html', $old)); }
    }
}

/* ---------- Routes ---------- */
$action = isset($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'ping') out(200, array('ok' => true, 'php' => PHP_VERSION, 'env' => env_file() !== null));

$env = load_env();
start_session();

switch ($action) {
    case 'session':
        out(200, array('ok' => true, 'logged' => logged_in(), 'user' => logged_in() ? $_SESSION['user'] : null, 'csrf' => logged_in() ? $_SESSION['csrf'] : null));

    case 'login':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        $fails = recent_fails();
        if (count($fails) >= MAX_LOGIN_FAILS) {
            $wait = max(1, (int) ceil((min($fails) + LOCK_SECONDS - time()) / 60));
            fail(429, "Trop d'essais. Réessayez dans $wait minute" . ($wait > 1 ? 's' : '') . '.');
        }
        $b = json_body();
        $user = isset($b['user']) && is_string($b['user']) ? trim($b['user']) : '';
        $pass = isset($b['pass']) && is_string($b['pass']) ? $b['pass'] : '';
        $userOk = hash_equals(strtolower(trim($env['ADMIN_USER'])), strtolower($user));
        if (!empty($env['ADMIN_PASSWORD_HASH'])) $passOk = password_verify($pass, $env['ADMIN_PASSWORD_HASH']);
        else $passOk = hash_equals((string) $env['ADMIN_PASSWORD'], $pass);
        if (!$userOk || !$passOk) {
            usleep(random_int(300000, 700000));
            $n = add_fail();
            $left = MAX_LOGIN_FAILS - $n;
            fail(401, 'Identifiant ou mot de passe incorrect.' . ($left > 0 && $left <= 2 ? " Encore $left essai" . ($left > 1 ? 's' : '') . ' avant blocage temporaire.' : ''));
        }
        clear_fails();
        $remember = !empty($b['remember']);
        session_write_close();
        start_session($remember);
        session_regenerate_id(true);
        $_SESSION['user'] = $env['ADMIN_USER'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        $_SESSION['since'] = time();
        out(200, array('ok' => true, 'user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']));

    case 'logout':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        $_SESSION = array();
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        out(200, array('ok' => true));

    case 'content':
        require_login();
        $text = is_file(content_path()) ? (string) file_get_contents(content_path()) : '';
        if ($text === '') fail(500, 'Fichier de contenu introuvable (content/site.json).');
        out(200, array('ok' => true, 'content' => $text, 'version' => content_version($text)));

    case 'upload':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf();
        $b = json_body();
        $path = isset($b['path']) && is_string($b['path']) ? $b['path'] : '';
        if (!preg_match('#^img/uploads/[a-z0-9-]{1,80}\.webp$#', $path)) fail(400, 'Nom de photo invalide.');
        $bin = base64_decode(isset($b['data']) ? (string) $b['data'] : '', true);
        if ($bin === false || strlen($bin) < 100) fail(400, 'Photo illisible.');
        if (strlen($bin) > 6 * 1024 * 1024) fail(413, 'Photo trop lourde (6 Mo maximum).');
        if (substr($bin, 0, 4) !== 'RIFF' || substr($bin, 8, 4) !== 'WEBP') fail(400, "Ce fichier n'est pas une image WebP.");
        atomic_write(WWW . '/' . $path, $bin);
        out(200, array('ok' => true, 'path' => $path));

    case 'publish':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf();
        $b = json_body();
        $content = isset($b['content']) && is_string($b['content']) ? $b['content'] : '';
        $html = isset($b['html']) && is_string($b['html']) ? $b['html'] : '';
        $base = isset($b['base']) && is_string($b['base']) ? $b['base'] : '';
        if (strlen($content) > 2 * 1024 * 1024 || strlen($html) > 3 * 1024 * 1024) fail(413, 'Contenu trop volumineux.');
        $decoded = json_decode($content, true);
        if (!is_array($decoded) || !isset($decoded['hero'])) fail(400, 'Contenu invalide.');
        if (stripos(ltrim($html), '<!doctype html>') !== 0) fail(400, 'Page invalide.');
        $current = is_file(content_path()) ? (string) file_get_contents(content_path()) : '';
        if ($current !== '' && !hash_equals(content_version($current), $base)) {
            fail(409, "Le site a été modifié par quelqu'un d'autre depuis que vous avez ouvert l'administration. Rechargez la page (vos modifications seront proposées en brouillon) puis publiez à nouveau.");
        }
        // Vérifie que les photos référencées existent
        $missing = array();
        array_walk_recursive($decoded, function ($v, $k) use (&$missing) {
            if ($k === 'src' && is_string($v) && strpos($v, 'img/') === 0 && !is_file(WWW . '/' . $v)) $missing[] = $v;
        });
        if ($missing) fail(400, 'Photo manquante sur le serveur : ' . implode(', ', array_slice($missing, 0, 3)));
        backup_current();
        atomic_write(content_path(), $content);
        atomic_write(WWW . '/index.html', $html);
        out(200, array('ok' => true, 'version' => content_version($content)));

    default:
        fail(404, 'Action inconnue.');
}
