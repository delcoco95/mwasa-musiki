/*
 * Mwasa Musiki : menu mobile, année, événements passés masqués,
 * consentement aux vidéos YouTube (rien n'est chargé avant l'accord), notes de musique au défilement.
 */
(function () {
  'use strict';
  var CONSENT_KEY = 'mwasa_consent';
  var CONSENT_DAYS = 182; // le choix est redemandé après 6 mois
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Menu mobile ---------- */
  var b = document.getElementById('burger'), m = document.getElementById('menu');
  if (b && m) {
    var set = function (open) { m.classList.toggle('open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    b.addEventListener('click', function () { set(!m.classList.contains('open')); });
    m.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  /* ---------- Année, agenda ---------- */
  var y = document.getElementById('annee');
  if (y) y.textContent = new Date().getFullYear();
  var now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  document.querySelectorAll('.events').forEach(function (list) {
    var left = 0;
    list.querySelectorAll('.event').forEach(function (ev) {
      var d = ev.getAttribute('data-date') || '';
      if (d && d < today) ev.classList.add('past'); else left++;
    });
    list.classList.toggle('all-past', left === 0);
  });

  /* ---------- Vidéos en lecture automatique : pas d'animation si l'utilisateur l'a demandé ---------- */
  if (reduceMotion) document.querySelectorAll('video[autoplay]').forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); v.setAttribute('controls', ''); });

  /* ---------- Consentement (YouTube) ---------- */
  function readConsent() {
    try {
      var c = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
      if (c && c.t && Date.now() - c.t < CONSENT_DAYS * 86400000) return c;
    } catch (e) {}
    return null;
  }
  function saveConsent(youtube) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ youtube: !!youtube, t: Date.now() })); } catch (e) {}
  }
  var banner = document.getElementById('consent');
  var ytBlocks = document.querySelectorAll('.yt[data-yt]');
  function showBanner(show) { if (banner) banner.hidden = !show; }
  function loadYouTube(el, autoplay) {
    if (el.querySelector('iframe')) return;
    var id = el.getAttribute('data-yt');
    if (!/^[\w-]{11}$/.test(id)) return;
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1' + (autoplay ? '&autoplay=1' : '');
    f.title = el.getAttribute('data-title') || 'Vidéo YouTube';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.setAttribute('allowfullscreen', '');
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    var ask = el.querySelector('.yt-ask'); if (ask) ask.remove();
    el.appendChild(f);
  }
  function askInline(el) {
    if (el.querySelector('.yt-ask')) return;
    var box = document.createElement('div');
    box.className = 'yt-ask';
    box.innerHTML = '<p>Cette vidéo est hébergée par YouTube (Google), qui dépose des cookies quand elle est lancée.</p>' +
      '<div class="row"><button type="button" class="btn btn-fill" data-yes>Autoriser et lire</button><button type="button" class="btn btn-ghost" data-no>Non merci</button></div>' +
      '<a href="https://www.youtube.com/watch?v=' + el.getAttribute('data-yt') + '" target="_blank" rel="noopener">Voir sur YouTube</a>';
    box.querySelector('[data-yes]').addEventListener('click', function () { saveConsent(true); showBanner(false); loadYouTube(el, true); });
    box.querySelector('[data-no]').addEventListener('click', function () { box.remove(); });
    el.appendChild(box);
    box.querySelector('[data-yes]').focus();
  }
  ytBlocks.forEach(function (el) {
    var btn = el.querySelector('.yt-play');
    if (btn) btn.addEventListener('click', function () {
      var c = readConsent();
      if (c && c.youtube) loadYouTube(el, true); else askInline(el);
    });
  });
  if (banner) {
    banner.addEventListener('click', function (e) {
      var a = e.target.closest('[data-consent]');
      if (!a) return;
      var yes = a.getAttribute('data-consent') === 'accept';
      saveConsent(yes);
      showBanner(false);
      if (!yes) ytBlocks.forEach(function (el) { var f = el.querySelector('iframe'); if (f) f.remove(); });
    });
    // Le bandeau n'apparaît que si la page contient des vidéos YouTube et qu'aucun choix n'a été fait
    if (ytBlocks.length && !readConsent()) showBanner(true);
  }
  document.querySelectorAll('[data-consent-open]').forEach(function (btn) {
    btn.addEventListener('click', function () { showBanner(true); var f = banner && banner.querySelector('button'); if (f) f.focus(); });
  });

  /* ---------- Notes de musique au défilement ---------- */
  var layer = document.getElementById('notes');
  if (layer && !reduceMotion) {
    var keys = layer.querySelectorAll('.keys i');
    var glyphs = ['♪', '♫', '♩', '♬'], tones = ['', 'b', 's'];
    var lastY = window.scrollY, lastNote = 0, lastKey = -1, ticking = false, live = 0;
    var onScroll = function () {
      ticking = false;
      var yNow = window.scrollY, dy = yNow - lastY;
      if (Math.abs(dy) < 2) return;
      lastY = yNow;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var k = Math.min(keys.length - 1, Math.floor(yNow / max * keys.length));
      if (k !== lastKey && keys[k]) {
        if (keys[lastKey]) keys[lastKey].classList.remove('on');
        keys[k].classList.add('on'); lastKey = k;
      }
      var t = performance.now();
      if (t - lastNote < 140 || live > 14) return;
      lastNote = t;
      var n = document.createElement('span');
      var tone = tones[Math.floor(Math.random() * tones.length)];
      n.className = 'n' + (dy < 0 ? ' down' : '') + (tone ? ' ' + tone : '');
      n.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      var keyBox = keys[k] ? keys[k].getBoundingClientRect() : { top: window.innerHeight / 2 };
      n.style.top = Math.max(20, Math.min(window.innerHeight - 40, keyBox.top + (Math.random() * 30 - 15))) + 'px';
      n.style.fontSize = (16 + Math.random() * 14) + 'px';
      n.style.setProperty('--dx', (-10 - Math.random() * 26) + 'px');
      live++;
      n.addEventListener('animationend', function () { n.remove(); live--; });
      layer.appendChild(n);
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  }
})();
