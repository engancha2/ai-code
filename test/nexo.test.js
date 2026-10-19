// Pruebas mínimas. Uso: node test/nexo.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Nexo = require('../src/nexo');

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('ok -', name); };

const exDir = path.join(__dirname, '..', 'examples');
const examples = fs.readdirSync(exDir).filter((f) => f.endsWith('.json'));

test('los ejemplos verifican', () => {
  for (const f of examples) assert.ok(Nexo.verify(JSON.parse(fs.readFileSync(path.join(exDir, f)))).ok, f);
});

test('binario ida y vuelta conserva la estructura', () => {
  for (const f of examples) {
    const p = JSON.parse(fs.readFileSync(path.join(exDir, f)));
    const back = Nexo.decode(Nexo.encode(p));
    assert.strictEqual(back.nodes.length, p.nodes.length);
    back.nodes.forEach((n, i) => {
      assert.strictEqual(n[0], p.nodes[i][0]);
      assert.deepStrictEqual(n[1], p.nodes[i][1]);
      if (n.length > 2) assert.ok(Math.abs(n[2] - p.nodes[i][2]) < 1e-4 * Math.max(1, Math.abs(n[2])));
    });
  }
});

test('rechaza referencias hacia delante (ciclos imposibles)', () => {
  const v = Nexo.verify({ caps: ['draw'], nodes: [['sin', [1]], ['const', [], 1]] });
  assert.ok(!v.ok);
});

test('rechaza dibujar sin la capacidad declarada', () => {
  const v = Nexo.verify({ caps: [], nodes: [['const', [], 0], ['circle', [0, 0, 0, 0, 0]]] });
  assert.ok(!v.ok && v.errors.some((e) => e.includes('capacidad')));
});

test('rechaza mezclar tipos', () => {
  const v = Nexo.verify({ caps: ['draw'], nodes: [['const', [], 0], ['circle', [0, 0, 0, 0, 0]], ['sin', [1]], ['circle', [0, 0, 0, 0, 0]]] });
  assert.ok(!v.ok);
});

test('ejecuta un frame y produce dibujo', () => {
  const p = JSON.parse(fs.readFileSync(path.join(exDir, 'girasol.json')));
  const c = Nexo.compile(p);
  const out = c.frame(1.5);
  assert.ok(Array.isArray(out) && out[0].kind === 'c');
  assert.ok(c.plan.staticCount > 0);
});

console.log(`\n${pass} pruebas superadas`);
