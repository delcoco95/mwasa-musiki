/*
 * Mwasa Musiki : fabrication de la page à partir de content/site.json.
 * Utilisé par l'administration (aperçu modifiable + génération de index.html)
 * et par le script de génération initial.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MwasaRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MONTHS_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  var FONTS = {
    'archivo': { name: 'Archivo (étroite, par défaut)', family: '"Archivo","Arial Narrow",Arial,sans-serif', file: 'archivo-variable.woff2', face: 'Archivo', range: '100 900', stretch: true },
    'oswald': { name: 'Oswald (étroite)', family: '"Oswald","Arial Narrow",sans-serif', file: 'oswald-variable.woff2', face: 'Oswald', range: '200 700' },
    'montserrat': { name: 'Montserrat (moderne)', family: '"Montserrat",Arial,sans-serif', file: 'montserrat-variable.woff2', face: 'Montserrat', range: '100 900' },
    'raleway': { name: 'Raleway (élégante)', family: '"Raleway",Arial,sans-serif', file: 'raleway-variable.woff2', face: 'Raleway', range: '100 900' },
    'playfair-display': { name: 'Playfair Display (classique)', family: '"Playfair Display",Georgia,serif', file: 'playfair-display-variable.woff2', face: 'Playfair Display', range: '400 900' },
    'lora': { name: 'Lora (serif douce)', family: '"Lora",Georgia,serif', file: 'lora-variable.woff2', face: 'Lora', range: '400 700' },
    'merriweather': { name: 'Merriweather (serif lisible)', family: '"Merriweather",Georgia,serif', file: 'merriweather-variable.woff2', face: 'Merriweather', range: '300 900' },
    'nunito-sans': { name: 'Nunito Sans (ronde, par défaut)', family: '"Nunito Sans",system-ui,-apple-system,"Segoe UI",sans-serif', file: 'nunito-sans-variable.woff2', face: 'Nunito Sans', range: '200 1000' },
    'open-sans': { name: 'Open Sans (neutre)', family: '"Open Sans",system-ui,sans-serif', file: 'open-sans-variable.woff2', face: 'Open Sans', range: '300 800' },
    'source-sans-3': { name: 'Source Sans 3 (sobre)', family: '"Source Sans 3",system-ui,sans-serif', file: 'source-sans-3-variable.woff2', face: 'Source Sans 3', range: '200 900' }
  };
  var THEME_DEFAULT = { creme: '#fef1e4', brun: '#6d2113', orange: '#f78138', sable: '#c2a791', nuit: '#1a130f', display: 'archivo', body: 'nunito-sans' };
  var COLOR_KEYS = ['creme', 'brun', 'orange', 'sable', 'nuit'];

  function themeCSS(theme, base) {
    base = base || '';
    var th = {}, k;
    for (k in THEME_DEFAULT) th[k] = THEME_DEFAULT[k];
    for (k in (theme || {})) if (theme[k]) th[k] = theme[k];
    var hex = /^#[0-9a-f]{6}$/i, css = '', vars = [];
    var changed = COLOR_KEYS.some(function (c) { return hex.test(th[c]) && th[c].toLowerCase() !== THEME_DEFAULT[c]; });
    COLOR_KEYS.forEach(function (c) { if (hex.test(th[c])) vars.push('--' + c + ':' + th[c]); });
    if (changed) {
      vars.push('--muted:color-mix(in srgb,var(--nuit) 70%,var(--creme))');
      vars.push('--line:color-mix(in srgb,var(--creme) 84%,var(--brun))');
      vars.push('--surface:color-mix(in srgb,var(--creme) 50%,#fff)');
      vars.push('--accent-ink:color-mix(in srgb,var(--orange) 70%,#000)');
    }
    var used = {};
    ['display', 'body'].forEach(function (role) {
      var f = FONTS[th[role]] || FONTS[THEME_DEFAULT[role]];
      vars.push('--f-' + role + ':' + f.family);
      used[f.file] = f;
    });
    Object.keys(used).forEach(function (file) {
      var f = used[file];
      if (f.face === 'Archivo' || f.face === 'Nunito Sans') return; // déjà déclarées dans site.css
      css += '@font-face{font-family:"' + f.face + '";src:url("' + base + 'assets/fonts/' + f.file + '") format("woff2");font-weight:' + f.range + ';font-style:normal;font-display:swap}';
    });
    return css + ':root{' + vars.join(';') + '}';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeHref(h) {
    h = String(h || '').trim();
    if (/^(https?:|mailto:|tel:|#)/i.test(h)) return h;
    if (/^[a-z0-9][a-z0-9._/-]*$/i.test(h)) return h; // chemin relatif du site
    return '#';
  }
  function isExternal(h) { return /^https?:/i.test(h); }
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], dow: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() };
  }
  function longDate(iso) {
    var p = parseDate(iso);
    return p ? (p.d === 1 ? '1er' : p.d) + ' ' + MONTHS[p.m - 1] + ' ' + p.y : '';
  }

  function render(data, opts) {
    opts = opts || {};
    var E = !!opts.edit;
    var base = opts.base || '';
    var resolve = opts.resolve || function (src) { return src; };

    function img(src) {
      var r = resolve(src);
      if (/^(data:|blob:|https?:)/.test(r)) return r;
      return base + r;
    }
    // Texte modifiable
    function t(path, value, tag, cls) {
      tag = tag || 'span';
      var a = cls ? ' class="' + cls + '"' : '';
      if (E) a += ' data-edit="' + path + '"';
      return '<' + tag + a + '>' + esc(value) + '</' + tag + '>';
    }
    // Image modifiable ({src, alt})
    function im(path, o, extra) {
      o = o || {};
      var a = ' src="' + esc(img(o.src)) + '" alt="' + esc(o.alt) + '"' + (extra || '');
      var fx = Number(o.focusX), fy = Number(o.focusY);
      if (isFinite(fx) && isFinite(fy) && (o.focusX != null)) a += ' style="object-position:' + Math.max(0, Math.min(100, fx)) + '% ' + Math.max(0, Math.min(100, fy)) + '%"';
      if (E) a += ' data-img="' + path + '"';
      return '<img' + a + '>';
    }
    // Lien modifiable ({label, href})
    function ln(path, o, cls) {
      o = o || {};
      var h = safeHref(o.href);
      var a = ' class="' + (cls || '') + '" href="' + esc(h) + '"';
      if (isExternal(h)) a += ' target="_blank" rel="noopener"';
      if (E) a += ' data-link="' + path + '"';
      return '<a' + a + '>' + esc(o.label) + '</a>';
    }
    function list(path, kind) { return E ? ' data-list="' + path + '" data-kind="' + kind + '"' : ''; }
    function item(path, i) { return E ? ' data-item="' + path + '.' + i + '"' : ''; }
    function head(sec, s, opt) {
      opt = opt || {};
      return '<div class="head"><div>' + t(sec + '.eyebrow', s.eyebrow, 'p', 'eyebrow') +
        t(sec + '.title', s.title, 'h2', '') + '</div>' + t(sec + '.intro', s.intro, 'p', '') + '</div>';
    }

    var d = data;
    var h = [];
    if (!opts.noTheme) h.push('<style id="mw-theme">' + themeCSS(d.theme, base) + '</style>');

    /* En-tête */
    h.push('<header class="top"><div class="wrap">' +
      '<a class="brand" href="#accueil" aria-label="Mwasa Musiki, retour en haut"><img src="' + base + 'img/logo.svg" alt="Logo Mwasa Musiki" width="104" height="57"></a>' +
      '<button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="menu"><span></span>Menu</button>' +
      '<nav aria-label="Navigation principale"><ul class="menu" id="menu">' +
      '<li><a href="#association">L\'association</a></li>' +
      '<li><a href="#ateliers">Ateliers</a></li>' +
      '<li><a href="#projets">Projets</a></li>' +
      '<li><a href="#agenda">Agenda</a></li>' +
      '<li><a href="#actualite">Actualité</a></li>' +
      '<li><a href="#contact">Contact</a></li>' +
      '<li>' + ln('nav.cta', d.nav.cta, 'btn btn-fill') + '</li>' +
      '</ul></nav></div></header>');

    h.push('<main id="accueil">');

    /* Hero */
    var he = d.hero;
    h.push('<section class="hero" aria-labelledby="h-hero"><div class="wrap"><div>' +
      t('hero.eyebrow', he.eyebrow, 'p', 'eyebrow') +
      '<h1 id="h-hero">' + t('hero.title1', he.title1, 'span', 'b') + '<br>' + t('hero.title2', he.title2) + '<br>' +
      t('hero.title3', he.title3, 'span', 'o') + ' ' + t('hero.title4', he.title4) + '</h1>' +
      t('hero.lede', he.lede, 'p', 'lede') +
      '<div class="ctas">' + ln('hero.cta1', he.cta1, 'btn btn-fill') + ln('hero.cta2', he.cta2, 'btn btn-ghost') + '</div>' +
      t('hero.note', he.note, 'p', 'note') +
      '</div><figure class="photo-hero">' + im('hero.image', he.image, ' width="853" height="1280" fetchpriority="high"') +
      t('hero.caption', he.caption, 'figcaption') + '</figure></div></section>');

    /* Publics */
    var pu = d.publics;
    h.push('<div class="ages" role="region" aria-label="Publics accueillis"><div class="wrap">' +
      t('publics.label', pu.label, 'span', 'lbl') +
      '<ul' + list('publics.items', 'public') + '>' +
      pu.items.map(function (x, i) { return '<li' + item('publics.items', i) + '>' + t('publics.items.' + i + '.text', x.text) + '</li>'; }).join('') +
      '</ul></div></div>');

    /* Association */
    var as = d.association;
    h.push('<section class="block" id="association" aria-labelledby="h-asso"><div class="wrap">' +
      head('association', as) +
      '<div class="about"><figure>' + im('association.image', as.image, ' width="900" height="600" loading="lazy"') + '</figure>' +
      '<div class="txt">' + t('association.big', as.big, 'p', 'big') + t('association.p1', as.p1, 'p') + t('association.p2', as.p2, 'p') +
      t('association.meta', as.meta, 'p', 'meta') + '</div></div></div></section>');

    /* Ateliers */
    var at = d.ateliers;
    h.push('<section class="block" id="ateliers" style="padding-top:0"><div class="wrap">' + head('ateliers', at) +
      '<div class="ateliers"' + list('ateliers.items', 'atelier') + '>' +
      at.items.map(function (x, i) {
        var p = 'ateliers.items.' + i;
        return '<article class="at"' + item('ateliers.items', i) + '>' + im(p + '.image', x.image, ' width="900" height="600" loading="lazy"') +
          '<div class="body">' + t(p + '.tag', x.tag, 'span', 'tag') + t(p + '.title', x.title, 'h3') + t(p + '.text', x.text, 'p') + '</div></article>';
      }).join('') + '</div></div></section>');

    /* Projets */
    var pr = d.projets;
    h.push('<section class="block projects" id="projets"><div class="wrap">' + head('projets', pr) +
      '<div class="stages"' + list('projets.items', 'projet') + '>' +
      pr.items.map(function (x, i) {
        var p = 'projets.items.' + i;
        return '<article class="stage"' + item('projets.items', i) + '>' + im(p + '.image', x.image, ' width="900" height="600" loading="lazy"') +
          '<div class="body">' + t(p + '.title', x.title, 'span', 'k') + t(p + '.text', x.text, 'p') + '</div></article>';
      }).join('') + '</div></div></section>');

    /* Agenda */
    var ag = d.agenda;
    var evs = (ag.items || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    // en mode édition on garde l'ordre des données pour que les numéros correspondent
    var evList = E ? (ag.items || []).map(function (x, i) { return { x: x, i: i }; }) : evs.map(function (x) { return { x: x, i: ag.items.indexOf(x) }; });
    h.push('<section class="block agenda-wrap" id="agenda"><div class="wrap">' + head('agenda', ag) +
      '<ul class="events' + (evList.length ? '' : ' all-past') + '"' + list('agenda.items', 'event') + '>' +
      evList.map(function (o) {
        var x = o.x, i = o.i, p = 'agenda.items.' + i, dt = parseDate(x.date);
        var info = [x.time, x.place].filter(Boolean).join(' · ');
        return '<li class="event" data-date="' + esc(x.date) + '"' + item('agenda.items', i) + '>' +
          '<div class="d"' + (E ? ' data-event="' + p + '"' : '') + '>' +
          (dt ? '<b>' + dt.d + '</b><span>' + MONTHS_SHORT[dt.m - 1] + '</span><small>' + dt.y + '</small>' : '<b>?</b><span>Date</span>') +
          '</div><div>' + t(p + '.title', x.title, 'h3') +
          '<p class="info"' + (E ? ' data-event="' + p + '"' : '') + '>' + esc((dt ? DAYS[dt.dow] + ' ' + longDate(x.date) : '') + (info ? ' · ' + info : '')) + '</p>' +
          t(p + '.text', x.text, 'p', 'txt') + '</div>' +
          (x.link && (x.link.label || E) ? '<div class="go">' + ln(p + '.link', x.link, 'btn btn-ghost') + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>' + t('agenda.empty', ag.empty, 'p', 'events-empty') + '</div></section>');

    /* Actualité */
    var ac = d.actualite;
    var news = (ac.items || []).map(function (x, i) {
      var p = 'actualite.items.' + i, dt = parseDate(x.date);
      var date = '<time datetime="' + esc(x.date) + '" class="when"' + (E ? ' data-event="' + p + '"' : '') + '>' + esc(longDate(x.date) || 'Ajouter une date') + '</time>';
      return '<article class="news' + (i ? ' news-sm' : '') + '"' + item('actualite.items', i) + '><div class="pic">' + im(p + '.image', x.image, ' width="1200" height="800" loading="lazy"') +
        (dt ? '<div class="date"><b>' + dt.d + '</b><span>' + MONTHS[dt.m - 1] + '</span></div>' : '') + '</div>' +
        '<div class="body">' + (x.tag || E ? t(p + '.tag', x.tag, 'span', 'pill') : '') + t(p + '.title', x.title, 'h3') + t(p + '.text', x.text, 'p') + date +
        (x.link && (x.link.label || E) ? ln(p + '.link', x.link, 'btn btn-dark') : '') + '</div></article>';
    });
    h.push('<section class="block" id="actualite"><div class="wrap">' + head('actualite', ac) +
      '<div class="news-list"' + list('actualite.items', 'news') + '>' + news.join('') + '</div></div></section>');

    /* Adhésion */
    var ad = d.adhesion;
    h.push('<section class="block join" id="adhesion"><div class="wrap grid"><div>' +
      t('adhesion.eyebrow', ad.eyebrow, 'p', 'eyebrow') + t('adhesion.title', ad.title, 'h2') + t('adhesion.lead', ad.lead, 'p', 'lead') +
      '<figure>' + im('adhesion.image', ad.image, ' width="900" height="600" loading="lazy"') + '</figure></div>' +
      '<div class="card">' + t('adhesion.cardTitle', ad.cardTitle, 'h3') +
      '<dl' + list('adhesion.rows', 'row') + '>' + ad.rows.map(function (r, i) {
        return '<div class="row"' + item('adhesion.rows', i) + '>' + t('adhesion.rows.' + i + '.k', r.k, 'dt') + t('adhesion.rows.' + i + '.v', r.v, 'dd') + '</div>';
      }).join('') + '</dl>' +
      ln('adhesion.button', ad.button, 'btn btn-fill') + t('adhesion.note', ad.note, 'small') + '</div></div></section>');

    /* Contact */
    var co = d.contact;
    h.push('<section class="block" id="contact"><div class="wrap">' + head('contact', co) +
      '<div class="contact"' + list('contact.items', 'contact') + '>' + co.items.map(function (x, i) {
        var p = 'contact.items.' + i;
        return '<div class="ct"' + item('contact.items', i) + '>' + t(p + '.title', x.title, 'h3') + t(p + '.text', x.text, 'p') + ln(p + '.link', x.link, '') + '</div>';
      }).join('') + '</div></div></section>');

    h.push('</main>');

    /* Pied de page */
    var fo = d.footer;
    h.push('<footer><div class="wrap"><span class="brand"><img src="' + base + 'img/logo.svg" alt="Logo Mwasa Musiki" width="86" height="47"></span>' +
      '<span>© <span id="annee">' + new Date().getFullYear() + '</span> ' + t('footer.text', fo.text) + '</span>' +
      '<a href="#accueil">Haut de page ↑</a>' + t('footer.credits', fo.credits, 'p', 'credits') +
      '<a class="admin-link" href="' + base + 'admin/" rel="nofollow">Espace administration</a></div></footer>');

    return h.join('\n');
  }

  // Document complet publié (index.html)
  function fullDocument(data) {
    var m = data.meta || {};
    return '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '<title>' + esc(m.title) + '</title>\n' +
      '<meta name="description" content="' + esc(m.description) + '">\n' +
      '<meta property="og:title" content="' + esc(m.title) + '">\n' +
      '<meta property="og:description" content="' + esc(m.description) + '">\n' +
      '<meta property="og:image" content="img/hero.webp">\n<meta property="og:locale" content="fr_FR">\n' +
      '<link rel="icon" type="image/svg+xml" href="img/logo.svg">\n' +
      '<link rel="preload" href="assets/fonts/archivo-variable.woff2" as="font" type="font/woff2" crossorigin>\n' +
      '<link rel="stylesheet" href="assets/site.css">\n<style id="mw-theme">' + themeCSS(data.theme, '') + '</style>\n</head>\n<body>\n' +
      '<!-- Page générée automatiquement depuis content/site.json par l\'administration. Modifiez le contenu sur /admin/. -->\n' +
      render(data, { noTheme: true }) + '\n<script src="assets/site.js" defer></script>\n</body>\n</html>\n';
  }

  return { render: render, fullDocument: fullDocument, themeCSS: themeCSS, FONTS: FONTS, THEME_DEFAULT: THEME_DEFAULT, esc: esc, longDate: longDate, parseDate: parseDate };
});
