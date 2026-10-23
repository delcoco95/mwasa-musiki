// Génère index.html à partir de content/site.json (même code que le bouton « Publier » de l'administration).
const fs = require('fs');
const { fullDocument } = require('./www/assets/render.js');
const data = JSON.parse(fs.readFileSync(__dirname + '/www/content/site.json', 'utf8'));
fs.writeFileSync(__dirname + '/www/index.html', fullDocument(data));
console.log('index.html généré');

// Listes de commandes sftp utilisées par envoyer-sur-ovh.bat (droits : dossiers 755, fichiers 644, .env 600).
const path = require('path');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.posix.join(dir, e.name);
    return e.isDirectory() ? [{ dir: p }, ...walk(p)] : [{ file: p }];
  });
}
const all = walk('www').concat([{ dir: 'www' }]).sort((a, b) => (a.dir || a.file).localeCompare(b.dir || b.file));
const dirs = all.filter(x => x.dir).map(x => x.dir).sort((a, b) => a.split('/').length - b.split('/').length);
const files = all.filter(x => x.file).map(x => x.file);
// Contenus gérés par l'administration : envoyés seulement à la première installation
const managed = f => f === 'www/index.html' || f === 'www/content/site.json' || (f.startsWith('www/img/uploads/') && !f.endsWith('.htaccess'));
function script(list, withEnv) {
  const L = [];
  dirs.forEach(d => L.push('-mkdir ' + d));
  list.forEach(f => L.push('put ' + f + ' ' + f));
  dirs.forEach(d => L.push('chmod 755 ' + d));
  list.forEach(f => L.push('chmod 644 ' + f));
  if (withEnv) L.push('put .env .env', 'chmod 600 .env');
  L.push('bye');
  return L.join('\n') + '\n';
}
fs.mkdirSync(__dirname + '/deploy', { recursive: true });
fs.writeFileSync(__dirname + '/deploy/installation.txt', script(files, true));
fs.writeFileSync(__dirname + '/deploy/mise-a-jour.txt', script(files.filter(f => !managed(f)), false));
console.log('deploy/ : ' + files.length + ' fichiers (installation), ' + files.filter(f => !managed(f)).length + ' (mise à jour)');
