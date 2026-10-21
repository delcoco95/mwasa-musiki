/*
 * Mwasa Musiki : administration du site.
 * Le contenu vit dans content/site.json sur GitHub. « Publier » envoie en un seul commit :
 * le contenu, les nouvelles photos et la page index.html régénérée. GitHub Pages met le site à jour.
 */
(function () {
  'use strict';

  var CONFIG = {
    owner: 'delcoco95',
    repo: 'mwasa-musiki',
    branch: 'main',
    contentPath: 'content/site.json',
    api: 'https://api.github.com'
  };
  var TOKEN_KEY = 'mwasa_admin_token';
  var DRAFT_KEY = 'mwasa_admin_draft';

  var R = window.MwasaRender;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    token: null,
    data: null,         // contenu en cours d'édition
    saved: null,        // dernière version publiée (texte JSON)
    contentSha: null,   // sha du fichier site.json chargé
    pending: {},        // nouvelles photos : chemin -> { b64, url }
    shown: {},          // photos déjà publiées, encore affichées depuis la mémoire
    changes: 0
  };

  /* ---------- Outils ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function setPath(obj, path, value) {
    var ks = path.split('.'), last = ks.pop();
    var o = ks.reduce(function (o, k) { return o[k]; }, obj);
    o[last] = value;
  }
  function b64encodeUtf8(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decodeUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function todayISO(addDays) {
    var d = new Date(); d.setDate(d.getDate() + (addDays || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function slug(s) {
    return String(s || 'photo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  }
  function store(kind) { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
  function sget(k) { var v = null; ['local', 'session'].forEach(function (s) { try { v = v || (store(s) && store(s).getItem(k)); } catch (e) {} }); return v; }
  function sset(kind, k, v) { try { store(kind) && store(kind).setItem(k, v); } catch (e) {} }
  function sdel(k) { ['local', 'session'].forEach(function (s) { try { store(s) && store(s).removeItem(k); } catch (e) {} }); }

  var toastTimer;
  function toast(msg, kind, ms) {
    var t = $('toast');
    t.textContent = msg; t.className = 'mwa-toast' + (kind ? ' ' + kind : ''); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 4000);
  }

  /* ---------- API GitHub ---------- */
  function gh(method, path, body) {
    return fetch(CONFIG.api + path, {
      method: method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + state.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error((j && j.message) || ('Erreur ' + r.status));
          err.status = r.status; throw err;
        }
        return j;
      });
    });
  }
  var repoPath = function () { return '/repos/' + CONFIG.owner + '/' + CONFIG.repo; };

  function loadContent() {
    return gh('GET', repoPath() + '/contents/' + CONFIG.contentPath + '?ref=' + CONFIG.branch).then(function (f) {
      state.contentSha = f.sha;
      var txt = b64decodeUtf8(f.content);
      state.saved = txt;
      state.data = JSON.parse(txt);
    });
  }

  /* ---------- Connexion ---------- */
  function showLogin(msg, mode) {
    $('login').hidden = false; $('bar').hidden = true; $('preview').hidden = true; $('tip').hidden = true;
    $('repo-name').textContent = CONFIG.owner + '/' + CONFIG.repo;
    mode = mode || state.loginMode || (state.access ? 'pw' : 'token');
    state.loginMode = mode;
    $('pw-form').hidden = mode !== 'pw';
    $('login-form').hidden = mode === 'pw';
    $('to-pw').hidden = !state.access;
    var errEl = mode === 'pw' ? $('pw-error') : $('login-error');
    $('pw-error').hidden = true; $('login-error').hidden = true;
    if (msg) { errEl.textContent = msg; errEl.hidden = false; }
    setTimeout(function () { (mode === 'pw' ? $('pw-user') : $('token')).focus(); }, 50);
  }
  function friendly(err) {
    if (err.status === 401) return 'Clé refusée par GitHub. Vérifiez qu\'elle est complète et qu\'elle n\'a pas expiré.';
    if (err.status === 403) return 'Cette clé n\'a pas les droits nécessaires (Contents : Read and write sur ' + CONFIG.repo + ').';
    if (err.status === 404) return 'Le dépôt ' + CONFIG.owner + '/' + CONFIG.repo + ' est introuvable avec cette clé. Vérifiez que la clé donne accès à ce dépôt.';
    if (err.status === 409) return 'Quelqu\'un a publié en même temps. Rechargez la page puis recommencez.';
    if (err.status === 422) return 'GitHub a refusé l\'envoi : ' + err.message;
    if (err instanceof TypeError) return 'Connexion impossible. Vérifiez votre accès Internet.';
    return err.message || 'Erreur inattendue.';
  }
  function login(token, remember) {
    state.token = token;
    var lb = state.loginMode === 'pw' ? $('pw-btn') : $('login-btn');
    lb.disabled = true; lb.textContent = 'Connexion…';
    return gh('GET', repoPath()).then(function (repo) {
      if (repo.permissions && repo.permissions.push === false) {
        var e = new Error('Ce compte GitHub peut voir le dépôt mais pas le modifier. Demandez à être ajouté comme collaborateur.'); throw e;
      }
      return loadContent();
    }).then(function () {
      sdel(TOKEN_KEY);
      sset(remember ? 'local' : 'session', TOKEN_KEY, token);
      $('login').hidden = true;
      startEditor();
    }).catch(function (err) {
      state.token = null;
      var msg = friendly(err);
      if (state.loginMode === 'pw' && (err.status === 401 || err.status === 404)) msg = 'La clé GitHub enregistrée derrière ce mot de passe ne fonctionne plus (expirée ou supprimée). Connectez-vous avec une nouvelle clé GitHub, puis redéfinissez le mot de passe dans « Accès ».';
      showLogin(msg);
    }).finally(function () {
      lb.disabled = false; lb.textContent = 'Se connecter';
    });
  }

  /* ---------- Accès par identifiant et mot de passe ----------
   * La clé GitHub est chiffrée (AES-GCM) avec une clé dérivée de l'identifiant et du mot de passe
   * (PBKDF2-SHA256, 600 000 tours). Seul le résultat chiffré est publié dans admin/access.json :
   * le mot de passe n'est stocké nulle part. */
  var ACCESS_PATH = 'admin/access.json';
  var ITER = 600000;
  function bytesToB64(u8) { var b = ''; for (var i = 0; i < u8.length; i++) b += String.fromCharCode(u8[i]); return btoa(b); }
  function b64ToBytes(b64) { var b = atob(b64), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function deriveKey(user, pass, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(user.trim().toLowerCase() + '\n' + pass), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptToken(user, pass, token) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(user, pass, salt, ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(token));
    }).then(function (ct) {
      return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(ct)), updated: new Date().toISOString().slice(0, 10) };
    });
  }
  function decryptToken(user, pass, acc) {
    return deriveKey(user, pass, b64ToBytes(acc.salt), acc.iter || ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(acc.iv) }, key, b64ToBytes(acc.data));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  }
  function loadAccess() {
    return fetch('access.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { state.access = j && j.data ? j : null; }).catch(function () { state.access = null; });
  }
  function loginWithPassword(user, pass, remember) {
    if (!state.access) { showLogin('L\'accès par mot de passe n\'est pas encore configuré. Connectez-vous avec une clé GitHub.', 'token'); return; }
    var b = $('pw-btn'); b.disabled = true; b.textContent = 'Vérification…';
    decryptToken(user, pass, state.access).then(function (token) {
      b.disabled = false; b.textContent = 'Se connecter';
      login(token, remember);
    }).catch(function () {
      b.disabled = false; b.textContent = 'Se connecter';
      showLogin('Identifiant ou mot de passe incorrect.', 'pw');
    });
  }
  function editAccess() {
    var has = !!state.access;
    openPop('Accès par mot de passe',
      '<p class="mwa-note">Les responsables pourront se connecter avec cet identifiant et ce mot de passe, sans clé GitHub. Le mot de passe sert à chiffrer votre clé : il n\'est enregistré nulle part, notez-le. ' +
      (has ? 'Un accès existe déjà (mis à jour le ' + R.esc(state.access.updated || '?') + ') : l\'enregistrer à nouveau remplace l\'ancien.' : '') + '</p>' +
      field('f-user', 'Identifiant', '', 'text') +
      field('f-pass', 'Mot de passe', '', 'password', 'Au moins 12 caractères. Une phrase est plus sûre et facile à retenir, par exemple « Le-chœur-chante-à-Nice-2026 ».') +
      field('f-pass2', 'Confirmer le mot de passe', '', 'password') +
      '<p class="mwa-warn">Ce site est public : n\'importe qui peut récupérer la version chiffrée et essayer de deviner le mot de passe. Un mot de passe court ou courant se devine facilement. Ne réutilisez pas un mot de passe d\'un autre compte.</p>' +
      (has ? '<button type="button" class="mwa-btn mwa-danger" id="f-del-access">Supprimer l\'accès par mot de passe</button>' : ''),
      function () {
        var u = val('f-user'), p1 = document.getElementById('f-pass').value, p2 = document.getElementById('f-pass2').value;
        if (u.length < 3) { toast('Choisissez un identifiant d\'au moins 3 caractères.', 'err'); return false; }
        if (p1.length < 12) { toast('Le mot de passe doit faire au moins 12 caractères.', 'err'); return false; }
        if (p1 !== p2) { toast('Les deux mots de passe ne sont pas identiques.', 'err'); return false; }
        toast('Chiffrement et enregistrement…', '', 15000);
        encryptToken(u, p1, state.token).then(function (acc) {
          return putFile(ACCESS_PATH, JSON.stringify(acc, null, 2) + '\n', 'Met à jour l\'accès administration').then(function () { state.access = acc; });
        }).then(function () { toast('Accès enregistré. Il fonctionnera d\'ici 1 à 2 minutes.', 'ok', 7000); })
          .catch(function (err) { toast('Enregistrement impossible : ' + friendly(err), 'err', 9000); });
        return true;
      }, 'Enregistrer l\'accès');
    var del = document.getElementById('f-del-access');
    if (del) del.addEventListener('click', function () {
      closePop();
      getSha(ACCESS_PATH).then(function (sha) {
        if (!sha) return;
        return gh('DELETE', repoPath() + '/contents/' + ACCESS_PATH, { message: 'Supprime l\'accès par mot de passe', sha: sha, branch: CONFIG.branch });
      }).then(function () { state.access = null; toast('Accès par mot de passe supprimé.', 'ok'); })
        .catch(function (err) { toast('Suppression impossible : ' + friendly(err), 'err', 9000); });
    });
  }
  function getSha(path) {
    return gh('GET', repoPath() + '/contents/' + path + '?ref=' + CONFIG.branch).then(function (f) { return f.sha; })
      .catch(function (err) { if (err.status === 404) return null; throw err; });
  }
  function putFile(path, text, message) {
    return getSha(path).then(function (sha) {
      var body = { message: message, content: b64encodeUtf8(text), branch: CONFIG.branch };
      if (sha) body.sha = sha;
      return gh('PUT', repoPath() + '/contents/' + path, body);
    });
  }

  /* ---------- Apparence (couleurs et polices) ---------- */
  var COLOR_LABELS = [['creme', 'Fond de page'], ['brun', 'Couleur principale'], ['orange', 'Couleur d\'accent'], ['sable', 'Couleur secondaire'], ['nuit', 'Texte et pied de page']];
  function applyTheme() {
    var st = document.getElementById('mw-theme');
    if (st) st.textContent = R.themeCSS(state.data.theme, '../');
  }
  function editTheme() {
    var before = clone(state.data.theme || {});
    var th = state.data.theme = Object.assign({}, R.THEME_DEFAULT, state.data.theme || {});
    var opts = function (role) {
      return Object.keys(R.FONTS).map(function (k) {
        return '<option value="' + k + '"' + (th[role] === k ? ' selected' : '') + '>' + R.esc(R.FONTS[k].name) + '</option>';
      }).join('');
    };
    openPop('Apparence du site',
      '<div class="mwa-colors">' + COLOR_LABELS.map(function (c) {
        return '<label class="mwa-color"><input type="color" id="c-' + c[0] + '" value="' + R.esc(th[c[0]]) + '"><span>' + c[1] + '</span></label>';
      }).join('') + '</div>' +
      '<div class="mwa-field"><label for="f-display">Police des titres</label><select id="f-display">' + opts('display') + '</select></div>' +
      '<div class="mwa-field"><label for="f-body">Police du texte</label><select id="f-body">' + opts('body') + '</select></div>' +
      '<p class="mwa-note">Les changements s\'affichent tout de suite dans la page derrière. Le logo garde ses couleurs d\'origine. Pensez à un bon contraste entre le texte et le fond.</p>' +
      '<button type="button" class="mwa-btn" id="f-reset-theme">Revenir aux couleurs et polices d\'origine</button>',
      function () { markChanged(); return true; }, 'Appliquer');
    var live = function () {
      COLOR_LABELS.forEach(function (c) { th[c[0]] = document.getElementById('c-' + c[0]).value; });
      th.display = document.getElementById('f-display').value;
      th.body = document.getElementById('f-body').value;
      applyTheme();
    };
    $('pop-body').querySelectorAll('input, select').forEach(function (el) { el.addEventListener('input', live); el.addEventListener('change', live); });
    document.getElementById('f-reset-theme').addEventListener('click', function () {
      Object.assign(th, R.THEME_DEFAULT);
      COLOR_LABELS.forEach(function (c) { document.getElementById('c-' + c[0]).value = th[c[0]]; });
      document.getElementById('f-display').value = th.display; document.getElementById('f-body').value = th.body;
      applyTheme();
    });
    state._themeBefore = before;
  }
  /* ---------- Brouillon local ---------- */
  function saveDraft() {
    try {
      var payload = JSON.stringify({ base: state.contentSha, data: state.data, pending: state.pending });
      if (payload.length < 4500000) sset('local', DRAFT_KEY, payload); else sset('local', DRAFT_KEY, JSON.stringify({ base: state.contentSha, data: state.data, pending: {} }));
    } catch (e) {}
  }
  function clearDraft() { sdel(DRAFT_KEY); }
  function restoreDraft() {
    var raw = sget(DRAFT_KEY); if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      if (!d || !d.data) return false;
      if (JSON.stringify(d.data) === JSON.stringify(state.data)) { clearDraft(); return false; }
      state.data = d.data; state.pending = d.pending || {};
      Object.keys(state.pending).forEach(function (k) { state.pending[k].url = 'data:image/webp;base64,' + state.pending[k].b64; });
      return d.base !== state.contentSha ? 'stale' : true;
    } catch (e) { return false; }
  }

  /* ---------- Suivi des modifications ---------- */
  function markChanged() {
    var now = JSON.stringify(state.data, null, 2);
    var n = now === JSON.stringify(JSON.parse(state.saved), null, 2) && !Object.keys(state.pending).length ? 0 : 1;
    state.changes = n;
    var s = $('status');
    s.textContent = n ? 'Modifications non publiées' : 'Tout est publié';
    s.classList.toggle('dirty', !!n);
    $('publish-btn').disabled = !n; $('discard-btn').disabled = !n;
    if (n) saveDraft(); else clearDraft();
  }

  /* ---------- Rendu de l'aperçu ---------- */
  function resolveImg(src) { return state.pending[src] ? state.pending[src].url : (state.shown[src] ? state.shown[src].url : src); }
  function renderPreview() {
    var p = $('preview');
    var y = window.scrollY;
    p.innerHTML = R.render(state.data, { edit: true, base: '../', resolve: resolveImg });
    decorate(p);
    window.scrollTo(0, y);
  }

  var TEMPLATES = {
    public: function () { return { text: 'Nouveau public' }; },
    atelier: function () { return { image: { src: 'img/gospel.webp', alt: '' }, tag: 'Nouveau', title: 'Nouvel atelier', text: 'Décrivez l\'atelier en une ou deux phrases.' }; },
    projet: function () { return { image: { src: 'img/concerts.webp', alt: '' }, title: 'Nouveau projet', text: 'Décrivez le projet en une ou deux phrases.' }; },
    event: function () { return { date: todayISO(14), time: '', place: 'Nice', title: 'Nouvel événement', text: 'Décrivez l\'événement : programme, public, tarif…', link: { label: '', href: '' } }; },
    news: function () { return { date: todayISO(0), tag: 'Nouveau', title: 'Nouvelle actualité', text: 'Racontez ce qui s\'est passé ou ce qui arrive.', image: { src: 'img/fete.webp', alt: '' }, link: { label: '', href: '' } }; },
    contact: function () { return { title: 'Nouveau contact', text: 'Précisez comment nous joindre.', link: { label: 'Lien', href: 'https://' } }; },
    row: function () { return { k: 'Info', v: 'Valeur' }; }
  };
  var ADD_LABEL = { public: '+ Public', atelier: '+ Ajouter un atelier', projet: '+ Ajouter un projet', event: '+ Ajouter un événement', news: '+ Ajouter une actualité', contact: '+ Ajouter un contact', row: '+ Ajouter une ligne' };

  function decorate(root) {
    // Textes
    root.querySelectorAll('[data-edit]').forEach(function (el) {
      try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      el.spellcheck = true;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.textContent = getPath(state.data, el.dataset.edit) || ''; el.blur(); }
      });
      el.addEventListener('input', function () {
        setPath(state.data, el.dataset.edit, el.textContent.replace(/\s+/g, ' '));
        markChanged();
      });
      el.addEventListener('blur', function () {
        var v = el.textContent.replace(/\s+/g, ' ').trim();
        setPath(state.data, el.dataset.edit, v);
        markChanged();
      });
      el.addEventListener('paste', function (e) {
        if (el.contentEditable === 'true') {
          e.preventDefault();
          var text = (e.clipboardData || window.clipboardData).getData('text');
          document.execCommand('insertText', false, text);
        }
      });
    });
    // Contrôles des listes
    root.querySelectorAll('[data-list]').forEach(function (list) {
      var path = list.dataset.list, kind = list.dataset.kind;
      var items = getPath(state.data, path) || [];
      list.querySelectorAll('[data-item]').forEach(function (it) {
        if (it.dataset.item.slice(0, path.length + 1) !== path + '.') return;
        var idx = +it.dataset.item.slice(path.length + 1);
        var c = document.createElement('div'); c.className = 'mwa-ctrl'; c.contentEditable = 'false';
        var btn = function (label, title, fn, cls) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title);
          if (cls) b.className = cls;
          b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
          c.appendChild(b);
        };
        if (idx > 0) btn('↑', 'Monter', function () { move(path, idx, -1); });
        if (idx < items.length - 1) btn('↓', 'Descendre', function () { move(path, idx, 1); });
        btn('⧉', 'Dupliquer', function () { items.splice(idx + 1, 0, clone(items[idx])); markChanged(); renderPreview(); });
        btn('Supprimer', 'Supprimer', function () { confirmDelete(path, idx); }, 'del');
        it.appendChild(c);
      });
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'mwa-add'; add.textContent = ADD_LABEL[kind] || '+ Ajouter';
      add.addEventListener('click', function () {
        var arr = getPath(state.data, path);
        var fresh = TEMPLATES[kind] ? TEMPLATES[kind]() : clone(arr[arr.length - 1] || {});
        if (kind === 'news') arr.unshift(fresh); else arr.push(fresh);
        markChanged(); renderPreview();
        var target = document.querySelector('[data-item="' + path + '.' + (kind === 'news' ? 0 : arr.length - 1) + '"]');
        if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        toast('Élément ajouté. Cliquez sur ses textes et sa photo pour les remplir.', 'ok');
      });
      if (list.classList.contains('news-list')) list.appendChild(add);
      else list.appendChild(add);
    });
  }
  function move(path, idx, dir) {
    var arr = getPath(state.data, path), j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    var x = arr[idx]; arr[idx] = arr[j]; arr[j] = x;
    markChanged(); renderPreview();
  }
  function confirmDelete(path, idx) {
    var arr = getPath(state.data, path);
    var it = arr[idx], name = it.title || it.text || it.k || 'cet élément';
    openPop('Supprimer ?', '<p>Supprimer « ' + R.esc(name) + ' » ? Vous pourrez encore annuler tant que vous n\'avez pas publié.</p>', function () {
      arr.splice(idx, 1); markChanged(); renderPreview(); return true;
    }, 'Supprimer', true);
  }

  /* ---------- Clics dans l'aperçu ---------- */
  function onPreviewClick(e) {
    var a = e.target.closest('a');
    var imgEl = e.target.closest('[data-img]');
    var linkEl = e.target.closest('[data-link]');
    var evEl = e.target.closest('[data-event]');
    if (e.target.closest('.mwa-ctrl, .mwa-add')) return;
    if (e.target.closest('#burger')) { var m = document.getElementById('menu'); m.classList.toggle('open'); return; }
    if (imgEl) { e.preventDefault(); editImage(imgEl.dataset.img); return; }
    if (linkEl) { e.preventDefault(); editLink(linkEl.dataset.link); return; }
    if (evEl) { e.preventDefault(); editDate(evEl.dataset.event); return; }
    if (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') {
        e.preventDefault();
        var t = document.getElementById(href.slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth' });
        var menu = document.getElementById('menu'); if (menu) menu.classList.remove('open');
      } else e.preventDefault();
    }
  }

  /* ---------- Fenêtre d'édition ---------- */
  var popSubmit = null;
  function openPop(title, html, onOk, okLabel, danger) {
    $('pop-title').textContent = title;
    $('pop-body').innerHTML = html;
    $('pop-ok').textContent = okLabel || 'Valider';
    $('pop-ok').className = 'mwa-btn ' + (danger ? 'mwa-danger' : 'mwa-primary');
    popSubmit = onOk;
    $('pop').hidden = false; $('pop-backdrop').hidden = false;
    var f = $('pop-body').querySelector('input, textarea, button'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closePop() { $('pop').hidden = true; $('pop-backdrop').hidden = true; popSubmit = null; }
  function field(id, label, value, type, hint) {
    return '<div class="mwa-field"><label for="' + id + '">' + label + '</label>' +
      (type === 'textarea' ? '<textarea id="' + id + '" rows="3">' + R.esc(value) + '</textarea>' : '<input id="' + id + '" type="' + (type || 'text') + '" value="' + R.esc(value) + '">') +
      (hint ? '<small>' + hint + '</small>' : '') + '</div>';
  }
  var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };

  function editLink(path) {
    var l = getPath(state.data, path) || { label: '', href: '' };
    openPop('Bouton ou lien',
      field('f-label', 'Texte affiché', l.label) +
      field('f-href', 'Adresse', l.href, 'text', 'Une adresse web (https://…), ou #adhesion, #contact… pour aller à une section de la page. Laissez le texte vide pour masquer le lien.'),
      function () {
        var href = val('f-href');
        if (href && !/^(https?:\/\/|mailto:|tel:|#)/i.test(href)) {
          if (/^[\w.-]+\.[a-z]{2,}/i.test(href)) href = 'https://' + href;
          else { toast('Adresse non reconnue : commencez par https://', 'err'); return false; }
        }
        setPath(state.data, path, { label: val('f-label'), href: href });
        markChanged(); renderPreview(); return true;
      });
  }

  function editDate(path) {
    var it = getPath(state.data, path);
    var isEvent = path.indexOf('agenda.') === 0;
    openPop(isEvent ? 'Date et lieu' : 'Date de l\'actualité',
      field('f-date', 'Date', it.date || '', 'date') +
      (isEvent ? field('f-time', 'Heure', it.time || '', 'text', 'Par exemple : 19h30, ou 14h – 17h') + field('f-place', 'Lieu', it.place || '', 'text', 'Par exemple : Salle Grappelli, Nice') : ''),
      function () {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val('f-date'))) { toast('Choisissez une date.', 'err'); return false; }
        it.date = val('f-date');
        if (isEvent) { it.time = val('f-time'); it.place = val('f-place'); }
        markChanged(); renderPreview(); return true;
      });
  }

  var pendingImagePath = null;
  function imgURL(src) { var r = resolveImg(src); return /^(data:|blob:|https?:)/.test(r) ? r : '../' + r; }
  function editImage(path) {
    var o = getPath(state.data, path) || { src: '', alt: '' };
    var fx = o.focusX != null ? +o.focusX : 50, fy = o.focusY != null ? +o.focusY : 50;
    var shown = document.querySelector('[data-img="' + path + '"]');
    var ratio = shown && shown.clientWidth && shown.clientHeight ? (shown.clientWidth / shown.clientHeight) : 1.5;
    var u = R.esc(imgURL(o.src));
    openPop('Photo',
      '<div class="mwa-field"><label>Cadrage : cliquez sur la partie à garder visible</label>' +
      '<div class="mwa-focus" id="f-focus"><img id="f-thumb" alt="" src="' + u + '"><span class="dot" id="f-dot"></span></div>' +
      '<small>La photo est rognée automatiquement pour remplir son cadre. Le point blanc indique ce qui reste toujours visible.</small></div>' +
      '<div class="mwa-crops"><figure><img id="f-c1" src="' + u + '" style="aspect-ratio:' + ratio.toFixed(3) + '"><figcaption>Sur la page</figcaption></figure>' +
      '<figure><img id="f-c2" src="' + u + '" style="aspect-ratio:1"><figcaption>Carré</figcaption></figure>' +
      '<figure><img id="f-c3" src="' + u + '" style="aspect-ratio:16/9"><figcaption>Sur téléphone</figcaption></figure></div>' +
      '<div class="mwa-row"><button type="button" class="mwa-btn mwa-primary" id="f-replace">Remplacer la photo…</button>' +
      '<button type="button" class="mwa-btn" id="f-center">Recentrer</button></div>' +
      field('f-alt', 'Description de la photo', o.alt, 'text', 'Décrit l\'image pour les personnes malvoyantes et Google. Exemple : « Le chœur en concert à Nice ».'),
      function () {
        var cur = getPath(state.data, path);
        cur.alt = val('f-alt');
        if (state._newImage) { cur.src = state._newImage; state._newImage = null; }
        if (Math.round(fx) === 50 && Math.round(fy) === 50) { delete cur.focusX; delete cur.focusY; }
        else { cur.focusX = Math.round(fx); cur.focusY = Math.round(fy); }
        markChanged(); renderPreview(); return true;
      });
    state._newImage = null;
    pendingImagePath = path;
    var thumb = document.getElementById('f-thumb'), dot = document.getElementById('f-dot');
    var paint = function () {
      // le point est placé sur l'image réellement affichée (object-fit: contain)
      var bw = thumb.clientWidth, bh = thumb.clientHeight, nw = thumb.naturalWidth || 1, nh = thumb.naturalHeight || 1;
      var s = Math.min(bw / nw, bh / nh), w = nw * s, h = nh * s, ox = (bw - w) / 2, oy = (bh - h) / 2;
      dot.style.left = (ox + w * fx / 100) + 'px'; dot.style.top = (oy + h * fy / 100) + 'px';
      ['f-c1', 'f-c2', 'f-c3'].forEach(function (id) { var c = document.getElementById(id); c.style.objectPosition = fx + '% ' + fy + '%'; if (thumb.src !== c.src) c.src = thumb.src; });
    };
    thumb.addEventListener('load', paint); if (thumb.complete) paint();
    document.getElementById('f-focus').addEventListener('click', function (e) {
      var r = thumb.getBoundingClientRect(), nw = thumb.naturalWidth || 1, nh = thumb.naturalHeight || 1;
      var s = Math.min(r.width / nw, r.height / nh), w = nw * s, h = nh * s, ox = (r.width - w) / 2, oy = (r.height - h) / 2;
      fx = Math.max(0, Math.min(100, (e.clientX - r.left - ox) / w * 100));
      fy = Math.max(0, Math.min(100, (e.clientY - r.top - oy) / h * 100));
      paint();
    });
    document.getElementById('f-center').addEventListener('click', function () { fx = 50; fy = 50; paint(); });
    state._resetFocus = function () { fx = 50; fy = 50; };
    $('f-replace').addEventListener('click', function () { $('file').value = ''; $('file').click(); });
  }

  function processImage(file) {
    return createImageBitmap(file).then(function (bmp) {
      var max = 1600, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/webp', 0.82); });
    }).then(function (blob) {
      if (!blob || blob.type !== 'image/webp') throw new Error('Format d\'image non pris en charge par ce navigateur.');
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    });
  }
  function onFile() {
    var f = $('file').files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Choisissez une image (JPG, PNG, WebP…).', 'err'); return; }
    toast('Préparation de la photo…', '', 8000);
    processImage(f).then(function (dataUrl) {
      var p = 'img/uploads/' + slug(f.name) + '-' + Date.now().toString(36) + '.webp';
      state.pending[p] = { b64: dataUrl.split(',')[1], url: dataUrl };
      state._newImage = p;
      var th = document.getElementById('f-thumb'); if (th) { if (state._resetFocus) state._resetFocus(); th.src = dataUrl; }
      toast('Photo prête. Cliquez sur « Valider ».', 'ok');
    }).catch(function (err) { toast('Impossible de lire cette image : ' + err.message, 'err', 6000); });
  }

  /* ---------- Publication ---------- */
  function usedImages(data) {
    var used = {};
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (typeof o.src === 'string') used[o.src] = true;
      Object.keys(o).forEach(function (k) { walk(o[k]); });
    })(data);
    return used;
  }
  function publish() {
    if (!state.changes) return;
    var btn = $('publish-btn');
    btn.disabled = true; btn.textContent = 'Publication…'; document.body.classList.add('mwa-busy');
    var used = usedImages(state.data);
    var jsonText = JSON.stringify(state.data, null, 2) + '\n';
    var html = R.fullDocument(state.data);
    var head, baseTree;
    gh('GET', repoPath() + '/contents/' + CONFIG.contentPath + '?ref=' + CONFIG.branch).then(function (f) {
      if (f.sha !== state.contentSha) {
        var e = new Error('Le site a été modifié par quelqu\'un d\'autre depuis que vous avez ouvert cette page. Rechargez la page pour récupérer sa version (vos modifications non publiées seront proposées en brouillon), puis publiez à nouveau.');
        e.status = 'conflict'; throw e;
      }
      return gh('GET', repoPath() + '/git/ref/heads/' + CONFIG.branch);
    }).then(function (ref) {
      head = ref.object.sha;
      return gh('GET', repoPath() + '/git/commits/' + head);
    }).then(function (commit) {
      baseTree = commit.tree.sha;
      var imgs = Object.keys(state.pending).filter(function (p) { return used[p]; });
      return imgs.reduce(function (pr, p) {
        return pr.then(function (acc) {
          return gh('POST', repoPath() + '/git/blobs', { content: state.pending[p].b64, encoding: 'base64' }).then(function (b) {
            acc.push({ path: p, mode: '100644', type: 'blob', sha: b.sha }); return acc;
          });
        });
      }, Promise.resolve([]));
    }).then(function (tree) {
      tree.push({ path: CONFIG.contentPath, mode: '100644', type: 'blob', content: jsonText });
      tree.push({ path: 'index.html', mode: '100644', type: 'blob', content: html });
      return gh('POST', repoPath() + '/git/trees', { base_tree: baseTree, tree: tree });
    }).then(function (t) {
      return gh('POST', repoPath() + '/git/commits', { message: 'Mise à jour du site depuis l\'administration', tree: t.sha, parents: [head] });
    }).then(function (c) {
      return gh('PATCH', repoPath() + '/git/refs/heads/' + CONFIG.branch, { sha: c.sha });
    }).then(function () {
      return gh('GET', repoPath() + '/contents/' + CONFIG.contentPath + '?ref=' + CONFIG.branch);
    }).then(function (f) {
      state.contentSha = f.sha;
      state.saved = jsonText;
      // les photos publiées restent affichées depuis la mémoire le temps que GitHub Pages se mette à jour
      Object.keys(state.pending).forEach(function (k) { state.shown[k] = state.pending[k]; });
      state.pending = {};
      markChanged();
      clearDraft();
      toast('Publié ! Le site sera à jour d\'ici 1 à 2 minutes.', 'ok', 7000);
    }).catch(function (err) {
      toast(err.status === 'conflict' ? err.message : 'Publication impossible : ' + friendly(err), 'err', 12000);
    }).finally(function () {
      btn.textContent = 'Publier'; document.body.classList.remove('mwa-busy');
      btn.disabled = !state.changes;
    });
  }
  function discard() {
    openPop('Annuler les modifications ?', '<p>Toutes les modifications non publiées seront perdues et la page reviendra à la version en ligne.</p>', function () {
      state.data = JSON.parse(state.saved); state.pending = {};
      clearDraft(); markChanged(); renderPreview(); return true;
    }, 'Tout annuler', true);
  }

  /* ---------- Démarrage ---------- */
  function startEditor() {
    var restored = restoreDraft();
    $('bar').hidden = false; $('preview').hidden = false;
    var tipSeen = sget('mwasa_tip_seen');
    $('tip').hidden = !!tipSeen;
    document.documentElement.style.setProperty('--mwa-bar-h', $('bar').offsetHeight + 'px');
    renderPreview();
    markChanged();
    if (restored === 'stale') toast('Brouillon restauré. Attention : le site a été publié depuis par quelqu\'un d\'autre ; vérifiez avant de publier.', 'err', 10000);
    else if (restored) toast('Vos modifications non publiées ont été restaurées.', 'ok', 6000);
  }

  function init() {
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var tk = $('token').value.trim();
      if (!tk) { showLogin('Collez votre clé d\'accès GitHub.'); return; }
      $('login-error').hidden = true;
      login(tk, $('remember').checked);
    });
    $('pw-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('pw-user').value, pw = $('pw-pass').value;
      if (!u.trim() || !pw) { showLogin('Saisissez l\'identifiant et le mot de passe.', 'pw'); return; }
      $('pw-error').hidden = true;
      loginWithPassword(u, pw, $('pw-remember').checked);
    });
    $('to-token').addEventListener('click', function () { showLogin('', 'token'); });
    $('to-pw').addEventListener('click', function () { showLogin('', 'pw'); });
    $('theme-btn').addEventListener('click', editTheme);
    $('access-btn').addEventListener('click', editAccess);
    $('preview').addEventListener('click', onPreviewClick);
    $('publish-btn').addEventListener('click', publish);
    $('discard-btn').addEventListener('click', discard);
    $('logout-btn').addEventListener('click', function () {
      if (state.changes) {
        openPop('Se déconnecter ?', '<p>Vos modifications non publiées restent enregistrées sur cet appareil et seront proposées à la prochaine connexion.</p>', function () { sdel(TOKEN_KEY); location.reload(); return true; }, 'Se déconnecter');
      } else { sdel(TOKEN_KEY); location.reload(); }
    });
    $('help-btn').addEventListener('click', function () {
      openPop('Comment modifier le site', '<ul style="display:flex;flex-direction:column;gap:.5rem;padding-left:1.1rem;margin:0">' +
        '<li><b>Texte</b> : cliquez dessus et écrivez. Entrée pour valider, Échap pour annuler.</li>' +
        '<li><b>Photo</b> : cliquez dessus, puis « Remplacer la photo ». Elle est réduite automatiquement.</li>' +
        '<li><b>Bouton ou lien</b> : cliquez dessus pour changer son texte et son adresse.</li>' +
        '<li><b>Date d\'un événement ou d\'une actualité</b> : cliquez sur la date.</li>' +
        '<li><b>Cartes et listes</b> : survolez-les pour monter, descendre, dupliquer ou supprimer. Les boutons « + Ajouter » créent un nouvel élément.</li>' +
        '<li><b>Cadrage d\'une photo</b> : cliquez sur la photo puis sur la partie à garder visible.</li>' +
        '<li><b>Apparence</b> : changez les couleurs et les polices de tout le site.</li>' +
        '<li><b>Accès</b> : définissez l\'identifiant et le mot de passe des responsables.</li>' +
        '<li><b>Agenda</b> : les événements passés sont masqués automatiquement sur le site.</li>' +
        '<li><b>Publier</b> envoie tout en ligne. Le site est à jour 1 à 2 minutes après.</li></ul>', function () { return true; }, 'Compris');
      $('pop-cancel').hidden = true;
    });
    $('tip-close').addEventListener('click', function () { $('tip').hidden = true; sset('local', 'mwasa_tip_seen', '1'); });
    $('pop').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!popSubmit || popSubmit() !== false) { state._themeBefore = undefined; closePop(); $('pop-cancel').hidden = false; }
    });
    var cancelPop = function () {
      state._newImage = null;
      if (state._themeBefore !== undefined && $('pop-title').textContent === 'Apparence du site') { state.data.theme = state._themeBefore; applyTheme(); }
      state._themeBefore = undefined;
      closePop(); $('pop-cancel').hidden = false;
    };
    $('pop-cancel').addEventListener('click', cancelPop);
    $('pop-backdrop').addEventListener('click', cancelPop);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('pop').hidden) cancelPop(); });
    $('file').addEventListener('change', onFile);
    window.addEventListener('beforeunload', function (e) { if (state.changes) { saveDraft(); } });

    var tk = sget(TOKEN_KEY);
    loadAccess().then(function () {
      if (tk) {
        state.token = tk;
        gh('GET', repoPath()).then(loadContent).then(startEditor).catch(function (err) {
          sdel(TOKEN_KEY); state.token = null; showLogin(friendly(err));
        });
      } else showLogin();
    });
  }

  init();
})();
