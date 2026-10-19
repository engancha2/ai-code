// Pruebas. Uso: node test/nexo.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Nexo = require('../src/nexo');
const { graph } = require('../src/builder');
const Evolve = require('../src/evolve');

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('ok -', name); };
const exDir = path.join(__dirname, '..', 'examples');
const load = (name) => JSON.parse(fs.readFileSync(path.join(exDir, `${name}.json`)));
const PROGRAMS = ['girasol', 'hilos', 'nebulosa', 'particulas', 'aurora', 'pi', 'estadistica', 'trayectoria'];
const bad = (prog, text) => {
  const v = Nexo.verify(prog);
  assert.ok(!v.ok, 'debería rechazarse');
  if (text) assert.ok(v.errors.some((e) => e.includes(text)), `esperaba "${text}" en: ${v.errors.join(' | ')}`);
};

// --- núcleo ---
test('los ejemplos verifican', () => { for (const p of PROGRAMS) assert.ok(Nexo.verify(load(p)).ok, p); });

test('binario ida y vuelta conserva la estructura', () => {
  for (const name of PROGRAMS) {
    const p = load(name);
    const back = Nexo.decode(Nexo.encode(p));
    const bodies = [[p.nodes, back.nodes], ...(p.funcs || []).map((f, i) => [f.nodes, back.funcs[i].nodes])];
    for (const [a, b] of bodies) {
      assert.strictEqual(b.length, a.length);
      b.forEach((n, i) => {
        assert.strictEqual(n[0], a[i][0]);
        assert.deepStrictEqual(n[1], a[i][1]);
        if (n.length > 2) assert.ok(Math.abs(n[2] - a[i][2]) < 1e-4 * Math.max(1, Math.abs(n[2])), name);
      });
    }
  }
});

test('lee binarios de la versión 1', () => {
  const v2 = Nexo.encode(load('girasol'));
  const v1 = Uint8Array.from([0x4e, 0x58, 1, v2[3], ...v2.slice(5)]);
  assert.strictEqual(Nexo.decode(v1).nodes.length, load('girasol').nodes.length);
});

test('rechaza binarios truncados', () => {
  const b = Nexo.encode(load('girasol'));
  assert.throws(() => Nexo.decode(b.slice(0, b.length - 3)), /truncado/);
});

test('rechaza referencias hacia delante (ciclos imposibles)', () => bad({ caps: ['draw'], nodes: [['sin', [1]], ['const', [], 1]] }, 'hacia atrás'));
test('rechaza dibujar sin la capacidad declarada', () => bad({ caps: [], nodes: [['const', [], 0], ['circle', [0, 0, 0, 0, 0]]] }, 'capacidad'));
test('rechaza leer datos sin la capacidad input', () => bad({ caps: [], nodes: [['input', [], 0], ['sum', [0]]] }, 'capacidad'));
test('rechaza mezclar tipos', () => bad({ caps: ['draw'], nodes: [['const', [], 0], ['circle', [0, 0, 0, 0, 0]], ['sin', [1]]] }, 'se esperaba num'));

// --- funciones ---
test('las funciones se expanden en línea', () => {
  const g = graph([]);
  const sq = g.func(1, (f, a) => f.mul(a, a));
  const twice = g.func(1, (f, a) => f.call(sq, f.call(sq, a)));
  g.call(twice, 3);
  const c = Nexo.compile(g.build());
  assert.strictEqual(c.frame(0), 81);
});

test('rechaza la recursión', () => bad({
  caps: [], funcs: [{ nodes: [['arg', [], 0], ['call', [0], 0]] }], nodes: [['const', [], 1], ['call', [0], 0]],
}, 'sin recursión'));

test('rechaza llamadas con argumentos de más', () => bad({
  caps: [], funcs: [{ nodes: [['arg', [], 0], ['sin', [0]]] }], nodes: [['const', [], 1], ['call', [0, 0], 0]],
}, 'espera 1'));

test('limita la expansión exponencial', () => {
  const funcs = [{ nodes: [['arg', [], 0], ['sin', [0]]] }];
  for (let k = 1; k < 20; k++) funcs.push({ nodes: [['arg', [], 0], ['call', [0], k - 1], ['call', [1], k - 1], ['add', [1, 2]]] });
  bad({ caps: [], funcs, nodes: [['const', [], 1], ['call', [0], 19]] }, 'demasiado grande');
});

// --- estado ---
test('prev acumula entre fotogramas', () => {
  const g = graph([]);
  const s = g.state();
  s.set(g.add(s, 1));
  const c = Nexo.compile(g.build());
  assert.strictEqual(c.run(10), 10);
});

test('prev funciona con vectores', () => {
  const g = graph([]);
  const s = g.state();
  s.set(g.add(s, g.range(3)));
  const out = Nexo.compile(g.build()).run(4);
  assert.deepStrictEqual(Array.from(out), [0, 4, 8]);
});

// --- vectores ---
test('reducciones, scan, gather y pack', () => {
  const g = graph([]);
  const v = g.add(g.range(5), 1); // 1..5
  g.pack(g.sum(v), g.vmin(v), g.vmax(v), g.count(v), g.sum(g.scan(v)), g.sum(g.gather(v, g.range(7))));
  assert.deepStrictEqual(Array.from(Nexo.compile(g.build()).frame(0)), [15, 1, 5, 5, 35, 18]);
});

test('select y comparaciones', () => {
  const g = graph([]);
  const v = g.range(4);
  g.select(g.gt(v, 1.5), 10, v);
  assert.deepStrictEqual(Array.from(Nexo.compile(g.build()).frame(0)), [0, 1, 10, 10]);
});

// --- formas y GPU ---
test('rechaza mezclar vectores con píxeles', () => {
  const g = graph(['draw']);
  g.shade(g.add(g.px(), g.range(3)), 0.5, 1);
  bad(g.build(), 'mezclar');
});

test('rechaza píxeles fuera de shade', () => {
  const g = graph(['draw']);
  g.circle(g.px(), 0, 0.1, 0, 1);
  bad(g.build(), 'usa shade');
});

test('shade genera GLSL con uniforms para lo que depende del tiempo', () => {
  const c = Nexo.compile(load('aurora'));
  const [s] = Object.values(c.shaders);
  assert.ok(s.src.includes('gl_FragColor') && s.src.includes('PX') && s.uniforms.length > 0);
  const draw = c.frame(1.5);
  assert.strictEqual(draw[0].kind, 'f');
  assert.strictEqual(draw[0].u.length, s.uniforms.length);
});

// --- cálculo ---
test('π por Montecarlo se acerca a π', () => {
  const pi = Nexo.compile(load('pi')).frame(0);
  assert.ok(Math.abs(pi - Math.PI) < 0.05, pi);
});

test('estadística coincide con el cálculo en JavaScript', () => {
  const d = load('datos').valores;
  const out = Nexo.compile(load('estadistica'), { inputs: [d] }).frame(0);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / d.length);
  [mean, sd, Math.min(...d), Math.max(...d)].forEach((x, k) => assert.ok(Math.abs(out[k] - x) < 1e-9));
});

test('la trayectoria con rozamiento es más corta que sin él', () => {
  const [range, flight, top] = Nexo.compile(load('trayectoria')).run(1200, 0.005);
  assert.ok(range > 15 && range < 40.8, range);   // sin aire: 40,8 m
  assert.ok(flight > 1.5 && flight < 2.9, flight); // sin aire: 2,88 s
  assert.ok(top > 5 && top < 10.2, top);           // sin aire: 10,2 m
});

test('las partículas siguen en pantalla tras un minuto', () => {
  const c = Nexo.compile(load('particulas'));
  let out;
  for (let k = 0; k < 3600; k++) out = c.frame(k / 60, 1 / 60);
  const x = out[0].a[0];
  const inside = Array.from(x).filter((v) => Math.abs(v) < 1.2).length;
  assert.ok(inside > x.length * 0.9, inside);
});

// --- evolución ---
test('la evolución mejora la nota y produce programas válidos', () => {
  const ev = Evolve.create({ seed: 7 });
  const start = ev.best().s;
  for (let k = 0; k < 20; k++) ev.step();
  assert.ok(ev.best().s > start);
  for (const ind of ev.population.slice(0, 5)) assert.ok(Nexo.verify(Evolve.toProgram(ind.g)).ok);
});

console.log(`\n${pass} pruebas superadas`);
