// Empaqueta la demo en un único HTML. Uso: node demo/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ex = {};
for (const name of ['girasol', 'hilos', 'nebulosa']) {
  ex[name] = JSON.parse(fs.readFileSync(path.join(root, 'examples', `${name}.json`)));
}
const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
  .replace('/*__NEXO__*/', () => fs.readFileSync(path.join(root, 'src', 'nexo.js'), 'utf8'))
  .replace('/*__EXAMPLES__*/', () => JSON.stringify(ex));
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('demo/index.html', html.length, 'bytes');
