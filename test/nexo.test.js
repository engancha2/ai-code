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
const PROGRAMS = ['girasol', 'hilos', 'nebulosa', 'particulas', 'aurora', 'pi', 'estadistica', 'trayectoria', 'aprende'];
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

// --- aprendizaje (v0.3) ---
test('los gradientes coinciden con diferencias finitas', () => {
  const g = graph([]);
  const p = [0.7, -1.3, 0.4, 2.1, 0.9].map((v) => g.param(v));
  const i = g.range(7), x = g.sub(g.div(i, 3), 1);
  const a = g.add(g.mul(p[0], g.sin(g.mul(p[1], x))), g.mul(p[2], g.cos(x)));
  const b = g.div(g.exp(g.mul(p[3], 0.3)), g.add(g.abs(p[4]), 1));
  const c = g.mix(a, g.sqrt(g.add(g.mul(x, x), p[2])), g.atan2(p[0], p[4]));
  const d = g.select(g.gt(x, 0), g.mul(c, b), g.pow(g.add(c, 3), p[4]));
  const e = g.add(g.scan(d), g.gather(g.mul(a, p[3]), g.add(i, 2)));
  const f = g.add(g.max(e, g.mul(p[1], 0.5)), g.min(a, b));
  g.loss(g.add(g.sum(g.mul(f, f)), g.add(g.vmax(e), g.sum(g.pack(g.vmin(a), p[3], g.mod(p[0], 0.5))))));
  const cp = Nexo.compile(g.build());
  cp.frame(0);
  const { grads } = cp.backward();
  const P = cp.getParams(), h = 1e-6;
  P.forEach((v, k) => {
    const at = (dv) => { const q = P.slice(); q[k] += dv; cp.setParams(q); cp.frame(0); return cp.lossValue(); };
    const num = (at(h) - at(-h)) / (2 * h);
    assert.ok(Math.abs(num - grads[k]) / Math.max(1, Math.abs(num)) < 1e-5, `param ${k}: ${grads[k]} vs ${num}`);
  });
});

test('learn encuentra la recta y = 3x − 1', () => {
  const g = graph(['input']);
  const x = g.input(0), y = g.input(1), a = g.param(0), b = g.param(0);
  const pred = g.add(g.mul(a, x), b), e = g.sub(pred, y);
  g.loss(g.sum(g.mul(e, e)));
  g.output(pred);
  const xs = [0, 1, 2, 3, 4], ys = xs.map((v) => 3 * v - 1);
  const res = Nexo.learn(g.build(), { inputs: [xs, ys], steps: 2000, lr: 0.1 });
  const params = res.program.nodes.filter((n) => n[0] === 'param').map((n) => n[2]);
  assert.ok(Math.abs(params[0] - 3) < 1e-3 && Math.abs(params[1] + 1) < 1e-3, params);
});

test('el programa aprende a dibujar un corazón', () => {
  const d = load('corazon');
  const L = Nexo.createLearner(load('aprende'), { inputs: [d.x, d.y], lr: 0.02 });
  const start = L.loss();
  L.step(200);
  assert.ok(L.loss() < start / 1000 && L.loss() < 1e-6, `${start} → ${L.loss()}`);
});

test('rechaza param dentro de funciones y loss por píxel', () => {
  bad({ caps: [], funcs: [{ nodes: [['arg', [], 0], ['param', [], 1], ['add', [0, 1]]] }], nodes: [['const', [], 1], ['call', [0], 0]] }, 'param no está permitido');
  const g = graph(['draw']);
  g.loss(g.px());
  g.circle(0, 0, 0.1, 0, 1);
  bad(g.build(), 'loss no acepta');
});

// --- render sin navegador ---
test('el campo en CPU coincide con la fórmula', () => {
  const g = graph(['draw']);
  g.shade(g.mul(g.px(), 0.25), g.add(g.py(), 0.5), 1);
  const out = Nexo.compile(g.build()).frame(0);
  const [H, L] = out[0].eval(Float64Array.of(0.4, -0.8), Float64Array.of(0.1, 0.2));
  assert.deepStrictEqual(Array.from(H), [0.1, -0.2]);
  assert.ok(Math.abs(L[0] - 0.6) < 1e-12 && Math.abs(L[1] - 0.7) < 1e-12);
});

test('render PNG sin navegador', () => {
  const png = require('../src/raster').renderPNG(load('aurora'), { size: 64, t: 1 });
  assert.deepStrictEqual(Array.from(png.slice(1, 4)), [0x50, 0x4e, 0x47]);
  assert.strictEqual(png.readUInt32BE(16), 64);
});

// --- síntesis ---
test('descubre 1,5·x² − x + 0,5 a partir de datos', () => {
  const Synth = require('../src/synth');
  const xs = Array.from({ length: 40 }, (_, k) => -2 + (4 * k) / 39);
  const res = Synth.synthesize({ x: xs, y: xs.map((x) => 1.5 * x * x - x + 0.5) }, { seed: 1 });
  assert.ok(res.mse < 1e-6, res.mse);
  assert.strictEqual(res.formula, '1,5·x² − x + 0,5');
  assert.ok(Nexo.verify(res.program).ok);
});

// --- servidor MCP ---
test('el servidor MCP responde a initialize, tools/list y tools/call', () => {
  const { spawnSync } = require('child_process');
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nexo_run', arguments: { program: load('girasol'), size: 64 } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nexo_run', arguments: { program: load('pi') } } },
  ];
  const r = spawnSync('node', [path.join(__dirname, '..', 'bin', 'nexo-mcp.js')], { input: msgs.map((m) => JSON.stringify(m)).join('\n') + '\n' });
  const out = r.stdout.toString().trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(out.length, 4);
  assert.strictEqual(out[0].result.serverInfo.name, 'nexo');
  assert.ok(out[1].result.tools.length >= 6);
  assert.strictEqual(out[2].result.content[1].type, 'image');
  assert.ok(Math.abs(JSON.parse(out[3].result.content[0].text).result - Math.PI) < 0.05);
});

console.log(`\n${pass} pruebas superadas`);
