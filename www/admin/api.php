<?php
/*
 * Mwasa Musiki : API de l'administration (hébergement OVH, PHP 8.1 ou plus).
 *
 * Sécurité :
 * - Identifiants dans un fichier .env HORS du dossier www (jamais sur GitHub). Le mot de passe n'y est conservé
 *   que sous forme d'empreinte (Argon2id ou bcrypt) ; un mot de passe en clair impose un changement à la connexion.
 * - Double authentification facultative par code à 6 chiffres (TOTP, RFC 6238).
 * - Blocage des essais : par adresse IP et pour l'ensemble du site.
 * - Sessions : cookie Secure/HttpOnly/SameSite=Strict, expiration d'inactivité et durée maximale, jeton CSRF.
 * - Journal des connexions, sauvegarde avant chaque publication, écriture atomique des fichiers.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

define('WWW', realpath(__DIR__ . '/..'));
define('IP_MAX_FAILS', 5);              // essais ratés par adresse IP…
define('IP_WINDOW', 15 * 60);           // …sur 15 minutes
define('GLOBAL_MAX_FAILS', 40);         // essais ratés pour tout le site…
define('GLOBAL_WINDOW', 60 * 60);       // …sur 1 heure
define('IDLE_SHORT', 2 * 3600);         // inactivité max sans « rester connecté »
define('MAX_SHORT', 12 * 3600);         // durée max sans « rester connecté »
define('IDLE_LONG', 7 * 86400);         // inactivité max avec « rester connecté »
define('MAX_LONG', 30 * 86400);         // durée max avec « rester connecté »
define('PENDING_2FA', 5 * 60);          // délai pour saisir le code après le mot de passe
define('MIN_PASSWORD', 12);
define('PAGE', 'accueil.html');      // page d'accueil publiée (OVH bloque www/index.html)

function out($code, $data) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail($code, $msg, $extra = array()) { out($code, array_merge(array('ok' => false, 'error' => $msg), $extra)); }

/* ---------- Fichier .env ---------- */
function env_file() {
    foreach (array(dirname(WWW) . '/.env', WWW . '/.env') as $f) {
        if (is_file($f) && is_readable($f)) return $f;
    }
    return null;
}
function parse_env($text) {
    $env = array();
    foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
        $t = trim($line);
        if ($t === '' || $t[0] === '#') continue;
        $p = strpos($t, '=');
        if ($p === false) continue;
        $k = trim(substr($t, 0, $p));
        $v = trim(substr($t, $p + 1));
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) $v = substr($v, 1, -1);
        $env[$k] = $v;
    }
    return $env;
}
function load_env() {
    $f = env_file();
    if (!$f) fail(500, "Fichier .env introuvable. Placez-le à la racine de l'hébergement, à côté du dossier www.");
    $env = parse_env((string) file_get_contents($f));
    if (empty($env['ADMIN_USER']) || (empty($env['ADMIN_PASSWORD']) && empty($env['ADMIN_PASSWORD_HASH']))) {
        fail(500, 'Le fichier .env doit contenir ADMIN_USER et ADMIN_PASSWORD.');
    }
    return $env;
}
/* Modifie des clés du .env en gardant le reste (null = supprimer la clé). */
function update_env(array $changes) {
    $f = env_file();
    $lines = preg_split('/\r\n|\r|\n/', (string) file_get_contents($f));
    $done = array();
    foreach ($lines as $i => $line) {
        $t = trim($line);
        if ($t === '' || $t[0] === '#' || strpos($t, '=') === false) continue;
        $k = trim(substr($t, 0, strpos($t, '=')));
        if (array_key_exists($k, $changes)) {
            if ($changes[$k] === null) unset($lines[$i]);
            else $lines[$i] = $k . "='" . $changes[$k] . "'";
            $done[$k] = true;
        }
    }
    foreach ($changes as $k => $v) if ($v !== null && empty($done[$k])) $lines[] = $k . "='" . $v . "'";
    $text = rtrim(implode("\n", $lines)) . "\n";
    atomic_write($f, $text, 0600);
}

/* ---------- Dossier de données privé ---------- */
function data_dir() {
    static $dir = null;
    if ($dir !== null) return $dir;
    foreach (array(dirname(WWW) . '/mwasa-data', __DIR__ . '/data') as $d) {
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

/* ---------- Fichiers ---------- */
function atomic_write($path, $content, $mode = 0644) {
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, "Impossible de créer le dossier " . basename($dir) . '.');
    $tmp = $dir . '/.tmp-' . bin2hex(random_bytes(6));
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) fail(500, "Impossible d'écrire " . basename($path) . '.');
    @chmod($tmp, $mode);
    if (!@rename($tmp, $path)) { @unlink($tmp); fail(500, "Impossible de remplacer " . basename($path) . '.'); }
}
function content_path() { return WWW . '/content/site.json'; }
function content_version($text) { return hash('sha256', $text); }
function backup_current() {
    $dir = data_dir() . '/backups';
    $stamp = date('Ymd-His');
    if (is_file(content_path())) @copy(content_path(), "$dir/$stamp-site.json");
    if (is_file(WWW . '/' . PAGE)) @copy(WWW . '/' . PAGE, "$dir/$stamp-accueil.html");
    $files = glob("$dir/*-site.json");
    if ($files && count($files) > 30) {
        sort($files);
        foreach (array_slice($files, 0, count($files) - 30) as $old) { @unlink($old); @unlink(str_replace('-site.json', '-accueil.html', $old)); }
    }
}

/* ---------- Journal des connexions ---------- */
function client_ip() { return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'inconnue'; }
function auth_log($event) {
    $f = data_dir() . '/auth.log';
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 160) : '';
    @file_put_contents($f, json_encode(array('t' => date('c'), 'ip' => client_ip(), 'e' => $event, 'ua' => $ua), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
    if (@filesize($f) > 512 * 1024) { // garde les 2000 dernières lignes
        $l = file($f); @file_put_contents($f, implode('', array_slice($l, -2000)), LOCK_EX);
    }
}
function read_log($n) {
    $f = data_dir() . '/auth.log';
    if (!is_file($f)) return array();
    $out = array();
    foreach (array_reverse(array_slice(file($f, FILE_IGNORE_NEW_LINES), -$n)) as $l) { $j = json_decode($l, true); if ($j) $out[] = $j; }
    return $out;
}

/* ---------- Limitation des essais ---------- */
function attempts_file($key) { return data_dir() . '/attempts/' . hash('sha256', $key) . '.json'; }
function recent($key, $window) {
    $f = attempts_file($key);
    $list = is_file($f) ? json_decode((string) file_get_contents($f), true) : array();
    if (!is_array($list)) $list = array();
    $now = time();
    return array_values(array_filter($list, function ($t) use ($now, $window) { return is_int($t) && $t > $now - $window; }));
}
function check_locks() {
    $ip = recent('ip:' . client_ip(), IP_WINDOW);
    if (count($ip) >= IP_MAX_FAILS) {
        $wait = max(1, (int) ceil((min($ip) + IP_WINDOW - time()) / 60));
        fail(429, "Trop d'essais depuis cet appareil. Réessayez dans $wait minute" . ($wait > 1 ? 's' : '') . '.');
    }
    $all = recent('global', GLOBAL_WINDOW);
    if (count($all) >= GLOBAL_MAX_FAILS) {
        $wait = max(1, (int) ceil((min($all) + GLOBAL_WINDOW - time()) / 60));
        fail(429, "Connexion temporairement bloquée après trop d'essais ratés. Réessayez dans $wait minutes.");
    }
}
function add_fail($why) {
    foreach (array(array('ip:' . client_ip(), IP_WINDOW), array('global', GLOBAL_WINDOW)) as $k) {
        $l = recent($k[0], $k[1]); $l[] = time();
        @file_put_contents(attempts_file($k[0]), json_encode($l), LOCK_EX);
    }
    auth_log($why);
    usleep(random_int(400000, 900000));
    return count(recent('ip:' . client_ip(), IP_WINDOW));
}
function clear_ip_fails() { @unlink(attempts_file('ip:' . client_ip())); }

/* ---------- TOTP (double authentification) ---------- */
function b32_encode($bin) {
    $alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $chunk) $out .= $alpha[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
function b32_decode($s) {
    $alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s))) as $c) $bits .= str_pad(decbin(strpos($alpha, $c)), 5, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}
function totp_at($secret, $step) {
    $h = hash_hmac('sha1', pack('N*', 0, $step), b32_decode($secret), true);
    $o = ord($h[19]) & 0xf;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
}
/* Vérifie un code (±30 s) et refuse sa réutilisation. */
function totp_check($secret, $code) {
    $code = preg_replace('/\D/', '', (string) $code);
    if (strlen($code) !== 6) return false;
    $now = (int) floor(time() / 30);
    $lastFile = data_dir() . '/attempts/totp-last';
    $last = is_file($lastFile) ? (int) file_get_contents($lastFile) : 0;
    for ($d = -1; $d <= 1; $d++) {
        $step = $now + $d;
        if ($step <= $last) continue;
        if (hash_equals(totp_at($secret, $step), $code)) { @file_put_contents($lastFile, (string) $step, LOCK_EX); return true; }
    }
    return false;
}

/* ---------- Mot de passe ---------- */
function password_ok($env, $pass) {
    if (!empty($env['ADMIN_PASSWORD_HASH'])) return password_verify($pass, $env['ADMIN_PASSWORD_HASH']);
    return hash_equals((string) $env['ADMIN_PASSWORD'], $pass);
}
function new_hash($pass) {
    return defined('PASSWORD_ARGON2ID') ? password_hash($pass, PASSWORD_ARGON2ID) : password_hash($pass, PASSWORD_DEFAULT);
}
function password_problem($pass, $env) {
    if (strlen($pass) < MIN_PASSWORD) return 'Le mot de passe doit faire au moins ' . MIN_PASSWORD . ' caractères.';
    if (strlen($pass) > 200) return 'Mot de passe trop long.';
    $lower = strtolower($pass);
    if (strpos($lower, strtolower($env['ADMIN_USER'])) !== false) return "Le mot de passe ne doit pas contenir l'identifiant.";
    foreach (array('mwasa', 'musiki', 'atelierdechant', 'motdepasse', 'password', 'azerty', 'qwerty', '123456', 'nice06') as $w) {
        if (strpos($lower, $w) !== false) return 'Ce mot de passe contient un mot trop facile à deviner (« ' . $w . ' »).';
    }
    $kinds = (int) preg_match('/[a-z]/', $pass) + (int) preg_match('/[A-Z]/', $pass) + (int) preg_match('/[0-9]/', $pass) + (int) preg_match('/[^A-Za-z0-9]/', $pass);
    if (strlen($pass) < 16 && $kinds < 3) return 'Mélangez au moins 3 types de caractères (minuscules, majuscules, chiffres, symboles), ou choisissez une phrase de 16 caractères ou plus.';
    if (count(array_unique(str_split($pass))) < 6) return 'Ce mot de passe est trop répétitif.';
    return null;
}

/* ---------- Session ---------- */
function is_https() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
}
function start_session($lifetime = 0) {
    ini_set('session.save_path', data_dir() . '/sessions');
    ini_set('session.gc_maxlifetime', (string) MAX_LONG);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    $https = is_https();
    session_name($https ? '__Host-mwasa' : 'mwasa_admin');
    session_set_cookie_params(array('lifetime' => $lifetime, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict'));
    session_start();
}
function ua_hash() { return hash('sha256', isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : ''); }
function end_session() {
    $_SESSION = array();
    $p = session_get_cookie_params();
    setcookie(session_name(), '', array('expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict'));
    session_destroy();
}
function logged_in() {
    if (empty($_SESSION['user']) || empty($_SESSION['csrf'])) return false;
    $now = time();
    $idle = !empty($_SESSION['remember']) ? IDLE_LONG : IDLE_SHORT;
    $max = !empty($_SESSION['remember']) ? MAX_LONG : MAX_SHORT;
    if ($now - (int) $_SESSION['seen'] > $idle || $now - (int) $_SESSION['since'] > $max || !hash_equals((string) $_SESSION['ua'], ua_hash())
        || (int) $_SESSION['gen'] !== auth_generation()) {
        end_session();
        return false;
    }
    $_SESSION['seen'] = $now;
    return true;
}
/* Changer le mot de passe ou la double authentification déconnecte les autres appareils. */
function auth_generation() { $f = data_dir() . '/auth-generation'; return is_file($f) ? (int) file_get_contents($f) : 0; }
function bump_generation() { $g = auth_generation() + 1; @file_put_contents(data_dir() . '/auth-generation', (string) $g, LOCK_EX); return $g; }
function require_login() { if (!logged_in()) fail(401, 'Session expirée. Reconnectez-vous.'); }
function require_csrf() {
    $h = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if (!is_string($h) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $h)) fail(403, 'Requête refusée (jeton de sécurité invalide). Rechargez la page.');
}
function require_same_origin() {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '') !== $host) fail(403, 'Origine refusée.');
}
function json_body() {
    $ct = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($ct, 'application/json') !== 0) fail(415, 'Format de requête non accepté.');
    $j = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($j)) fail(400, 'Requête illisible.');
    return $j;
}
function str_field($b, $k) { return isset($b[$k]) && is_string($b[$k]) ? $b[$k] : ''; }
function open_session($env, $remember) {
    clear_ip_fails();
    session_regenerate_id(true);
    $_SESSION = array(
        'user' => $env['ADMIN_USER'], 'csrf' => bin2hex(random_bytes(32)), 'since' => time(), 'seen' => time(),
        'remember' => $remember, 'ua' => ua_hash(), 'gen' => auth_generation(),
    );
    if ($remember) { // prolonge le cookie
        $p = session_get_cookie_params();
        setcookie(session_name(), session_id(), array('expires' => time() + MAX_LONG, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict'));
    }
    auth_log('connexion réussie');
}
function session_info($env) {
    return array('ok' => true, 'logged' => true, 'user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf'],
        'mustChangePassword' => empty($env['ADMIN_PASSWORD_HASH']), 'twoFactor' => !empty($env['ADMIN_TOTP_SECRET']));
}

/* ---------- Routes ---------- */
$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'ping') out(200, array('ok' => true, 'php' => PHP_VERSION, 'https' => is_https(), 'env' => env_file() !== null, 'envOutsideWww' => env_file() === dirname(WWW) . '/.env', 'page' => is_file(WWW . '/' . PAGE)));

$env = load_env();
start_session();
if ($method === 'POST') require_same_origin();

switch ($action) {
    case 'session':
        if (logged_in()) out(200, session_info($env));
        out(200, array('ok' => true, 'logged' => false));

    case 'login':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        check_locks();
        $b = json_body();
        $user = trim(str_field($b, 'user'));
        $pass = str_field($b, 'pass');
        $userOk = hash_equals(strtolower(trim($env['ADMIN_USER'])), strtolower($user));
        $passOk = password_ok($env, $pass);
        if (!$userOk || !$passOk) {
            $n = add_fail('mot de passe refusé' . ($userOk ? '' : ' (identifiant inconnu : ' . substr(preg_replace('/[^\w.@-]/u', '', $user), 0, 40) . ')'));
            $left = IP_MAX_FAILS - $n;
            fail(401, 'Identifiant ou mot de passe incorrect.' . ($left > 0 && $left <= 2 ? " Encore $left essai" . ($left > 1 ? 's' : '') . ' avant blocage temporaire.' : ''));
        }
        // Rehachage automatique si l'algorithme recommandé a changé
        if (!empty($env['ADMIN_PASSWORD_HASH']) && password_needs_rehash($env['ADMIN_PASSWORD_HASH'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
            update_env(array('ADMIN_PASSWORD_HASH' => new_hash($pass)));
        }
        $remember = !empty($b['remember']);
        if (!empty($env['ADMIN_TOTP_SECRET'])) {
            session_regenerate_id(true);
            $_SESSION = array('pending' => time(), 'remember' => $remember, 'ua' => ua_hash());
            out(200, array('ok' => true, 'needCode' => true));
        }
        open_session($env, $remember);
        out(200, session_info($env));

    case 'login_code':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        check_locks();
        if (empty($_SESSION['pending']) || time() - (int) $_SESSION['pending'] > PENDING_2FA || !hash_equals((string) $_SESSION['ua'], ua_hash())) {
            fail(401, 'Le délai est dépassé. Saisissez à nouveau votre mot de passe.', array('restart' => true));
        }
        $b = json_body();
        if (empty($env['ADMIN_TOTP_SECRET']) || !totp_check($env['ADMIN_TOTP_SECRET'], str_field($b, 'code'))) {
            add_fail('code de double authentification refusé');
            fail(401, 'Code incorrect ou expiré. Utilisez le code affiché en ce moment dans votre application.');
        }
        open_session($env, !empty($_SESSION['remember']));
        out(200, session_info($env));

    case 'logout':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        if (logged_in()) { require_csrf(); auth_log('déconnexion'); }
        end_session();
        out(200, array('ok' => true));

    case 'change_password':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf(); check_locks();
        $b = json_body();
        if (!password_ok($env, str_field($b, 'current'))) { add_fail('changement de mot de passe : ancien mot de passe refusé'); fail(401, 'Le mot de passe actuel est incorrect.'); }
        $new = str_field($b, 'new');
        if (hash_equals(str_field($b, 'current'), $new)) fail(400, "Le nouveau mot de passe doit être différent de l'ancien.");
        $why = password_problem($new, $env);
        if ($why) fail(400, $why);
        update_env(array('ADMIN_PASSWORD_HASH' => new_hash($new), 'ADMIN_PASSWORD' => null));
        $_SESSION['gen'] = bump_generation();
        auth_log('mot de passe changé');
        $env = load_env();
        out(200, session_info($env));

    case 'totp_setup':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf();
        $secret = b32_encode(random_bytes(20));
        $_SESSION['totp_candidate'] = $secret;
        $label = rawurlencode('Mwasa Musiki:' . $env['ADMIN_USER']);
        out(200, array('ok' => true, 'secret' => $secret, 'uri' => "otpauth://totp/$label?secret=$secret&issuer=" . rawurlencode('Mwasa Musiki') . '&algorithm=SHA1&digits=6&period=30'));

    case 'totp_enable':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf(); check_locks();
        $b = json_body();
        if (!password_ok($env, str_field($b, 'password'))) { add_fail('activation 2FA : mot de passe refusé'); fail(401, 'Mot de passe incorrect.'); }
        $secret = isset($_SESSION['totp_candidate']) ? $_SESSION['totp_candidate'] : '';
        if (!$secret || !totp_check($secret, str_field($b, 'code'))) fail(400, "Code incorrect. Vérifiez l'heure de votre téléphone et saisissez le code affiché.");
        update_env(array('ADMIN_TOTP_SECRET' => $secret));
        unset($_SESSION['totp_candidate']);
        $_SESSION['gen'] = bump_generation();
        auth_log('double authentification activée');
        $env = load_env();
        out(200, session_info($env));

    case 'totp_disable':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf(); check_locks();
        $b = json_body();
        if (!password_ok($env, str_field($b, 'password'))) { add_fail('désactivation 2FA : mot de passe refusé'); fail(401, 'Mot de passe incorrect.'); }
        if (empty($env['ADMIN_TOTP_SECRET']) || !totp_check($env['ADMIN_TOTP_SECRET'], str_field($b, 'code'))) fail(400, 'Code incorrect.');
        update_env(array('ADMIN_TOTP_SECRET' => null));
        $_SESSION['gen'] = bump_generation();
        auth_log('double authentification désactivée');
        $env = load_env();
        out(200, session_info($env));

    case 'security_log':
        require_login();
        out(200, array('ok' => true, 'entries' => read_log(25)));

    case 'content':
        require_login();
        $text = is_file(content_path()) ? (string) file_get_contents(content_path()) : '';
        if ($text === '') fail(500, 'Fichier de contenu introuvable (content/site.json).');
        out(200, array('ok' => true, 'content' => $text, 'version' => content_version($text), 'pageMissing' => !is_file(WWW . '/' . PAGE)));

    case 'upload':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf();
        $b = json_body();
        $path = str_field($b, 'path');
        if (!preg_match('#^img/uploads/[a-z0-9-]{1,80}\.webp$#', $path)) fail(400, 'Nom de photo invalide.');
        $bin = base64_decode(str_field($b, 'data'), true);
        if ($bin === false || strlen($bin) < 100) fail(400, 'Photo illisible.');
        if (strlen($bin) > 6 * 1024 * 1024) fail(413, 'Photo trop lourde (6 Mo maximum).');
        if (substr($bin, 0, 4) !== 'RIFF' || substr($bin, 8, 4) !== 'WEBP') fail(400, "Ce fichier n'est pas une image WebP.");
        if (function_exists('getimagesizefromstring') && !@getimagesizefromstring($bin)) fail(400, 'Image invalide.');
        atomic_write(WWW . '/' . $path, $bin);
        out(200, array('ok' => true, 'path' => $path));

    case 'publish':
        if ($method !== 'POST') fail(405, 'Méthode non autorisée.');
        require_login(); require_csrf();
        $b = json_body();
        $content = str_field($b, 'content');
        $html = str_field($b, 'html');
        $base = str_field($b, 'base');
        if (strlen($content) > 2 * 1024 * 1024 || strlen($html) > 3 * 1024 * 1024) fail(413, 'Contenu trop volumineux.');
        $decoded = json_decode($content, true);
        if (!is_array($decoded) || !isset($decoded['hero'])) fail(400, 'Contenu invalide.');
        if (stripos(ltrim($html), '<!doctype html>') !== 0) fail(400, 'Page invalide.');
        if (preg_match('#<script(?![^>]*\bsrc="assets/site\.js")#i', $html)) fail(400, 'La page contient un script non autorisé.');
        $current = is_file(content_path()) ? (string) file_get_contents(content_path()) : '';
        if ($current !== '' && !hash_equals(content_version($current), $base)) {
            fail(409, "Le site a été modifié par quelqu'un d'autre depuis que vous avez ouvert l'administration. Rechargez la page (vos modifications seront proposées en brouillon) puis publiez à nouveau.");
        }
        $missing = array();
        array_walk_recursive($decoded, function ($v, $k) use (&$missing) {
            if ($k === 'src' && is_string($v) && strpos($v, 'img/') === 0 && (strpos($v, '..') !== false || !is_file(WWW . '/' . $v))) $missing[] = $v;
        });
        if ($missing) fail(400, 'Photo manquante sur le serveur : ' . implode(', ', array_slice($missing, 0, 3)));
        backup_current();
        atomic_write(content_path(), $content);
        atomic_write(WWW . '/' . PAGE, $html);
        auth_log('publication');
        out(200, array('ok' => true, 'version' => content_version($content)));

    default:
        fail(404, 'Action inconnue.');
}
