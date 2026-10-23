/*
 * Mwasa Musiki : administration du site.
 * Connexion par identifiant et mot de passe (vérifiés par le serveur, fichier .env).
 * « Publier » envoie les nouvelles photos puis le contenu et la page index.html régénérée à admin/api.php,
 * qui les enregistre sur l'hébergement.
 */
(function () {
  'use strict';

  var API = 'api.php';
  var DRAFT_KEY = 'mwasa_admin_draft';

  var R = window.MwasaRender;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    csrf: null,
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

  /* ---------- API du serveur ---------- */
  function api(action, body) {
    var opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'application/json' } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (state.csrf) opts.headers['X-CSRF-Token'] = state.csrf;
    return fetch(API + '?action=' + action, opts).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!j) {
          var e1 = new Error(r.status === 404 ? 'Le programme d\'administration (admin/api.php) est introuvable sur le serveur.' :
            'Le serveur a répondu de façon inattendue. Vérifiez que l\'hébergement exécute bien PHP.');
          e1.status = r.status; throw e1;
        }
        if (!r.ok || j.ok === false) { var e2 = new Error(j.error || ('Erreur ' + r.status)); e2.status = r.status; throw e2; }
        return j;
      });
    });
  }
  function loadContent() {
    return api('content').then(function (j) {
      state.contentSha = j.version;
      state.saved = j.content;
      state.data = JSON.parse(j.content);
    });
  }
  function friendly(err) {
    if (err instanceof TypeError) return 'Connexion impossible. Vérifiez votre accès Internet.';
    return err.message || 'Erreur inattendue.';
  }

  /* ---------- Connexion ---------- */
  function showLogin(msg, step) {
    $('login').hidden = false; $('bar').hidden = true; $('preview').hidden = true; $('tip').hidden = true;
    var code = step === 'code';
    $('pw-form').hidden = code; $('code-form').hidden = !code;
    var err = code ? $('code-error') : $('pw-error');
    $('pw-error').hidden = true; $('code-error').hidden = true;
    if (msg) { err.textContent = msg; err.hidden = false; }
    setTimeout(function () { (code ? $('code') : $('pw-user')).focus(); }, 50);
  }
  function afterLogin(j) {
    state.csrf = j.csrf;
    state.security = { mustChangePassword: !!j.mustChangePassword, twoFactor: !!j.twoFactor };
    $('pw-pass').value = ''; $('code').value = '';
    return loadContent().then(function () {
      $('login').hidden = true;
      startEditor();
      if (state.security.mustChangePassword) forcePasswordChange();
    });
  }
  function login(user, pass, remember) {
    var b = $('pw-btn'); b.disabled = true; b.textContent = 'Connexion…';
    api('login', { user: user, pass: pass, remember: remember }).then(function (j) {
      if (j.needCode) { $('pw-pass').value = ''; showLogin('', 'code'); return; }
      return afterLogin(j);
    }).catch(function (err) {
      showLogin(friendly(err));
    }).finally(function () {
      b.disabled = false; b.textContent = 'Se connecter';
    });
  }
  function loginCode(code) {
    var b = $('code-btn'); b.disabled = true; b.textContent = 'Vérification…';
    api('login_code', { code: code }).then(afterLogin).catch(function (err) {
      if (err.status === 401 && /délai/i.test(err.message)) showLogin(friendly(err));
      else showLogin(friendly(err), 'code');
    }).finally(function () { b.disabled = false; b.textContent = 'Valider'; });
  }

  /* ---------- Sécurité : mot de passe, double authentification, journal ---------- */
  function strengthHint(pw) {
    var kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (r) { return r.test(pw); }).length;
    var score = Math.min(4, Math.floor(pw.length / 5) + kinds - 1);
    if (pw.length < 12) score = Math.min(score, 1);
    return Math.max(0, score);
  }
  function passwordFields(withCurrent) {
    return (withCurrent ? field('s-cur', 'Mot de passe actuel', '', 'password') : '') +
      field('s-new', 'Nouveau mot de passe', '', 'password', 'Au moins 12 caractères. Le plus simple et le plus sûr : une phrase, par exemple « 3 chorales chantent sous la pluie ! ». N\'utilisez pas un mot de passe d\'un autre compte.') +
      '<div class="mwa-strength" aria-hidden="true"><i id="s-meter"></i></div>' +
      field('s-new2', 'Confirmer le nouveau mot de passe', '', 'password');
  }
  function wireMeter() {
    var inp = document.getElementById('s-new'), m = document.getElementById('s-meter');
    inp.setAttribute('autocomplete', 'new-password'); document.getElementById('s-new2').setAttribute('autocomplete', 'new-password');
    var cur = document.getElementById('s-cur'); if (cur) cur.setAttribute('autocomplete', 'current-password');
    inp.addEventListener('input', function () {
      var sc = strengthHint(inp.value);
      m.style.width = (sc + 1) * 20 + '%';
      m.style.background = ['#c0392b', '#e67e22', '#f1c40f', '#7dbb3c', '#1f8f4e'][sc];
    });
  }
  function submitPasswordChange(current) {
    var n1 = document.getElementById('s-new').value, n2 = document.getElementById('s-new2').value;
    if (n1 !== n2) { toast('Les deux nouveaux mots de passe ne sont pas identiques.', 'err'); return false; }
    if (n1.length < 12) { toast('Le mot de passe doit faire au moins 12 caractères.', 'err'); return false; }
    $('pop-ok').disabled = true;
    api('change_password', { current: current, new: n1 }).then(function (j) {
      state.csrf = j.csrf; state.security.mustChangePassword = false;
      closePop(); $('pop-cancel').hidden = false;
      toast('Mot de passe changé. Les autres appareils ont été déconnectés.', 'ok', 7000);
    }).catch(function (err) {
      if (!onSessionLost(err)) toast(friendly(err), 'err', 9000);
    }).finally(function () { $('pop-ok').disabled = false; });
    return false; // la fenêtre se ferme seulement en cas de succès
  }
  function forcePasswordChange() {
    openPop('Choisissez votre mot de passe',
      '<p class="mwa-warn">Pour la sécurité du site, remplacez le mot de passe de départ par un mot de passe personnel. Il ne sera enregistré que sous forme chiffrée : personne, pas même l\'hébergeur, ne pourra le lire.</p>' +
      passwordFields(true), function () { return submitPasswordChange(document.getElementById('s-cur').value); }, 'Enregistrer');
    $('pop-cancel').hidden = true;
    state._forced = true;
    wireMeter();
  }
  function securityPanel() {
    var sec = state.security || {};
    openPop('Sécurité',
      '<div class="mwa-sec" style="display:flex;flex-direction:column;gap:.8rem">' +
      '<h3>Double authentification <span class="state ' + (sec.twoFactor ? 'on">Activée' : 'off">Désactivée') + '</span></h3>' +
      '<p class="mwa-note">' + (sec.twoFactor ? 'Un code à 6 chiffres est demandé à chaque connexion, en plus du mot de passe.' :
        'Recommandé : en plus du mot de passe, un code à 6 chiffres affiché par une application sur téléphone (Google Authenticator, Microsoft Authenticator, Aegis…) sera demandé. Même si le mot de passe fuit, personne ne pourra se connecter sans le téléphone.') + '</p>' +
      '<button type="button" class="mwa-btn ' + (sec.twoFactor ? 'mwa-danger' : 'mwa-primary') + '" id="s-2fa">' + (sec.twoFactor ? 'Désactiver la double authentification' : 'Activer la double authentification') + '</button>' +
      '<h3>Mot de passe</h3><button type="button" class="mwa-btn" id="s-pw">Changer le mot de passe</button>' +
      '<h3>Dernières connexions</h3><ul class="mwa-log" id="s-log"><li>Chargement…</li></ul></div>',
      function () { return true; }, 'Fermer');
    $('pop-cancel').hidden = true;
    document.getElementById('s-pw').addEventListener('click', function () {
      openPop('Changer le mot de passe', passwordFields(true), function () { return submitPasswordChange(document.getElementById('s-cur').value); }, 'Enregistrer');
      $('pop-cancel').hidden = false; wireMeter();
    });
    document.getElementById('s-2fa').addEventListener('click', sec.twoFactor ? disable2fa : enable2fa);
    api('security_log').then(function (j) {
      var ul = document.getElementById('s-log'); if (!ul) return;
      ul.innerHTML = (j.entries || []).map(function (e) {
        var d = new Date(e.t), bad = /refus/.test(e.e);
        return '<li class="' + (bad ? 'bad' : '') + '"><time>' + R.esc(d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })) + '</time><span>' + R.esc(e.e) + ' · ' + R.esc(e.ip) + '</span></li>';
      }).join('') || '<li>Aucune connexion enregistrée.</li>';
    }).catch(function () {});
  }
  function qrSVG(text) {
    if (typeof window.qrcode !== 'function') return '';
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }
  function enable2fa() {
    api('totp_setup', {}).then(function (j) {
      openPop('Activer la double authentification',
        '<ol style="margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.4rem;font-size:.92rem">' +
        '<li>Installez une application d\'authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator ou Aegis).</li>' +
        '<li>Dans l\'application, ajoutez un compte en scannant ce QR code.</li>' +
        '<li>Saisissez ci-dessous le code à 6 chiffres affiché, puis votre mot de passe.</li></ol>' +
        '<div class="mwa-qr">' + qrSVG(j.uri) + '</div>' +
        '<p class="mwa-hint">Impossible de scanner ? Saisissez cette clé dans l\'application :</p><p class="mwa-secret">' + R.esc(j.secret.replace(/(.{4})/g, '$1 ').trim()) + '</p>' +
        '<p class="mwa-warn">Les autres responsables peuvent scanner le même QR code maintenant, sur leur propre téléphone. Si tous les téléphones sont perdus, il faudra retirer la ligne ADMIN_TOTP_SECRET du fichier .env sur l\'hébergement.</p>' +
        field('s-code', 'Code à 6 chiffres', '', 'text') + field('s-pass', 'Votre mot de passe', '', 'password'),
        function () {
          $('pop-ok').disabled = true;
          api('totp_enable', { code: val('s-code'), password: document.getElementById('s-pass').value }).then(function (r) {
            state.csrf = r.csrf; state.security.twoFactor = true; closePop(); $('pop-cancel').hidden = false;
            toast('Double authentification activée. Les autres appareils ont été déconnectés.', 'ok', 8000);
          }).catch(function (err) { if (!onSessionLost(err)) toast(friendly(err), 'err', 9000); })
            .finally(function () { $('pop-ok').disabled = false; });
          return false;
        }, 'Activer');
      $('pop-cancel').hidden = false;
      var c = document.getElementById('s-code'); c.setAttribute('inputmode', 'numeric'); c.setAttribute('autocomplete', 'one-time-code');
      document.getElementById('s-pass').setAttribute('autocomplete', 'current-password');
    }).catch(function (err) { if (!onSessionLost(err)) toast(friendly(err), 'err'); });
  }
  function disable2fa() {
    openPop('Désactiver la double authentification',
      '<p class="mwa-warn">Sans double authentification, le mot de passe seul protège le site.</p>' +
      field('s-code', 'Code à 6 chiffres actuel', '', 'text') + field('s-pass', 'Votre mot de passe', '', 'password'),
      function () {
        $('pop-ok').disabled = true;
        api('totp_disable', { code: val('s-code'), password: document.getElementById('s-pass').value }).then(function (r) {
          state.csrf = r.csrf; state.security.twoFactor = false; closePop(); $('pop-cancel').hidden = false;
          toast('Double authentification désactivée.', 'ok');
        }).catch(function (err) { if (!onSessionLost(err)) toast(friendly(err), 'err', 9000); })
          .finally(function () { $('pop-ok').disabled = false; });
        return false;
      }, 'Désactiver', true);
    $('pop-cancel').hidden = false;
    document.getElementById('s-pass').setAttribute('autocomplete', 'current-password');
  }
  function logout() {
    api('logout', {}).catch(function () {}).then(function () { location.reload(); });
  }
  function onSessionLost(err) {
    if (err && err.status === 401) { state.csrf = null; saveDraft(); showLogin('Votre session a expiré. Reconnectez-vous : vos modifications sont gardées en brouillon.'); return true; }
    return false;
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
    atelier: function () { return { image: { src: 'img/photos/atelier-choeur.webp', alt: '' }, tag: 'Nouveau', title: 'Nouvel atelier', text: 'Décrivez l\'atelier en une ou deux phrases.' }; },
    projet: function () { return { image: { src: 'img/photos/opera-logo.webp', alt: '' }, title: 'Nouveau projet', text: 'Décrivez le projet en une ou deux phrases.' }; },
    event: function () { return { date: todayISO(14), time: '', place: 'Nice', title: 'Nouvel événement', text: 'Décrivez l\'événement : programme, public, tarif…', link: { label: '', href: '' } }; },
    news: function () { return { date: todayISO(0), tag: 'Nouveau', title: 'Nouvelle actualité', text: 'Racontez ce qui s\'est passé ou ce qui arrive.', image: { src: 'img/photos/cabaret-21-juin.webp', alt: '' }, link: { label: '', href: '' } }; },
    contact: function () { return { title: 'Nouveau contact', text: 'Précisez comment nous joindre.', link: { label: 'Lien', href: 'https://' } }; },
    row: function () { return { k: 'Info', v: 'Valeur' }; },
    slot: function () { return { title: 'Nouvel atelier', when: 'Jour · horaire' }; }
  };
  var ADD_LABEL = { public: '+ Public', atelier: '+ Ajouter un atelier', projet: '+ Ajouter un projet', event: '+ Ajouter un événement', news: '+ Ajouter une actualité', contact: '+ Ajouter un contact', row: '+ Ajouter une ligne', slot: '+ Ajouter un créneau' };

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
    var imgs = Object.keys(state.pending).filter(function (p) { return used[p]; });
    imgs.reduce(function (pr, p, i) {
      return pr.then(function () {
        btn.textContent = 'Envoi des photos ' + (i + 1) + '/' + imgs.length + '…';
        return api('upload', { path: p, data: state.pending[p].b64 });
      });
    }, Promise.resolve()).then(function () {
      btn.textContent = 'Publication…';
      return api('publish', { base: state.contentSha, content: jsonText, html: html });
    }).then(function (j) {
      state.contentSha = j.version;
      state.saved = jsonText;
      Object.keys(state.pending).forEach(function (k) { state.shown[k] = state.pending[k]; });
      state.pending = {};
      markChanged();
      clearDraft();
      toast('Publié ! Le site est à jour.', 'ok', 6000);
    }).catch(function (err) {
      if (!onSessionLost(err)) toast('Publication impossible : ' + friendly(err), 'err', 12000);
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
    $('pw-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('pw-user').value, pw = $('pw-pass').value;
      if (!u.trim() || !pw) { showLogin('Saisissez l\'identifiant et le mot de passe.'); return; }
      $('pw-error').hidden = true;
      login(u, pw, $('pw-remember').checked);
    });
    $('theme-btn').addEventListener('click', editTheme);
    $('security-btn').addEventListener('click', securityPanel);
    $('code-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var c = $('code').value.replace(/\D/g, '');
      if (c.length !== 6) { showLogin('Le code fait 6 chiffres.', 'code'); return; }
      loginCode(c);
    });
    $('code').addEventListener('input', function () { if ($('code').value.replace(/\D/g, '').length === 6) $('code-form').requestSubmit(); });
    $('code-back').addEventListener('click', function () { showLogin(''); });
    $('preview').addEventListener('click', onPreviewClick);
    $('publish-btn').addEventListener('click', publish);
    $('discard-btn').addEventListener('click', discard);
    $('logout-btn').addEventListener('click', function () {
      if (state.changes) {
        openPop('Se déconnecter ?', '<p>Vos modifications non publiées restent enregistrées sur cet appareil et seront proposées à la prochaine connexion.</p>', function () { saveDraft(); logout(); return true; }, 'Se déconnecter');
      } else logout();
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
        '<li><b>Agenda</b> : les événements passés sont masqués automatiquement sur le site.</li>' +
        '<li><b>Publier</b> met le site à jour immédiatement. Une sauvegarde de la version précédente est gardée sur le serveur.</li></ul>', function () { return true; }, 'Compris');
      $('pop-cancel').hidden = true;
    });
    $('tip-close').addEventListener('click', function () { $('tip').hidden = true; sset('local', 'mwasa_tip_seen', '1'); });
    $('pop').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!popSubmit || popSubmit() !== false) { state._themeBefore = undefined; closePop(); $('pop-cancel').hidden = false; }
    });
    var cancelPop = function () {
      if (state.security && state.security.mustChangePassword && $('pop-title').textContent === 'Choisissez votre mot de passe') return;
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

    api('session').then(function (j) {
      if (j.logged) return afterLogin(j);
      showLogin();
    }).catch(function (err) { showLogin(friendly(err)); });
  }

  init();
})();
