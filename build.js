// Génère index.html à partir de content/site.json (même code que le bouton « Publier » de l'administration).
const fs = require('fs');
const { fullDocument } = require('./www/assets/render.js');
const data = JSON.parse(fs.readFileSync(__dirname + '/www/content/site.json', 'utf8'));
fs.writeFileSync(__dirname + '/www/index.html', fullDocument(data));
console.log('index.html généré');
