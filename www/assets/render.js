/*
 * Mwasa Musiki : fabrication des pages à partir de content/site.json.
 * La page d'accueil est une liste de sections (déplaçables, masquables, ajoutables depuis l'administration).
 * Utilisé par l'administration (aperçu modifiable, publication de accueil.html et mentions-legales.html)
 * et par build.js (pages de départ).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MwasaRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 'r4';
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MONTHS_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  var FONTS = {
    'archivo': { name: 'Archivo (étroite, par défaut)', family: '"Archivo","Arial Narrow",Arial,sans-serif', file: 'archivo-variable.woff2', face: 'Archivo', range: '100 900' },
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
  var THEME_DEFAULT = { creme: '#fef1e4', brun: '#6d2113', orange: '#f78138', sable: '#c2a791', nuit: '#1a130f', display: 'archivo', body: 'nunito-sans', notes: true };
  var COLOR_KEYS = ['creme', 'brun', 'orange', 'sable', 'nuit'];

  /* Types de sections proposés dans l'administration */
  var SECTION_TYPES = {
    hero: { name: 'Grand titre d\'accueil', desc: 'Titre, texte, boutons et grande photo ou vidéo.' },
    band: { name: 'Bandeau de mots', desc: 'Une courte liste sur fond coloré (ex. : publics accueillis).' },
    about: { name: 'Présentation', desc: 'Titre, photo ou vidéo et plusieurs paragraphes.' },
    'text-media': { name: 'Texte et photo/vidéo', desc: 'Un texte à côté d\'une photo ou d\'une vidéo, avec un bouton.' },
    cards: { name: 'Cartes', desc: 'Une grille de cartes avec photo, étiquette, titre et texte (ex. : ateliers).' },
    stages: { name: 'Cartes sur fond coloré', desc: 'Des cartes avec grand titre sur un fond de couleur (ex. : projets).' },
    gallery: { name: 'Galerie', desc: 'Une grille de photos et de vidéos avec légendes.' },
    video: { name: 'Vidéo', desc: 'Une grande vidéo (YouTube ou fichier) avec un titre.' },
    slots: { name: 'Horaires', desc: 'Des créneaux horaires et un lieu.' },
    agenda: { name: 'Agenda', desc: 'Les prochains événements ; les dates passées disparaissent seules.' },
    news: { name: 'Actualités', desc: 'Des nouvelles avec photo, date et lien.' },
    quote: { name: 'Citation', desc: 'Une phrase mise en valeur, avec son auteur.' },
    cta: { name: 'Appel à l\'action', desc: 'Un titre, une phrase et un bouton sur fond coloré.' },
    text: { name: 'Texte libre', desc: 'Un titre et des paragraphes.' },
    join: { name: 'Adhésion', desc: 'Texte, photo et carte de tarifs avec bouton.' },
    contact: { name: 'Contact', desc: 'Des blocs de contact avec lien (téléphone, e-mail…).' }
  };
  var BACKGROUNDS = { '': 'Automatique', creme: 'Fond de page', surface: 'Blanc chaud', sable: 'Sable', orange: 'Accent', brun: 'Couleur principale', nuit: 'Sombre' };
  var NETWORKS = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', autre: 'Autre lien' };

  function themeCSS(theme, base) {
    base = base || '';
    var th = {}, k;
    for (k in THEME_DEFAULT) th[k] = THEME_DEFAULT[k];
    for (k in (theme || {})) if (theme[k] != null && theme[k] !== '') th[k] = theme[k];
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
    if (/^[a-z0-9][a-z0-9._/#-]*$/i.test(h)) return h; // chemin relatif du site
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
  function slugify(s) {
    return String(s || 'section').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';
  }
  function youtubeId(u) {
    u = String(u || '').trim();
    if (/^[\w-]{11}$/.test(u)) return u;
    var m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i.exec(u);
    return m ? m[1] : null;
  }
  /* Texte en paragraphes, avec liens automatiques (adresses web et e-mails) après échappement */
  function paragraphs(text, linkify) {
    return String(text || '').split(/\n\s*\n/).map(function (p) {
      var h = esc(p.trim()).replace(/\n/g, '<br>');
      if (linkify) {
        h = h.replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)»])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
          .replace(/\b([\w.+-]+@[\w-]+\.[\w.-]+[a-z])\b/gi, '<a href="mailto:$1">$1</a>');
      }
      return h ? '<p>' + h + '</p>' : '';
    }).join('');
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return 's' + Math.random().toString(36).slice(2, 9); }

  /* ---------- Contenu par défaut et migration de l'ancien format ---------- */
  var DEFAULT_SOCIAL = [
    { network: 'youtube', href: 'https://www.youtube.com/@mwasamusiki2675' },
    { network: 'facebook', href: 'https://www.facebook.com/MwasaMusiki/' },
    { network: 'instagram', href: 'https://www.instagram.com/mwasamusiki/' }
  ];
  var DEFAULT_CONSENT = {
    text: 'Ce site ne dépose aucun cookie publicitaire ni de mesure d\'audience. Les vidéos YouTube, elles, déposent des cookies de Google quand on les lance : vous pouvez les autoriser ou les refuser. Vous pourrez changer d\'avis à tout moment avec le lien « Gestion des cookies » en bas de page.',
    accept: 'Autoriser les vidéos YouTube',
    refuse: 'Refuser'
  };
  var DEFAULT_LEGAL = {
    title: 'Mentions légales et confidentialité',
    updated: '2026-10-23',
    sections: [
      { title: 'Éditeur du site', text: 'Association Mwasa Musiki, association loi 1901.\nSiège social : [adresse du siège à compléter]\nNuméro RNA : [W06… à compléter]\nTéléphone : 06 10 83 42 69\nE-mail : assomwasamusiki@gmail.com' },
      { title: 'Directeur ou directrice de la publication', text: '[Nom de la présidente ou du président de l\'association, à compléter]' },
      { title: 'Hébergeur', text: 'OVH SAS\n2 rue Kellermann, 59100 Roubaix, France\nRCS Lille Métropole 424 761 419\nTéléphone : 1007 (depuis la France)\nhttps://www.ovhcloud.com' },
      { title: 'Propriété intellectuelle et droit à l\'image', text: 'Les textes, photos, vidéos et le logo de ce site appartiennent à l\'association Mwasa Musiki ou sont utilisés avec l\'accord de leurs auteurs. Toute reproduction sans autorisation est interdite.\n\nLes personnes photographiées ou filmées ont donné leur accord ; pour les mineurs, l\'accord a été donné par leurs parents ou représentants légaux. Pour demander le retrait d\'une photo ou d\'une vidéo, écrivez à assomwasamusiki@gmail.com : nous la retirons dans les meilleurs délais.\n\nLes polices de caractères sont publiées sous licence SIL Open Font License 1.1.' },
      { title: 'Données personnelles', text: 'Le site ne contient pas de formulaire : il ne collecte aucune donnée personnelle sur les visiteurs. Si vous nous écrivez par e-mail ou nous appelez, vos coordonnées servent uniquement à vous répondre et ne sont ni vendues ni transmises.\n\nLes adhésions en ligne se font sur HelloAsso, qui traite les données selon sa propre politique de confidentialité : https://www.helloasso.com/confidentialite\n\nResponsable du traitement : l\'association Mwasa Musiki, joignable à assomwasamusiki@gmail.com.\n\nSécurité de l\'espace d\'administration : pour protéger le site contre les intrusions, la date, l\'adresse IP et le navigateur utilisés lors des connexions à l\'espace d\'administration sont enregistrés (intérêt légitime : sécurité du site). Ces informations sont conservées au maximum 6 mois. L\'hébergeur OVH conserve également des journaux techniques de connexion, selon ses propres obligations légales.\n\nVous disposez d\'un droit d\'accès, de rectification, d\'effacement, d\'opposition, de limitation et de portabilité de vos données. Pour l\'exercer, écrivez à assomwasamusiki@gmail.com. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL : https://www.cnil.fr' },
      { title: 'Cookies', text: 'Ce site n\'utilise aucun cookie publicitaire ni de mesure d\'audience.\n\nSeul l\'espace d\'administration, réservé aux responsables de l\'association, dépose un cookie de session strictement nécessaire à la connexion ; il est dispensé de consentement.\n\nLes vidéos YouTube intégrées au site ne sont chargées qu\'avec votre accord : tant que vous ne les avez pas autorisées, aucun contenu n\'est demandé à YouTube et aucun cookie n\'est déposé. Si vous les autorisez, Google (YouTube) peut déposer des cookies, selon sa politique : https://policies.google.com/privacy\n\nVotre choix est conservé 6 mois dans votre navigateur. Vous pouvez le modifier à tout moment avec le lien « Gestion des cookies » en bas de chaque page.' },
      { title: 'Liens externes', text: 'Le site contient des liens vers d\'autres sites (HelloAsso, réseaux sociaux, cartes). L\'association n\'est pas responsable de leur contenu ni de leur politique de confidentialité.' }
    ]
  };

  function normalize(data) {
    var d = clone(data || {});
    d.meta = d.meta || { title: 'Mwasa Musiki', description: '' };
    d.theme = d.theme || {};
    d.nav = d.nav || { cta: { label: 'Adhérer', href: '#adhesion' } };
    if (!Array.isArray(d.social)) d.social = clone(DEFAULT_SOCIAL);
    d.footer = d.footer || { text: 'Association Mwasa Musiki · Nice' };
    delete d.footer.credits;
    d.footer.legalLabel = d.footer.legalLabel || 'Mentions légales et confidentialité';
    d.footer.cookiesLabel = d.footer.cookiesLabel || 'Gestion des cookies';
    d.consent = d.consent || clone(DEFAULT_CONSENT);
    d.legal = d.legal || clone(DEFAULT_LEGAL);
    if (!Array.isArray(d.sections)) {
      var mk = function (type, key, id, label, show) {
        if (!d[key]) return null;
        var s = { uid: uid(), type: type, id: id, hidden: false, menu: { show: !!show, label: label }, bg: '', data: d[key] };
        delete d[key];
        return s;
      };
      d.sections = [
        mk('hero', 'hero', 'accueil', 'Accueil', false),
        mk('band', 'publics', 'publics', 'Pour qui', false),
        mk('about', 'association', 'association', 'L\'association', true),
        mk('cards', 'ateliers', 'ateliers', 'Ateliers', true),
        mk('slots', 'horaires', 'horaires', 'Horaires', true),
        mk('stages', 'projets', 'projets', 'Projets', false),
        mk('agenda', 'agenda', 'agenda', 'Agenda', true),
        mk('news', 'actualite', 'actualite', 'Actualité', true),
        mk('join', 'adhesion', 'adhesion', 'Adhésion', false),
        mk('contact', 'contact', 'contact', 'Contact', true)
      ].filter(Boolean);
    }
    d.sections.forEach(function (s) {
      s.uid = s.uid || uid();
      s.menu = s.menu || { show: false, label: '' };
      s.data = s.data || {};
      if (!s.id) s.id = slugify(s.menu.label || s.type);
    });
    d.version = 3;
    return d;
  }

  /* Nouvelle section d'un type donné, avec un contenu d'exemple à remplacer */
  function newSection(type) {
    var img = function (src, alt) { return { src: src || 'img/photos/groupe-association.webp', alt: alt || '' }; };
    var data = {
      hero: { eyebrow: 'Association culturelle · Nice', title1: 'Votre', title2: 'grand titre', title3: 'ici', title4: '.', lede: 'Une phrase d\'introduction.', cta1: { label: 'Bouton principal', href: '#contact' }, cta2: { label: '', href: '' }, note: '', image: img('img/photos/opera-chanteuse.webp'), caption: '' },
      band: { label: 'Titre', items: [{ text: 'Premier mot' }, { text: 'Deuxième mot' }] },
      about: { eyebrow: 'Sur-titre', title: 'Titre de la section', intro: 'Une phrase d\'introduction.', image: img(), big: 'Une phrase importante mise en valeur.', p1: 'Premier paragraphe.', p2: 'Deuxième paragraphe.', meta: '' },
      'text-media': { eyebrow: 'Sur-titre', title: 'Titre de la section', text: 'Écrivez votre texte ici.\n\nLaissez une ligne vide pour commencer un nouveau paragraphe.', button: { label: 'En savoir plus', href: '#contact' }, image: img('img/photos/atelier-choeur.webp'), reverse: false },
      cards: { eyebrow: 'Sur-titre', title: 'Titre des cartes', intro: 'Une phrase d\'introduction.', items: [{ image: img('img/photos/atelier-choeur.webp'), tag: 'Étiquette', title: 'Première carte', text: 'Texte de la carte.' }, { image: img('img/photos/atelier-solo.webp'), tag: 'Étiquette', title: 'Deuxième carte', text: 'Texte de la carte.' }] },
      stages: { eyebrow: 'Sur-titre', title: 'Titre des cartes', intro: 'Une phrase d\'introduction.', items: [{ image: img('img/photos/opera-logo.webp'), title: 'Première carte', text: 'Texte de la carte.' }, { image: img('img/photos/cabaret-21-juin.webp'), title: 'Deuxième carte', text: 'Texte de la carte.' }] },
      gallery: { eyebrow: 'Galerie', title: 'Nos moments', intro: '', items: [{ image: img('img/photos/opera-logo.webp'), caption: 'Légende' }, { image: img('img/photos/cabaret-21-juin.webp'), caption: 'Légende' }, { image: img('img/photos/atelier-guitare.webp'), caption: 'Légende' }] },
      video: { eyebrow: 'Vidéo', title: 'Titre de la vidéo', intro: 'Quelques mots pour présenter la vidéo.', image: { src: '', alt: 'Vidéo de l\'association' } },
      slots: { eyebrow: 'Horaires', title: 'Quand venir', intro: '', items: [{ title: 'Atelier', when: 'Jour · horaire' }], place: 'Adresse', link: { label: '', href: '' } },
      agenda: { eyebrow: 'Agenda', title: 'Prochains événements', intro: '', empty: 'Aucun événement annoncé pour le moment.', items: [] },
      news: { eyebrow: 'Actualité', title: 'Dernières nouvelles', intro: '', items: [] },
      quote: { text: 'Une phrase qui donne envie de chanter.', author: 'Prénom, membre de l\'association' },
      cta: { title: 'Envie de nous rejoindre ?', text: 'Une phrase pour convaincre.', button: { label: 'Adhérer', href: '#adhesion' } },
      text: { eyebrow: 'Sur-titre', title: 'Titre', text: 'Écrivez votre texte ici.\n\nLaissez une ligne vide pour commencer un nouveau paragraphe.' },
      join: { eyebrow: 'Adhésion', title: 'Rejoignez-nous', lead: 'Une phrase.', image: img('img/photos/adhesion-guitare.webp'), cardTitle: 'Titre de la carte', rows: [{ k: 'Tarif', v: '…' }], button: { label: 'Adhérer', href: 'https://www.helloasso.com/associations/association-mwasa-musiki' }, note: '' },
      contact: { eyebrow: 'Contact', title: 'Nous contacter', intro: '', items: [{ title: 'E-mail', text: '', link: { label: 'assomwasamusiki@gmail.com', href: 'mailto:assomwasamusiki@gmail.com' } }] }
    }[type];
    var label = SECTION_TYPES[type] ? SECTION_TYPES[type].name : 'Section';
    return { uid: uid(), type: type, id: slugify(label) + '-' + Math.random().toString(36).slice(2, 5), hidden: false, menu: { show: false, label: label }, bg: '', data: data || {} };
  }

  /* ---------- Icônes des réseaux sociaux ---------- */
  var ICONS = {
    /* Logos officiels des réseaux (Simple Icons, licence CC0), tous dans la même couleur et la même taille */
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    autre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14l4-4M8.5 11.5l-2 2a3 3 0 0 0 4.2 4.2l2-2M15.5 12.5l2-2a3 3 0 0 0-4.2-4.2l-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ---------- Rendu ---------- */
  function makeKit(opts) {
    var E = !!opts.edit, base = opts.base || '', resolve = opts.resolve || function (s) { return s; };
    var K = {
      E: E, base: base,
      url: function (src) { var r = resolve(src); return /^(data:|blob:|https?:)/.test(r) ? r : base + r; },
      t: function (path, value, tag, cls) {
        tag = tag || 'span';
        var a = cls ? ' class="' + cls + '"' : '';
        if (E) a += ' data-edit="' + path + '"';
        return '<' + tag + a + '>' + esc(value) + '</' + tag + '>';
      },
      tx: function (path, value, cls, linkify) { // texte en plusieurs paragraphes
        var a = ' class="prose' + (cls ? ' ' + cls : '') + '"';
        if (E) a += ' data-textarea="' + path + '"';
        return '<div' + a + '>' + (paragraphs(value, linkify) || (E ? '<p class="empty">Cliquez pour écrire…</p>' : '')) + '</div>';
      },
      ln: function (path, o, cls) {
        o = o || {};
        var h = safeHref(o.href), a = ' class="' + (cls || '') + '" href="' + esc(h) + '"';
        if (isExternal(h)) a += ' target="_blank" rel="noopener"';
        if (E) a += ' data-link="' + path + '"';
        return '<a' + a + '>' + esc(o.label) + '</a>';
      },
      maybeLn: function (path, o, cls) { return o && (o.label || E) ? K.ln(path, o, cls) : ''; },
      list: function (path, kind) { return E ? ' data-list="' + path + '" data-kind="' + kind + '"' : ''; },
      item: function (path, i) { return E ? ' data-item="' + path + '.' + i + '"' : ''; },
      /* Photo, vidéo (fichier) ou vidéo YouTube, au même emplacement */
      media: function (path, o, extra) {
        o = o || {};
        var pos = '';
        if (o.focusX != null && isFinite(+o.focusX) && isFinite(+o.focusY)) pos = 'object-position:' + Math.max(0, Math.min(100, +o.focusX)) + '% ' + Math.max(0, Math.min(100, +o.focusY)) + '%';
        var edit = E ? ' data-img="' + path + '"' : '';
        var v = o.video;
        if (v && v.kind === 'file' && v.src) {
          // La vidéo s'affiche directement (première image de la vidéo), avec ses commandes de lecture
          var auto = v.autoplay ? ' autoplay muted loop' : '';
          return '<video class="media-video" src="' + esc(K.url(v.src)) + '#t=0.1" preload="metadata" playsinline' + auto + (E ? ' muted' : ' controls') +
            (o.alt ? ' aria-label="' + esc(o.alt) + '"' : '') + (pos ? ' style="' + pos + '"' : '') + edit + '></video>';
        }
        if (v && v.kind === 'youtube' && youtubeId(v.id)) {
          // Lecteur YouTube affiché directement dès que le visiteur a accepté (RGPD) ; sinon un cadre noir demande l'accord
          var id = youtubeId(v.id);
          return '<div class="yt" data-yt="' + esc(id) + '" data-title="' + esc(o.alt || 'Vidéo') + '">' +
            (E ? '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?rel=0" title="' + esc(o.alt || 'Vidéo') + '" tabindex="-1"></iframe><span class="yt-edit"' + edit + '><b>Modifier la vidéo</b></span>' : '') + '</div>';
        }
        var imgTag = '<img src="' + esc(K.url(o.src)) + '" alt="' + esc(o.alt) + '"' + (extra || '') + (pos ? ' style="' + pos + '"' : '') + edit + '>';
        return imgTag;
      },
      head: function (P, s) {
        return '<div class="head"><div>' + K.t(P + '.eyebrow', s.eyebrow, 'p', 'eyebrow') + K.t(P + '.title', s.title, 'h2', '') + '</div>' +
          (s.intro || E ? K.t(P + '.intro', s.intro, 'p', '') : '') + '</div>';
      }
    };
    return K;
  }

  var RENDERERS = {
    hero: function (K, P, he) {
      return '<div class="wrap"><div>' + K.t(P + '.eyebrow', he.eyebrow, 'p', 'eyebrow') +
        '<h1>' + K.t(P + '.title1', he.title1, 'span', 'b') + '<br>' + K.t(P + '.title2', he.title2) + '<br>' +
        K.t(P + '.title3', he.title3, 'span', 'o') + ' ' + K.t(P + '.title4', he.title4) + '</h1>' +
        K.t(P + '.lede', he.lede, 'p', 'lede') +
        '<div class="ctas">' + K.maybeLn(P + '.cta1', he.cta1, 'btn btn-fill') + K.maybeLn(P + '.cta2', he.cta2, 'btn btn-ghost') + '</div>' +
        (he.note || K.E ? K.t(P + '.note', he.note, 'p', 'note') : '') +
        '</div><figure class="photo-hero">' + K.media(P + '.image', he.image, ' width="853" height="1280" fetchpriority="high"') +
        (he.caption || K.E ? K.t(P + '.caption', he.caption, 'figcaption') : '') + '</figure></div>';
    },
    band: function (K, P, pu) {
      return '<div class="wrap">' + K.t(P + '.label', pu.label, 'span', 'lbl') +
        '<ul' + K.list(P + '.items', 'public') + '>' +
        (pu.items || []).map(function (x, i) { return '<li' + K.item(P + '.items', i) + '>' + K.t(P + '.items.' + i + '.text', x.text) + '</li>'; }).join('') +
        '</ul></div>';
    },
    about: function (K, P, as) {
      return '<div class="wrap">' + K.head(P, as) +
        '<div class="about"><figure>' + K.media(P + '.image', as.image, ' width="900" height="600" loading="lazy"') + '</figure>' +
        '<div class="txt">' + K.t(P + '.big', as.big, 'p', 'big') + K.t(P + '.p1', as.p1, 'p') + K.t(P + '.p2', as.p2, 'p') +
        (as.meta || K.E ? K.t(P + '.meta', as.meta, 'p', 'meta') : '') + '</div></div></div>';
    },
    'text-media': function (K, P, s) {
      return '<div class="wrap"><div class="tm' + (s.reverse ? ' tm-rev' : '') + '"><div class="tm-text">' +
        K.t(P + '.eyebrow', s.eyebrow, 'p', 'eyebrow') + K.t(P + '.title', s.title, 'h2') + K.tx(P + '.text', s.text) +
        (s.button && (s.button.label || K.E) ? '<div class="ctas">' + K.ln(P + '.button', s.button, 'btn btn-fill') + '</div>' : '') +
        '</div><figure class="tm-media">' + K.media(P + '.image', s.image, ' width="900" height="600" loading="lazy"') + '</figure></div></div>';
    },
    cards: function (K, P, at) {
      return '<div class="wrap">' + K.head(P, at) + '<div class="ateliers"' + K.list(P + '.items', 'atelier') + '>' +
        (at.items || []).map(function (x, i) {
          var p = P + '.items.' + i;
          return '<article class="at"' + K.item(P + '.items', i) + '>' + K.media(p + '.image', x.image, ' width="900" height="600" loading="lazy"') +
            '<div class="body">' + (x.tag || K.E ? K.t(p + '.tag', x.tag, 'span', 'tag') : '') + K.t(p + '.title', x.title, 'h3') + K.t(p + '.text', x.text, 'p') + '</div></article>';
        }).join('') + '</div></div>';
    },
    stages: function (K, P, pr) {
      return '<div class="wrap">' + K.head(P, pr) + '<div class="stages"' + K.list(P + '.items', 'projet') + '>' +
        (pr.items || []).map(function (x, i) {
          var p = P + '.items.' + i;
          return '<article class="stage"' + K.item(P + '.items', i) + '>' + K.media(p + '.image', x.image, ' width="900" height="600" loading="lazy"') +
            '<div class="body">' + K.t(p + '.title', x.title, 'span', 'k') + K.t(p + '.text', x.text, 'p') + '</div></article>';
        }).join('') + '</div></div>';
    },
    gallery: function (K, P, g) {
      return '<div class="wrap">' + K.head(P, g) + '<div class="gallery"' + K.list(P + '.items', 'photo') + '>' +
        (g.items || []).map(function (x, i) {
          var p = P + '.items.' + i;
          return '<figure class="gal"' + K.item(P + '.items', i) + '>' + K.media(p + '.image', x.image, ' width="900" height="600" loading="lazy"') +
            (x.caption || K.E ? K.t(p + '.caption', x.caption, 'figcaption') : '') + '</figure>';
        }).join('') + '</div></div>';
    },
    video: function (K, P, v) {
      var has = v.image && v.image.video;
      if (!has && !K.E) return '<div class="wrap">' + K.head(P, v) + '</div>';
      return '<div class="wrap">' + K.head(P, v) + '<figure class="video-main">' + (has ? K.media(P + '.image', v.image, ' width="1600" height="900" loading="lazy"') :
        '<div class="video-empty" data-img="' + P + '.image"><span>▶</span>Cliquez ici pour choisir la vidéo<small>fichier MP4 ou lien YouTube</small></div>') + '</figure></div>';
    },
    slots: function (K, P, ho) {
      return '<div class="wrap">' + K.head(P, ho) + '<div class="slots"' + K.list(P + '.items', 'slot') + '>' +
        (ho.items || []).map(function (x, i) {
          var p = P + '.items.' + i;
          return '<div class="slot"' + K.item(P + '.items', i) + '>' + K.t(p + '.title', x.title, 'h3') + K.t(p + '.when', x.when, 'p', 'when') + '</div>';
        }).join('') + '</div>' +
        (ho.place || K.E ? '<p class="place">' + K.t(P + '.place', ho.place) + ' ' + K.maybeLn(P + '.link', ho.link, 'lnk') + '</p>' : '') + '</div>';
    },
    agenda: function (K, P, ag) {
      var items = ag.items || [];
      var order = items.map(function (x, i) { return { x: x, i: i }; });
      if (!K.E) order.sort(function (a, b) { return String(a.x.date).localeCompare(String(b.x.date)); });
      return '<div class="wrap">' + K.head(P, ag) + '<ul class="events' + (order.length ? '' : ' all-past') + '"' + K.list(P + '.items', 'event') + '>' +
        order.map(function (o) {
          var x = o.x, p = P + '.items.' + o.i, dt = parseDate(x.date);
          var info = [x.time, x.place].filter(Boolean).join(' · ');
          return '<li class="event" data-date="' + esc(x.date) + '"' + K.item(P + '.items', o.i) + '>' +
            '<div class="d"' + (K.E ? ' data-event="' + p + '"' : '') + '>' +
            (dt ? '<b>' + dt.d + '</b><span>' + MONTHS_SHORT[dt.m - 1] + '</span><small>' + dt.y + '</small>' : '<b>?</b><span>Date</span>') +
            '</div><div>' + K.t(p + '.title', x.title, 'h3') +
            '<p class="info"' + (K.E ? ' data-event="' + p + '"' : '') + '>' + esc((dt ? DAYS[dt.dow] + ' ' + longDate(x.date) : '') + (info ? ' · ' + info : '')) + '</p>' +
            K.t(p + '.text', x.text, 'p', 'txt') + '</div>' +
            (x.link && (x.link.label || K.E) ? '<div class="go">' + K.ln(p + '.link', x.link, 'btn btn-ghost') + '</div>' : '') + '</li>';
        }).join('') + '</ul>' + K.t(P + '.empty', ag.empty, 'p', 'events-empty') + '</div>';
    },
    news: function (K, P, ac) {
      return '<div class="wrap">' + K.head(P, ac) + '<div class="news-list"' + K.list(P + '.items', 'news') + '>' +
        (ac.items || []).map(function (x, i) {
          var p = P + '.items.' + i, dt = parseDate(x.date);
          var date = '<time datetime="' + esc(x.date) + '" class="when"' + (K.E ? ' data-event="' + p + '"' : '') + '>' + esc(longDate(x.date) || 'Ajouter une date') + '</time>';
          return '<article class="news' + (i ? ' news-sm' : '') + '"' + K.item(P + '.items', i) + '><div class="pic">' + K.media(p + '.image', x.image, ' width="1200" height="800" loading="lazy"') +
            (dt ? '<div class="date"><b>' + dt.d + '</b><span>' + MONTHS[dt.m - 1] + '</span></div>' : '') + '</div>' +
            '<div class="body">' + (x.tag || K.E ? K.t(p + '.tag', x.tag, 'span', 'pill') : '') + K.t(p + '.title', x.title, 'h3') + K.t(p + '.text', x.text, 'p') + date +
            K.maybeLn(p + '.link', x.link, 'btn btn-dark') + '</div></article>';
        }).join('') + '</div></div>';
    },
    quote: function (K, P, q) {
      return '<div class="wrap"><figure class="quote"><blockquote>' + K.t(P + '.text', q.text, 'p') + '</blockquote>' +
        (q.author || K.E ? '<figcaption>' + K.t(P + '.author', q.author) + '</figcaption>' : '') + '</figure></div>';
    },
    cta: function (K, P, c) {
      return '<div class="wrap cta-box"><div>' + K.t(P + '.title', c.title, 'h2') + K.t(P + '.text', c.text, 'p') + '</div>' +
        K.maybeLn(P + '.button', c.button, 'btn btn-dark') + '</div>';
    },
    text: function (K, P, s) {
      return '<div class="wrap narrow">' + K.t(P + '.eyebrow', s.eyebrow, 'p', 'eyebrow') + K.t(P + '.title', s.title, 'h2') + K.tx(P + '.text', s.text, '', true) + '</div>';
    },
    join: function (K, P, ad) {
      return '<div class="wrap grid"><div>' + K.t(P + '.eyebrow', ad.eyebrow, 'p', 'eyebrow') + K.t(P + '.title', ad.title, 'h2') + K.t(P + '.lead', ad.lead, 'p', 'lead') +
        '<figure>' + K.media(P + '.image', ad.image, ' width="900" height="600" loading="lazy"') + '</figure></div>' +
        '<div class="card">' + K.t(P + '.cardTitle', ad.cardTitle, 'h3') +
        '<dl' + K.list(P + '.rows', 'row') + '>' + (ad.rows || []).map(function (r, i) {
          return '<div class="row"' + K.item(P + '.rows', i) + '>' + K.t(P + '.rows.' + i + '.k', r.k, 'dt') + K.t(P + '.rows.' + i + '.v', r.v, 'dd') + '</div>';
        }).join('') + '</dl>' + K.maybeLn(P + '.button', ad.button, 'btn btn-fill') + (ad.note || K.E ? K.t(P + '.note', ad.note, 'small') : '') + '</div></div>';
    },
    contact: function (K, P, co) {
      return '<div class="wrap">' + K.head(P, co) + '<div class="contact"' + K.list(P + '.items', 'contact') + '>' +
        (co.items || []).map(function (x, i) {
          var p = P + '.items.' + i;
          return '<div class="ct"' + K.item(P + '.items', i) + '>' + K.t(p + '.title', x.title, 'h3') + (x.text || K.E ? K.t(p + '.text', x.text, 'p') : '') + K.ln(p + '.link', x.link, '') + '</div>';
        }).join('') + '</div></div>';
    }
  };
  /* Balise et classes de chaque type de section (pour garder l'apparence existante) */
  var WRAPPERS = {
    hero: ['section', 'hero'], band: ['div', 'ages'], about: ['section', 'block'], 'text-media': ['section', 'block'],
    cards: ['section', 'block cards-sec'], stages: ['section', 'block projects'], gallery: ['section', 'block'], video: ['section', 'block'],
    slots: ['section', 'block horaires'], agenda: ['section', 'block agenda-wrap'], news: ['section', 'block'],
    quote: ['section', 'block quote-sec'], cta: ['section', 'block cta-sec'], text: ['section', 'block'],
    join: ['section', 'block join'], contact: ['section', 'block']
  };

  function socialLinks(K, d, cls) {
    return '<ul class="social ' + (cls || '') + '"' + (cls === 'top-social' ? K.list('social', 'social') : '') + '>' + (d.social || []).map(function (s, i) {
      var h = safeHref(s.href), name = s.label || NETWORKS[s.network] || 'Lien';
      return '<li' + (cls === 'top-social' ? K.item('social', i) : '') + '><a href="' + esc(h) + '" target="_blank" rel="noopener me" aria-label="' + esc(name) + ' (nouvelle fenêtre)" title="' + esc(name) + '"' +
        (K.E && cls === 'top-social' ? ' data-social="' + i + '"' : '') + '>' + (ICONS[s.network] || ICONS.autre) + '<span class="sr">' + esc(name) + '</span></a></li>';
    }).join('') + '</ul>';
  }

  function header(K, d, home) {
    var pre = home ? '' : 'accueil.html';
    var links = d.sections.filter(function (s) { return !s.hidden && s.menu && s.menu.show; }).map(function (s) {
      return '<li><a href="' + pre + '#' + esc(s.id) + '">' + esc(s.menu.label || s.id) + '</a></li>';
    }).join('');
    var cta = d.nav && d.nav.cta ? d.nav.cta : { label: '', href: '' };
    var ctaObj = home ? cta : { label: cta.label, href: /^#/.test(cta.href || '') ? 'accueil.html' + cta.href : cta.href };
    return '<header class="top"><div class="wrap">' +
      '<a class="brand" href="' + (home ? '#top' : 'accueil.html') + '" aria-label="Mwasa Musiki, accueil"><img src="' + K.base + 'img/logo.svg" alt="Logo Mwasa Musiki" width="104" height="57"></a>' +
      '<button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="menu"><span></span>Menu</button>' +
      '<nav aria-label="Navigation principale"><ul class="menu" id="menu">' + links +
      (cta.label || K.E ? '<li class="menu-cta">' + K.ln('nav.cta', ctaObj, 'btn btn-fill') + '</li>' : '') +
      '<li class="menu-social">' + socialLinks(K, d, 'top-social') + '</li>' +
      '</ul></nav></div></header>';
  }

  function footer(K, d) {
    var fo = d.footer || {};
    return '<footer><div class="wrap"><span class="brand"><img src="' + K.base + 'img/logo.svg" alt="Logo Mwasa Musiki" width="86" height="47"></span>' +
      '<span>© <span id="annee">' + new Date().getFullYear() + '</span> ' + K.t('footer.text', fo.text) + '</span>' +
      socialLinks(K, d, 'foot-social') +
      '<nav class="foot-links" aria-label="Informations légales"><a href="' + K.base + 'mentions-legales.html"' + '>' + esc(fo.legalLabel) + '</a>' +
      '<button type="button" class="linklike" data-consent-open>' + esc(fo.cookiesLabel) + '</button>' +
      '<a href="#top">Haut de page ↑</a><a class="admin-link" href="' + K.base + 'admin/" rel="nofollow">Espace administration</a></nav></div></footer>';
  }

  function consentBanner(K, d) {
    var c = d.consent || DEFAULT_CONSENT;
    return '<div class="consent" id="consent" role="dialog" aria-modal="false" aria-labelledby="consent-title" hidden>' +
      '<p id="consent-title" class="consent-title">Cookies et vidéos</p>' + K.t('consent.text', c.text, 'p', 'consent-text') +
      '<div class="consent-actions"><button type="button" class="btn btn-ghost" data-consent="refuse">' + esc(c.refuse) + '</button>' +
      '<button type="button" class="btn btn-fill" data-consent="accept">' + esc(c.accept) + '</button></div>' +
      '<a class="consent-more" href="' + K.base + 'mentions-legales.html#cookies">En savoir plus</a></div>';
  }

  function notesLayer(d) {
    var th = d.theme || {};
    if (th.notes === false) return '';
    var keys = '';
    for (var i = 0; i < 14; i++) keys += '<i class="' + ([1, 3, 6, 8, 10, 13].indexOf(i) >= 0 ? 'k-b' : 'k-w') + '"></i>';
    return '<div class="notes" id="notes" aria-hidden="true"><div class="keys">' + keys + '</div></div>';
  }

  function sectionHTML(K, s, i) {
    var R = RENDERERS[s.type];
    if (!R) return '';
    if (s.hidden && !K.E) return '';
    var w = WRAPPERS[s.type] || ['section', 'block'];
    var plain = ['about', 'text-media', 'cards', 'gallery', 'video', 'slots', 'news', 'text', 'contact'].indexOf(s.type) >= 0 && (!s.bg || s.bg === 'creme');
    var cls = 'sec sec-' + s.type + ' ' + w[1] + (s.bg ? ' bg-' + s.bg : '') + (plain ? ' plain' : '') + (s.hidden ? ' sec-hidden' : '');
    var attrs = ' id="' + esc(s.id) + '" class="' + cls + '"' + (K.E ? ' data-section="' + i + '"' : '');
    if (w[0] === 'div' && s.type === 'band') attrs += ' role="region" aria-label="' + esc(s.data.label || 'Bandeau') + '"';
    return '<' + w[0] + attrs + '>' + R(K, 'sections.' + i + '.data', s.data || {}) + '</' + w[0] + '>';
  }

  /* Corps de la page d'accueil (aperçu de l'administration ou page publiée) */
  function render(data, opts) {
    opts = opts || {};
    var d = normalize(data);
    var K = makeKit(opts);
    var h = [];
    if (!opts.noTheme) h.push('<style id="mw-theme">' + themeCSS(d.theme, K.base) + '</style>');
    h.push('<span id="top"></span>');
    h.push(header(K, d, true));
    h.push('<main id="contenu">' + d.sections.map(function (s, i) { return sectionHTML(K, s, i); }).join('\n') + '</main>');
    h.push(footer(K, d));
    if (!K.E) { h.push(consentBanner(K, d)); h.push(notesLayer(d)); }
    return h.join('\n');
  }

  /* Corps de la page mentions légales */
  function renderLegal(data, opts) {
    opts = opts || {};
    var d = normalize(data);
    var K = makeKit(opts), L = d.legal;
    var h = [];
    if (!opts.noTheme) h.push('<style id="mw-theme">' + themeCSS(d.theme, K.base) + '</style>');
    h.push('<span id="top"></span>');
    h.push(header(K, d, false));
    h.push('<main id="contenu" class="legal"><div class="wrap narrow">' + K.t('legal.title', L.title, 'h1') +
      '<p class="updated">Mise à jour : ' + esc(longDate(L.updated)) + '</p>' +
      '<div class="legal-sections"' + K.list('legal.sections', 'legal') + '>' + (L.sections || []).map(function (s, i) {
        var p = 'legal.sections.' + i;
        return '<section class="legal-sec" id="' + esc(slugify(s.title)) + '"' + K.item('legal.sections', i) + '>' + K.t(p + '.title', s.title, 'h2') + K.tx(p + '.text', s.text, '', true) + '</section>';
      }).join('') + '</div>' +
      (K.E ? '<div class="consent-edit"><h2>Bandeau des cookies</h2>' + K.t('consent.text', d.consent.text, 'p') +
        '<p>Bouton refuser : ' + K.t('consent.refuse', d.consent.refuse) + '<br>Bouton accepter : ' + K.t('consent.accept', d.consent.accept) + '</p>' +
        '<p>Lien du pied de page : ' + K.t('footer.legalLabel', d.footer.legalLabel) + ' · ' + K.t('footer.cookiesLabel', d.footer.cookiesLabel) + '</p></div>' : '') +
      '</div></main>');
    h.push(footer(K, d));
    if (!K.E) h.push(consentBanner(K, d));
    return h.join('\n');
  }

  function docHead(d, title, description, image) {
    return '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '<meta name="generator" content="mwasa-render ' + VERSION + '">\n' +
      '<title>' + esc(title) + '</title>\n' +
      '<meta name="description" content="' + esc(description) + '">\n' +
      '<meta property="og:title" content="' + esc(title) + '">\n' +
      '<meta property="og:description" content="' + esc(description) + '">\n' +
      '<meta property="og:image" content="' + esc(image || 'img/logo.png') + '">\n<meta property="og:locale" content="fr_FR">\n' +
      '<link rel="icon" type="image/svg+xml" href="img/logo.svg">\n' +
      '<link rel="preload" href="assets/fonts/archivo-variable.woff2" as="font" type="font/woff2" crossorigin>\n' +
      '<link rel="stylesheet" href="assets/site.css?v=' + VERSION + '">\n<style id="mw-theme">' + themeCSS(d.theme, '') + '</style>\n</head>\n<body>\n' +
      '<!-- Page générée automatiquement depuis content/site.json par l\'administration. Modifiez le contenu sur /admin/. -->\n';
  }
  var docEnd = '\n<script src="assets/site.js?v=' + VERSION + '" defer></script>\n</body>\n</html>\n';

  function fullDocument(data) {
    var d = normalize(data), m = d.meta || {};
    var hero = d.sections.filter(function (s) { return s.type === 'hero'; })[0];
    return docHead(d, m.title, m.description, hero && hero.data.image && hero.data.image.src) + render(d, { noTheme: true }) + docEnd;
  }
  function legalDocument(data) {
    var d = normalize(data);
    return docHead(d, d.legal.title + ' · ' + (d.meta.title || 'Mwasa Musiki'), 'Mentions légales, données personnelles et cookies du site ' + (d.meta.title || ''), '').replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"') +
      renderLegal(d, { noTheme: true }) + docEnd;
  }

  return {
    VERSION: VERSION, render: render, renderLegal: renderLegal, fullDocument: fullDocument, legalDocument: legalDocument,
    normalize: normalize, newSection: newSection, themeCSS: themeCSS, youtubeId: youtubeId, slugify: slugify,
    FONTS: FONTS, THEME_DEFAULT: THEME_DEFAULT, SECTION_TYPES: SECTION_TYPES, BACKGROUNDS: BACKGROUNDS, NETWORKS: NETWORKS,
    esc: esc, longDate: longDate, parseDate: parseDate
  };
});
