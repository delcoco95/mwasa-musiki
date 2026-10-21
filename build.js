// Génère index.html à partir de content/site.json (même code que le bouton « Publier » de l'administration).
const fs = require('fs');
const { fullDocument } = require('./assets/render.js');
const data = JSON.parse(fs.readFileSync(__dirname + '/content/site.json', 'utf8'));
fs.writeFileSync(__dirname + '/index.html', fullDocument(data));
console.log('index.html généré');
