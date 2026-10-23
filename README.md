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
   - **Apparence** : couleurs et polices de tout le site.
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

## Mettre le site en ligne sur OVH (FileZilla)

1. Espace client OVH → **Web Cloud → Hébergements → mwasamusiki.com → FTP-SSH** : identifiant `mwasamv`. Si vous ne connaissez pas le mot de passe, utilisez « Modifier le mot de passe » sur la ligne `mwasamv`.
2. FileZilla → Fichier → Gestionnaire de sites → Nouveau site : protocole **SFTP**, hôte `ssh.cluster129.hosting.ovh.net`, port `22`, identifiant `mwasamv`.
3. Envoyez **le contenu** du dossier `www` de ce projet dans le dossier `www` de l'hébergement.
4. Envoyez le fichier `.env` à la racine de l'hébergement (au même niveau que le dossier `www`).
5. Ouvrez https://mwasamusiki.com/admin/, connectez-vous, choisissez votre mot de passe définitif puis activez la double authentification.

**Attention lors d'une mise à jour du code** : n'écrasez pas `www/content/site.json`, `www/index.html` ni `www/img/uploads/` sur l'hébergement, car ils contiennent les modifications faites depuis l'administration.

Avant chaque publication, le serveur garde une sauvegarde de la version précédente dans `mwasa-data/backups/` (à la racine de l'hébergement, les 30 dernières).

## Organisation des fichiers

- `www/` : tout ce qui est en ligne
  - `content/site.json` : tout le contenu (textes, photos, horaires, agenda, actualités, apparence)
  - `index.html` : la page publiée, **générée automatiquement** à chaque publication
  - `admin/` : l'administration (`api.php` vérifie la connexion et enregistre les modifications)
  - `assets/` : fabrication de la page (`render.js`), styles, polices hébergées sur le site
  - `img/photos/` : photos de l'association ; `img/uploads/` : photos ajoutées depuis l'administration
- `build.js` : régénère `www/index.html` en local (`node build.js`) après une modification manuelle de `site.json`
- `index.html` (à la racine) : redirige l'ancienne adresse GitHub Pages vers mwasamusiki.com

## Crédits

Photos : association Mwasa Musiki. Polices : SIL Open Font License 1.1.
