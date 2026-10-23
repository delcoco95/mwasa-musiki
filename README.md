# Mwasa Musiki

Site vitrine de l'association **Mwasa Musiki** (Nice) : chant collectif gospel, chant individuel, souffle et voix, ateliers piano et guitare.

Adresse : **https://mwasamusiki.com**, hébergé chez OVH. Le site se modifie depuis une page d'administration, sans écrire de code.

## Modifier le site (responsables de l'association)

1. Cliquez sur **« Espace administration »** tout en bas de la page (ou allez sur `https://mwasamusiki.com/admin/`).
2. Connectez-vous avec l'**identifiant et le mot de passe** de l'association.
3. Cliquez directement sur la page :
   - un **texte** pour le réécrire ;
   - une **photo** pour la remplacer (elle est réduite automatiquement) puis sur la partie à garder visible pour la **cadrer** ;
   - un **bouton ou un lien** pour changer son texte et son adresse ;
   - la **date** d'un événement ou d'une actualité pour la changer ;
   - survolez une **carte** pour la monter, la descendre, la dupliquer ou la supprimer ;
   - les boutons **« + Ajouter »** créent un atelier, un créneau horaire, un projet, un événement, une actualité…
   - **Sections** : survolez une section pour la monter, la descendre ou la glisser (poignée ⠿), la masquer, la dupliquer ou la supprimer ; **Réglages** choisit son nom dans le menu, son adresse (#…), sa couleur de fond (au choix), la couleur de ses textes et ses marges ; **« + Ajouter une section ici »** propose 17 modèles ;
   - **Mise en page libre** : une section faite de lignes (1 à 3 colonnes) et de blocs (titre, sur-titre, texte, photo/vidéo, bouton, citation, espace, trait). Chaque bloc se glisse avec sa poignée ⠿ dans une autre colonne ou une autre section libre (ou bouton ⇄ sur téléphone) ; ⚙ règle son alignement, sa taille ou son format. **« Rendre libre »** transforme une section simple (accueil, présentation, texte, texte et photo, vidéo, citation, appel à l'action, adhésion) en blocs déplaçables ;
   - **Déplacer** : les cartes, créneaux, événements, actualités et autres éléments de liste se glissent aussi avec leur poignée ⠿ ;
   - **Mise en forme** : survolez un texte ou un bouton → **« Aa Style »** : police, taille, épaisseur, couleur, italique, souligné, majuscules, alignement, interligne, espacement des lettres ; pour un bouton, couleur de fond et arrondi ;
   - **Vidéos** : cliquez sur une photo → onglet « Vidéo (fichier) » (MP4/WebM, 40 Mo max., lecture automatique possible) ou « Vidéo YouTube » ;
   - **Réseaux sociaux** : cliquez sur une icône à droite d'« Adhérer » pour changer son adresse, « + » pour en ajouter ;
   - **Mentions légales** : liste « Page » en haut → « Mentions légales » (textes, rubriques, bandeau des cookies) ;
   - **Apparence** : couleurs, polices, taille du texte de tout le site, couleur et forme des boutons, animation des notes de musique.
4. Cliquez sur **Publier** : le site est mis à jour immédiatement.

Rien n'est en ligne tant que vous n'avez pas publié. Vos modifications sont gardées sur votre appareil si vous fermez la page. Dans l'agenda, les événements passés sont masqués automatiquement.

Après 5 mots de passe faux, la connexion est bloquée 15 minutes pour l'appareil concerné.

## Sécurité

- **Identifiant et mot de passe** dans le fichier `.env` (modèle : `.env.example`), placé sur OVH **à la racine de l'hébergement, à côté du dossier `www`** : inaccessible depuis Internet, jamais envoyé sur GitHub.
- **Mot de passe jamais stocké en clair** : à la première connexion, l'administration impose un nouveau mot de passe (12 caractères minimum, sans mot évident). Le serveur n'en garde qu'une empreinte Argon2id.
- **Double authentification** (bouton **Sécurité**) : un code à 6 chiffres d'une application (Google Authenticator, Microsoft Authenticator, Aegis…) est demandé à chaque connexion. Plusieurs responsables peuvent scanner le même QR code. Téléphone perdu : retirez la ligne `ADMIN_TOTP_SECRET` du `.env` sur l'hébergement.
- **Blocage des essais** : 5 erreurs par appareil en 15 minutes, 40 erreurs pour tout le site en 1 heure.
- **Sessions** : cookie sécurisé (HTTPS uniquement, inaccessible aux scripts, même site), fin de session après 2 h d'inactivité (7 jours avec « Rester connecté »), session coupée si le cookie est utilisé depuis un autre navigateur. Changer le mot de passe ou la double authentification déconnecte tous les autres appareils.
- **Journal** des connexions et publications : bouton **Sécurité**.
- **Serveur** : HTTPS obligatoire (HSTS), en-têtes de sécurité stricts (CSP, anti-iframe…), aucun programme exécutable dans les dossiers de photos et de contenu, dossiers non listables, sauvegarde avant chaque publication (30 dernières dans `mwasa-data/backups/`).
- **Compte OVH** : activez la double authentification du compte OVH (espace client → votre compte → Sécurité).

## RGPD et cookies

- Aucun cookie publicitaire ni de mesure d'audience ; polices, photos et vidéos envoyées sont hébergées sur le site (aucun appel à Google).
- Les vidéos YouTube ne sont chargées qu'après l'accord du visiteur (bandeau « Autoriser / Refuser », aussi simple de refuser que d'accepter ; choix conservé 6 mois, modifiable via « Gestion des cookies » en pied de page). Elles passent par youtube-nocookie.com.
- Le bandeau n'apparaît que si la page contient une vidéo YouTube.
- Le journal de sécurité de l'administration (date, IP, navigateur) est conservé 6 mois au maximum.
- **À compléter dans l'administration** (page Mentions légales) : adresse du siège, numéro RNA, nom du directeur ou de la directrice de la publication.

## Mettre le site en ligne sur OVH

Aucun logiciel à installer : le fichier **`envoyer-sur-ovh.bat`** utilise l'outil d'envoi sécurisé intégré à Windows 10 et 11 (`sftp`, connexion chiffrée).

1. Mot de passe FTP : espace client OVH → **Web Cloud → Hébergements → mwasamusiki.com → FTP-SSH** → « Modifier le mot de passe » sur la ligne `mwasamv`.
2. Double-cliquez sur `envoyer-sur-ovh.bat` et choisissez :
   - **1** pour la première installation (tout le site + le fichier `.env`) ;
   - **2** pour une mise à jour du programme seulement, sans toucher aux contenus modifiés depuis l'administration.
3. Tapez `yes` à la première connexion pour accepter le serveur OVH, puis le mot de passe FTP (il ne s'affiche pas, c'est normal).
4. Ouvrez https://mwasamusiki.com/admin/, connectez-vous, choisissez votre mot de passe définitif puis activez la double authentification.

Le site va dans le dossier `www` de l'hébergement et le fichier `.env` à sa racine, à côté de `www` (inaccessible depuis Internet).

**Attention lors d'une mise à jour du code** : n'écrasez pas `www/content/site.json`, `www/accueil.html` ni `www/img/uploads/` sur l'hébergement, car ils contiennent les modifications faites depuis l'administration.

Avant chaque publication, le serveur garde une sauvegarde de la version précédente dans `mwasa-data/backups/` (à la racine de l'hébergement, les 30 dernières).

## Organisation des fichiers

- `www/` : tout ce qui est en ligne
  - `content/site.json` : tout le contenu (textes, photos, horaires, agenda, actualités, apparence)
  - `accueil.html` : la page d'accueil publiée, **générée automatiquement** à chaque publication (OVH réserve `index.html` à sa page « Site en construction »)
  - `admin/` : l'administration (`api.php` vérifie la connexion et enregistre les modifications)
  - `assets/` : fabrication de la page (`render.js`), styles, polices hébergées sur le site
  - `img/photos/` : photos de l'association ; `img/uploads/` : photos ajoutées depuis l'administration
- `build.js` : régénère `www/accueil.html` en local (`node build.js`) après une modification manuelle de `site.json`
- `index.html` (à la racine) : redirige l'ancienne adresse GitHub Pages vers mwasamusiki.com

## Crédits

Photos : association Mwasa Musiki. Polices : SIL Open Font License 1.1.
