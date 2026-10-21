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
  function showLogin(msg) {
    $('login').hidden = false; $('bar').hidden = true; $('preview').hidden = true; $('tip').hidden = true;
    $('repo-name').textContent = CONFIG.owner + '/' + CONFIG.repo;
    if (msg) { $('login-error').textContent = msg; $('login-error').hidden = false; }
    setTimeout(function () { $('token').focus(); }, 50);
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
    $('login-btn').disabled = true; $('login-btn').textContent = 'Connexion…';
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
      showLogin(friendly(err));
    }).finally(function () {
      $('login-btn').disabled = false; $('login-btn').textContent = 'Se connecter';
    });
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
  function editImage(path) {
    var o = getPath(state.data, path) || { src: '', alt: '' };
    openPop('Photo',
      '<img class="mwa-thumb" id="f-thumb" alt="" src="' + R.esc(/^(data:|https?:)/.test(resolveImg(o.src)) ? resolveImg(o.src) : '../' + o.src) + '">' +
      '<button type="button" class="mwa-btn mwa-primary" id="f-replace">Remplacer la photo…</button>' +
      field('f-alt', 'Description de la photo', o.alt, 'text', 'Décrit l\'image pour les personnes malvoyantes et Google. Exemple : « Le chœur en concert à Nice ».'),
      function () {
        var cur = getPath(state.data, path);
        cur.alt = val('f-alt');
        if (state._newImage) { cur.src = state._newImage; state._newImage = null; }
        markChanged(); renderPreview(); return true;
      });
    state._newImage = null;
    pendingImagePath = path;
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
      var th = document.getElementById('f-thumb'); if (th) th.src = dataUrl;
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
        '<li><b>Agenda</b> : les événements passés sont masqués automatiquement sur le site.</li>' +
        '<li><b>Publier</b> envoie tout en ligne. Le site est à jour 1 à 2 minutes après.</li></ul>', function () { return true; }, 'Compris');
      $('pop-cancel').hidden = true;
    });
    $('tip-close').addEventListener('click', function () { $('tip').hidden = true; sset('local', 'mwasa_tip_seen', '1'); });
    $('pop').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!popSubmit || popSubmit() !== false) { closePop(); $('pop-cancel').hidden = false; }
    });
    $('pop-cancel').addEventListener('click', function () { state._newImage = null; closePop(); });
    $('pop-backdrop').addEventListener('click', function () { state._newImage = null; closePop(); $('pop-cancel').hidden = false; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('pop').hidden) { state._newImage = null; closePop(); $('pop-cancel').hidden = false; } });
    $('file').addEventListener('change', onFile);
    window.addEventListener('beforeunload', function (e) { if (state.changes) { saveDraft(); } });

    var tk = sget(TOKEN_KEY);
    if (tk) {
      state.token = tk;
      gh('GET', repoPath()).then(loadContent).then(startEditor).catch(function (err) {
        sdel(TOKEN_KEY); state.token = null; showLogin(friendly(err));
      });
    } else showLogin();
  }

  init();
})();
