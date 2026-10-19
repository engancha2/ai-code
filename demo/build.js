// Empaqueta la demo en un único HTML. Uso: node demo/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const json = (name) => JSON.parse(read('examples', `${name}.json`));

const bundle = {
  visual: Object.fromEntries(['girasol', 'hilos', 'nebulosa', 'particulas', 'aurora'].map((n) => [n, json(n)])),
  calc: Object.fromEntries(['pi', 'estadistica', 'trayectoria'].map((n) => [n, json(n)])),
  datos: json('datos'),
  learn: {
    program: json('aprende'),
    shapes: Object.fromEntries(['corazon', 'estrella', 'infinito'].map((n) => { const d = json(n); return [n, { x: d.x, y: d.y }]; })),
  },
};
const code = ['nexo.js', 'builder.js', 'evolve.js', 'synth.js'].map((f) => read('src', f)).join('\n');
const html = read('demo', 'template.html')
  .replace('/*__NEXO__*/', () => code)
  .replace('/*__EXAMPLES__*/', () => JSON.stringify(bundle));
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('demo/index.html', html.length, 'bytes');
