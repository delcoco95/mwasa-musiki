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

## Identifiant et mot de passe : le fichier `.env`

L'identifiant et le mot de passe sont dans un fichier `.env` (modèle : `.env.example`) :

```
ADMIN_USER=identifiant
ADMIN_PASSWORD=mot-de-passe
```

- Il n'est **jamais** envoyé sur GitHub (exclu par `.gitignore`).
- Sur OVH, il se place à la **racine de l'hébergement, à côté du dossier `www`** (pas dedans) : il est alors inaccessible depuis Internet.
- Pour changer le mot de passe, modifiez ce fichier et renvoyez-le sur l'hébergement.

## Mettre le site en ligne sur OVH (FileZilla)

1. Dans l'espace client OVH : **Web Cloud → Hébergements → votre hébergement → FTP-SSH**. Notez le serveur FTP et l'identifiant ; définissez le mot de passe FTP si besoin.
2. Dans FileZilla, connectez-vous à ce serveur.
3. Envoyez **le contenu** du dossier `www` de ce projet dans le dossier `www` de l'hébergement.
4. Envoyez le fichier `.env` à la racine de l'hébergement (au même niveau que le dossier `www`).
5. Ouvrez https://mwasamusiki.com/admin/ et connectez-vous.

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
