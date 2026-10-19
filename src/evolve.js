/*
 * La IA que escribe NEXO.
 *
 * Un algoritmo evolutivo genera programas visuales sin intervención humana:
 *   1. Crea programas al azar (árboles de expresiones compilados a grafos).
 *   2. Los ejecuta y les pone nota con criterios estéticos medibles:
 *      cobertura del lienzo, estructura (curvas frente a ruido), movimiento
 *      y variedad de color.
 *   3. Se queda con los mejores, los cruza y los muta. Repite.
 *
 * Todo programa que produce pasa por el verificador de NEXO: puede ser feo,
 * pero nunca peligroso ni infinito.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./nexo'), require('./builder'));
  else root.NexoEvolve = factory(root.Nexo, root.NexoBuilder);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Nexo, Builder) {
  'use strict';
  const UN = ['sin', 'cos', 'abs', 'fract'];
  const BI = ['add', 'sub', 'mul', 'min', 'max'];
  const SIZES = [300, 500, 800];
  const CHANNELS = { circle: 5, line: 6 };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // Hojas: u = posición en el vector (0..1), t = tiempo, h = aleatorio fijo por elemento, c = constante.
  function randTree(r, depth) {
    if (depth <= 0 || r() < 0.25) {
      const k = pick(r, ['u', 'u', 'u', 't', 'h', 'c', 'c']);
      return k === 'c' ? { c: Math.round((r() * 2 - 1) * 600) / 100 } : { v: k };
    }
    if (r() < 0.45) return { op: pick(r, UN), k: [randTree(r, depth - 1)] };
    return { op: pick(r, BI), k: [randTree(r, depth - 1), randTree(r, depth - 1)] };
  }

  function randomGenome(r) {
    const kind = r() < 0.6 ? 'circle' : 'line';
    return { kind, n: pick(r, SIZES), ch: Array.from({ length: CHANNELS[kind] }, () => randTree(r, 4)) };
  }

  // Genoma → programa NEXO (con subexpresiones comunes compartidas).
  function toProgram(gen) {
    const g = Builder.graph(['draw']);
    const i = g.range(gen.n);
    const leaf = { u: g.div(i, gen.n), t: g.mul(g.time(), 0.5), h: g.hash(i) };
    const memo = new Map();
    const emit = (tr) => {
      if ('c' in tr) return tr.c;
      if (tr.v) return leaf[tr.v];
      const key = JSON.stringify(tr);
      if (!memo.has(key)) memo.set(key, g[tr.op](...tr.k.map(emit)));
      return memo.get(key);
    };
    const e = gen.ch.map(emit);
    const pos = (x) => g.mul(g.sin(x), 0.95);
    const unit = (x) => g.fract(g.abs(x));
    if (gen.kind === 'circle') {
      g.circle(pos(e[0]), pos(e[1]), g.add(0.003, g.mul(unit(e[2]), 0.015)), g.fract(e[3]), g.add(0.2, g.mul(unit(e[4]), 0.6)));
    } else {
      g.line(pos(e[0]), pos(e[1]), pos(e[2]), pos(e[3]), g.fract(e[4]), g.add(0.05, g.mul(unit(e[5]), 0.3)));
    }
    return g.build();
  }

  // Nota estética entre 0 y 1, más una "huella" de dónde pinta en el lienzo.
  const evaluate = (gen) => analyze(gen).score;
  function analyze(gen) {
    const ZERO = { score: 0, sig: null };
    let c;
    try { c = Nexo.compile(toProgram(gen)); } catch (e) { return ZERO; }
    const DT = 0.04;
    const points = (draw) => {
      const a = draw[0].a, n = gen.n;
      const get = (x, k) => (typeof x === 'number' ? x : x[k]);
      const sets = gen.kind === 'circle' ? [[0, 1]] : [[0, 1], [2, 3]];
      const pts = [];
      for (const [xi, yi] of sets) for (let k = 0; k < n; k++) pts.push([get(a[xi], k), get(a[yi], k)]);
      const hue = [];
      for (let k = 0; k < n; k++) hue.push(get(a[gen.kind === 'circle' ? 3 : 4], k));
      return { pts, hue };
    };
    const A = points(c.frame(1, DT));
    const B = points(c.frame(1 + DT, DT));
    const n = A.pts.length;
    let bad = 0;
    const G = 16, grid = new Float64Array(G * G);
    for (const [x, y] of A.pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { bad++; continue; }
      const gx = Math.min(G - 1, Math.max(0, Math.floor(((x + 1) / 2) * G)));
      const gy = Math.min(G - 1, Math.max(0, Math.floor(((y + 1) / 2) * G)));
      grid[gy * G + gx]++;
    }
    if (bad > n * 0.05) return ZERO;
    let H = 0;
    for (const v of grid) if (v) { const p = v / (n - bad); H -= p * Math.log(p); }
    const coverage = H / Math.log(G * G);

    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) || 0;
    let adj = 0, rnd = 0, mov = 0;
    for (let k = 0; k < n; k++) {
      adj += dist(A.pts[k], A.pts[(k + 1) % n]);
      rnd += dist(A.pts[k], A.pts[(k * 7919 + 13) % n]);
      mov += dist(A.pts[k], B.pts[k]);
    }
    const structure = Math.max(0, Math.min(1, 1 - adj / (rnd + 1e-9)));
    const speed = mov / n / DT;
    const ls = Math.log10(speed + 1e-4) - Math.log10(0.3);
    const motion = Math.max(0.1, Math.exp(-(ls * ls) / (2 * 0.35 * 0.35)));
    const hues = A.hue.map((x) => x - Math.floor(x)).filter(Number.isFinite);
    const mean = hues.reduce((s, x) => s + x, 0) / (hues.length || 1);
    const sd = Math.sqrt(hues.reduce((s, x) => s + (x - mean) ** 2, 0) / (hues.length || 1));
    const color = 0.6 + 0.4 * Math.min(1, sd * 3.5);
    const score = coverage * (0.35 + 0.65 * structure) * motion * color;
    // Huella: ocupación del lienzo en una rejilla de 8×8, normalizada.
    const sig = new Float64Array(64);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) sig[(y >> 1) * 8 + (x >> 1)] += grid[y * G + x] / (n - bad);
    return { score: Number.isFinite(score) ? Math.round(score * 10000) / 10000 : 0, sig };
  }
  // Distancia visual entre dos huellas (0 = iguales, 2 = sin nada en común).
  const visualDistance = (a, b) => { if (!a || !b) return 2; let d = 0; for (let k = 0; k < 64; k++) d += Math.abs(a[k] - b[k]); return d; };

  function nodesOf(tree, out = [], parent = null, idx = -1) {
    out.push({ t: tree, parent, idx });
    if (tree.k) tree.k.forEach((k, j) => nodesOf(k, out, tree, j));
    return out;
  }

  function mutate(gen, r) {
    const g = clone(gen);
    const ci = Math.floor(r() * g.ch.length);
    const replace = () => {
      const ns = nodesOf(g.ch[ci]);
      const x = ns[Math.floor(r() * ns.length)];
      const fresh = randTree(r, 2);
      if (x.parent) x.parent.k[x.idx] = fresh; else g.ch[ci] = fresh;
    };
    const roll = r();
    if (roll < 0.4) replace();
    else if (roll < 0.75) {
      let any = false;
      for (const ch of g.ch) for (const x of nodesOf(ch)) {
        if ('c' in x.t && r() < 0.5) { x.t.c = Math.round((x.t.c * (0.7 + r() * 0.6) + (r() - 0.5) * 0.4) * 100) / 100; any = true; }
      }
      if (!any) replace();
    } else if (roll < 0.92) {
      const ops = nodesOf(g.ch[ci]).filter((x) => x.t.op);
      if (ops.length) { const x = pick(r, ops); x.t.op = pick(r, x.t.k.length === 1 ? UN : BI); } else replace();
    } else g.n = pick(r, SIZES);
    // Control de crecimiento: un canal demasiado grande se reinicia.
    g.ch = g.ch.map((ch) => (nodesOf(ch).length > 40 ? randTree(r, 3) : ch));
    return g;
  }

  // Los mejores individuos que además se ven distintos entre sí.
  function distinct(pop, n, minDistance = 0.5) {
    const out = [];
    for (const ind of pop) {
      if (out.every((o) => visualDistance(o.sig, ind.sig) > minDistance)) out.push(ind);
      if (out.length === n) break;
    }
    return out;
  }

  function crossover(a, b, r) {
    if (a.kind !== b.kind) return clone(a);
    return { kind: a.kind, n: r() < 0.5 ? a.n : b.n, ch: a.ch.map((c, k) => clone(r() < 0.5 ? c : b.ch[k])) };
  }

  function create(opts = {}) {
    const r = rng(opts.seed ?? 1);
    const size = opts.size || 24;
    let pop = Array.from({ length: size }, () => ({ g: randomGenome(r), s: null }));
    let generation = 0;
    const score = (ind) => { if (ind.s === null) Object.assign(ind, (({ score: s, sig }) => ({ s, sig }))(analyze(ind.g))); return ind.s; };
    const sortPop = () => { pop.forEach(score); pop.sort((a, b) => b.s - a.s); };
    sortPop();
    const tournament = () => {
      let best = null;
      for (let k = 0; k < 3; k++) { const c = pick(r, pop); if (!best || c.s > best.s) best = c; }
      return best;
    };
    return {
      get generation() { return generation; },
      get population() { return pop; },
      best() { return pop[0]; },
      distinct: (n) => distinct(pop, n),
      step() {
        const next = distinct(pop, 4);
        for (const ind of pop) { if (next.length >= 4) break; if (!next.includes(ind)) next.push(ind); }
        while (next.length < size - 1) {
          const a = tournament();
          const child = r() < 0.5 ? crossover(a.g, tournament().g, r) : clone(a.g);
          next.push({ g: mutate(child, r), s: null });
        }
        next.push({ g: randomGenome(r), s: null }); // un inmigrante por generación mantiene la diversidad
        pop = next;
        generation++;
        sortPop();
        return { generation, best: pop[0], score: pop[0].s };
      },
    };
  }

  return { create, toProgram, evaluate, analyze, visualDistance, randomGenome, mutate, crossover, distinct, rng };
});
