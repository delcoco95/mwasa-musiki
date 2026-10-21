# Mwasa Musiki

Site vitrine de l'association **Mwasa Musiki** (Nice) : ateliers de chant gospel collectif et individuel, souffle et voix, initiation aux instruments de musique.

Le site est hébergé gratuitement par GitHub Pages et se modifie depuis une page d'administration, sans écrire de code.

## Modifier le site (responsables de l'association)

1. Ouvrez l'adresse du site suivie de **`/admin/`** (par exemple `https://votre-domaine.fr/admin/`).
2. Connectez-vous avec votre **clé d'accès GitHub** (voir plus bas).
3. Cliquez directement sur la page :
   - un **texte** pour le réécrire ;
   - une **photo** pour la remplacer (elle est réduite automatiquement) ;
   - un **bouton ou un lien** pour changer son texte et son adresse ;
   - la **date** d'un événement ou d'une actualité pour la changer ;
   - survolez une **carte** pour la monter, la descendre, la dupliquer ou la supprimer ;
   - les boutons **« + Ajouter »** créent un atelier, un projet, un événement, une actualité…
4. Cliquez sur **Publier**. Le site est à jour 1 à 2 minutes plus tard.

Tant que vous n'avez pas publié, rien n'est en ligne. Vos modifications sont gardées sur votre appareil si vous fermez la page. Dans l'agenda, les événements passés sont masqués automatiquement sur le site.

### Obtenir une clé d'accès

Chaque responsable a besoin d'un compte GitHub ajouté comme collaborateur du dépôt (Settings → Collaborators), puis :

1. Ouvrez https://github.com/settings/personal-access-tokens/new
2. Nom : « Site Mwasa Musiki », durée : 1 an.
3. Repository access : **Only select repositories** → `mwasa-musiki`.
4. Permissions → Repository permissions → **Contents : Read and write**. Rien d'autre.
5. Générez la clé, copiez-la et collez-la dans la page d'administration.

La clé ne permet de modifier que ce site. Ne la partagez pas. Si elle est perdue ou divulguée, supprimez-la sur la même page GitHub et créez-en une nouvelle.

## Organisation des fichiers

- `content/site.json` : tout le contenu du site (textes, photos, listes, agenda, actualités)
- `index.html` : la page publiée, **générée automatiquement** à chaque publication (ne pas la modifier à la main)
- `assets/render.js` : fabrique la page à partir du contenu (utilisé par l'administration)
- `assets/site.css`, `assets/site.js`, `assets/fonts/` : apparence, menu mobile, polices hébergées sur le site
- `admin/` et `assets/admin/` : l'interface d'administration
- `img/` : photos ; `img/uploads/` reçoit les photos ajoutées depuis l'administration
- `build.js` : régénère `index.html` en local (`node build.js`) après une modification manuelle de `site.json`

## Crédits

Photos : [Pixabay](https://pixabay.com/) (licence Pixabay, usage libre). Polices Archivo et Nunito Sans : SIL Open Font License 1.1.
Logo et charte : Association Mwasa Musiki.
