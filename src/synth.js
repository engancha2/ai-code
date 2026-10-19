/*
 * Síntesis de programas: descubrir la fórmula que explica unos datos.
 *
 * Combina las dos formas de aprender de NEXO:
 *   - la ESTRUCTURA (qué operaciones) se busca por evolución;
 *   - las CONSTANTES (los `param`) se ajustan por gradiente, con la
 *     diferenciación automática del propio lenguaje.
 * Lo aprendido se hereda (los hijos empiezan con las constantes ajustadas de
 * sus padres), así que cada generación parte de donde se quedó la anterior.
 *
 * Resultado: un programa NEXO que predice y, de regalo, la fórmula legible.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./nexo'), require('./builder'), require('./evolve'));
  else root.NexoSynth = factory(root.Nexo, root.NexoBuilder, root.NexoEvolve);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Nexo, Builder, Evolve) {
  'use strict';
  const UN = ['sin', 'cos'];
  const BI = ['add', 'sub', 'mul'];
  const MAX_SIZE = 25;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

  const leaf = (r) => (r() < 0.5 ? { v: 'x' } : { p: Math.round((r() * 4 - 2) * 100) / 100 });
  function randTree(r, depth) {
    if (depth <= 0 || r() < 0.3) return leaf(r);
    if (r() < 0.35) return { op: pick(r, UN), k: [randTree(r, depth - 1)] };
    return { op: pick(r, BI), k: [randTree(r, depth - 1), randTree(r, depth - 1)] };
  }
  function nodesOf(t, out = [], parent = null, idx = -1) {
    out.push({ t, parent, idx });
    if (t.k) t.k.forEach((c, j) => nodesOf(c, out, t, j));
    return out;
  }
  const size = (t) => nodesOf(t).length;
  const structureKey = (t) => JSON.stringify(t, (k, v) => (k === 'p' ? 0 : v));

  // Árbol → programa NEXO con su propio objetivo (error cuadrático medio).
  function toProgram(tree) {
    const g = Builder.graph(['input']);
    const x = g.input(0), y = g.input(1);
    const emit = (t) => (t.v ? x : 'p' in t ? g.param(t.p) : g[t.op](...t.k.map(emit)));
    const f = emit(tree);
    const e = g.sub(f, y);
    g.loss(g.div(g.sum(g.mul(e, e)), g.count(e)));
    g.output(f);
    return g.build();
  }

  // Evalúa un árbol directamente (solo para inicializar el escalado lineal).
  function evalTree(t, xs) {
    if (t.v) return Float64Array.from(xs);
    if ('p' in t) return new Float64Array(xs.length).fill(t.p);
    const k = t.k.map((c) => evalTree(c, xs)), f = F[t.op];
    return k.length === 1 ? k[0].map(f) : k[0].map((v, j) => f(v, k[1][j]));
  }
  // Escalado lineal: a y b óptimos (mínimos cuadrados) para y ≈ a + b·f(x).
  // Así la evolución solo busca la FORMA; la escala sale gratis.
  function linearScale(t, data) {
    const f = evalTree(t, data.x), y = data.y, n = y.length;
    let mf = 0, my = 0;
    for (let j = 0; j < n; j++) { mf += f[j]; my += y[j]; }
    mf /= n; my /= n;
    let cov = 0, vf = 0;
    for (let j = 0; j < n; j++) { cov += (f[j] - mf) * (y[j] - my); vf += (f[j] - mf) ** 2; }
    const b = vf > 1e-12 ? cov / vf : 0, a = my - b * mf;
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [my, 0];
  }
  const wrap = (t, a, b) => ({ op: 'add', k: [{ p: a }, { op: 'mul', k: [{ p: b }, t] }] });

  // Ajusta todas las constantes por gradiente (con la autodiferenciación de
  // NEXO) y las escribe de vuelta en el árbol. Devuelve el árbol envuelto.
  function fit(tree, data, steps = 40, lr = 0.1) {
    const w = wrap(tree, ...linearScale(tree, data));
    const params = nodesOf(w).filter((n) => 'p' in n.t);
    try {
      const L = Nexo.createLearner(toProgram(w), { inputs: [data.x, data.y], lr });
      L.step(steps);
      const learned = L.compiled.getParams();
      params.forEach((n, k) => { if (Number.isFinite(learned[k])) n.t.p = learned[k]; });
      const mse = L.loss();
      return { mse: Number.isFinite(mse) ? mse : Infinity, tree: w };
    } catch (e) {
      return { mse: Infinity, tree: w };
    }
  }

  function mutate(tree, r) {
    let t = clone(tree);
    const ns = nodesOf(t);
    const x = pick(r, ns);
    const put = (fresh) => { if (x.parent) x.parent.k[x.idx] = fresh; else t = fresh; };
    const roll = r();
    if (roll < 0.3) put(randTree(r, 2));
    else if (roll < 0.5) { if (x.t.op) x.t.op = pick(r, x.t.k.length === 1 ? UN : BI); else put(leaf(r)); }
    else if (roll < 0.7) put(r() < 0.4 ? { op: pick(r, UN), k: [x.t] } : { op: pick(r, BI), k: [x.t, leaf(r)] });
    else if (roll < 0.85) { const sub = pick(r, nodesOf(x.t)); put(sub.t); }
    else for (const n of ns) if ('p' in n.t) n.t.p = n.t.p * (0.5 + r()) + (r() - 0.5) * 0.5;
    return size(t) > MAX_SIZE ? randTree(r, 3) : t;
  }

  function crossover(a, b, r) {
    let t = clone(a);
    const x = pick(r, nodesOf(t)), donor = clone(pick(r, nodesOf(b)).t);
    if (x.parent) x.parent.k[x.idx] = donor; else t = donor;
    return size(t) > MAX_SIZE ? clone(a) : t;
  }

  // Simplifica: pliega en una constante todo lo que no depende de x,
  // y reescribe x + x → 2·x y x − x → 0. Las constantes plegadas se siguen
  // pudiendo aprender, así que no se pierde nada.
  const F = { sin: Math.sin, cos: Math.cos, add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b };
  const hasX = (t) => !!t.v || (t.k || []).some(hasX);
  const value = (t) => ('p' in t ? t.p : F[t.op](...t.k.map(value)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // o.eps: constantes sumadas más pequeñas que esto se descartan.
  // o.expand: reparte c·(A ± B) → c·A ± c·B (solo para presentar la fórmula).
  function simplify(t, o = {}) {
    const eps = o.eps ?? 1e-3;
    if (!hasX(t)) { const v = value(t); return { p: Number.isFinite(v) ? v : 0 }; }
    if (!t.k) return t;
    const k = t.k.map((c) => simplify(c, o));
    if (t.op === 'mul' && 'p' in k[1] && !('p' in k[0])) k.reverse();
    // sin(−c·X) → −sin(c·X)   y   cos(−c·X) → cos(c·X)
    if ((t.op === 'sin' || t.op === 'cos') && k[0].op === 'mul' && 'p' in k[0].k[0] && k[0].k[0].p < 0) {
      const inner = { op: t.op, k: [{ op: 'mul', k: [{ p: -k[0].k[0].p }, k[0].k[1]] }] };
      return t.op === 'cos' ? inner : { op: 'mul', k: [{ p: -1 }, inner] };
    }
    if (o.expand && (t.op === 'add' || t.op === 'sub')) return tidySum({ op: t.op, k }, eps);
    if (o.expand && t.op === 'mul') {
      // A·(B ± C) → A·B ± A·C, y luego junta las constantes del producto.
      const j = k.findIndex((c) => c.op === 'add' || c.op === 'sub');
      if (j >= 0 && size(k[1 - j]) <= 6) {
        const A = k[1 - j], [B, C] = k[j].k;
        return simplify({ op: k[j].op, k: [{ op: 'mul', k: [clone(A), B] }, { op: 'mul', k: [clone(A), C] }] }, o);
      }
      return tidyProduct(k, eps);
    }
    if (t.op === 'add' && same(k[0], k[1])) return { op: 'mul', k: [{ p: 2 }, k[0]] };
    if (t.op === 'sub' && same(k[0], k[1])) return { p: 0 };
    if (t.op === 'mul') {
      // Constante delante; c1·(c2·X) → (c1·c2)·X
      if ('p' in k[1] && !('p' in k[0])) k.reverse();
      if ('p' in k[0] && k[1].op === 'mul') {
        const inner = k[1].k, ci = inner.findIndex((c) => 'p' in c);
        if (ci >= 0) return { op: 'mul', k: [{ p: k[0].p * inner[ci].p }, inner[1 - ci]] };
      }
    }
    const tiny = (c) => 'p' in c && Math.abs(c.p) < eps;
    if (t.op === 'add' && tiny(k[0])) return k[1];
    if ((t.op === 'add' || t.op === 'sub') && tiny(k[1])) return k[0];
    if (t.op === 'mul' && 'p' in k[0] && Math.abs(k[0].p - 1) < 1e-3) return k[1];
    if (t.op === 'add' || t.op === 'sub') {
      // A ± (−c)·B → A ∓ c·B   y   A ± (−c) → A ∓ c
      const b = k[1], flip = t.op === 'add' ? 'sub' : 'add';
      if ('p' in b && b.p < 0) return { op: flip, k: [k[0], { p: -b.p }] };
      if (b.op === 'mul' && 'p' in b.k[0] && b.k[0].p < 0) return { op: flip, k: [k[0], { op: 'mul', k: [{ p: -b.k[0].p }, b.k[1]] }] };
    }
    return { op: t.op, k };
  }

  // Aplana un producto: multiplica todas las constantes y las pone delante.
  function tidyProduct(k, eps) {
    const factors = [];
    const walk = (u) => { if (u.op === 'mul') u.k.forEach(walk); else factors.push(u); };
    k.forEach(walk);
    let c = 1;
    const rest = [];
    for (const f of factors) if ('p' in f) c *= f.p; else rest.push(f);
    if (c === 0 || !rest.length) return { p: rest.length ? 0 : c };
    rest.sort((a, b) => (b.v ? 1 : 0) - (a.v ? 1 : 0)); // las x primero
    let out = rest[0];
    for (const f of rest.slice(1)) out = { op: 'mul', k: [out, f] };
    return Math.abs(c - 1) < eps ? out : { op: 'mul', k: [{ p: c }, out] };
  }

  // Aplana una suma, junta las constantes en una sola y pone primero los términos positivos.
  function tidySum(t, eps) {
    const list = [];
    const walk = (u, sign) => {
      if (u.op === 'add') { walk(u.k[0], sign); walk(u.k[1], sign); }
      else if (u.op === 'sub') { walk(u.k[0], sign); walk(u.k[1], -sign); }
      else list.push({ sign, t: u });
    };
    walk(t, 1);
    let c = 0;
    const rest = [];
    for (const { sign, t: u } of list) {
      if ('p' in u) c += sign * u.p;
      else if (u.op === 'mul' && 'p' in u.k[0] && u.k[0].p < 0) rest.push({ sign: -sign, t: Math.abs(u.k[0].p + 1) < eps ? u.k[1] : { op: 'mul', k: [{ p: -u.k[0].p }, u.k[1]] } });
      else rest.push({ sign, t: u });
    }
    rest.sort((a, b) => b.sign - a.sign);
    if (Math.abs(c) >= eps) rest.push({ sign: c < 0 ? -1 : 1, t: { p: Math.abs(c) } });
    if (!rest.length) return { p: c };
    const first = rest[0];
    let out = first.sign > 0 ? first.t
      : first.t.op === 'mul' && 'p' in first.t.k[0] ? { op: 'mul', k: [{ p: -first.t.k[0].p }, first.t.k[1]] }
      : 'p' in first.t ? { p: -first.t.p } : { op: 'mul', k: [{ p: -1 }, first.t] };
    for (const { sign, t: u } of rest.slice(1)) out = { op: sign > 0 ? 'add' : 'sub', k: [out, u] };
    return out;
  }

  // Fórmula legible (el andamio humano de la síntesis).
  function formula(t, ctx) {
    const num = (v) => {
      const s = (Math.round(v * 1000) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 3 });
      return v < 0 ? `(${s})` : s;
    };
    if (t.v) return 'x';
    if ('p' in t) return num(t.p);
    if (t.k.length === 1) return `${t.op}(${formula(t.k[0])})`;
    if (t.op === 'mul') {
      const fs = [];
      const walk = (u) => { if (u.op === 'mul') u.k.forEach(walk); else fs.push(u); };
      walk(t);
      const nx = fs.filter((f) => f.v).length, sup = ['', '', '²', '³', '⁴', '⁵', '⁶'];
      const parts = fs.filter((f) => !f.v).map((f) => formula(f, 'mul'));
      if (nx) parts.splice('p' in fs[0] ? 1 : 0, 0, 'x' + (sup[nx] ?? '^' + nx));
      return parts.join('·');
    }
    const s = `${formula(t.k[0], 'left')} ${t.op === 'add' ? '+' : '−'} ${formula(t.k[1], t.op === 'sub' ? 'subRight' : 'left')}`;
    return ctx === 'mul' || ctx === 'subRight' ? `(${s})` : s;
  }

  // Búsqueda en islas: varias poblaciones evolucionan por separado y cada
  // cierto número de generaciones se pasan su mejor individuo. Así una isla
  // atascada en un óptimo local no arrastra a las demás.
  function create(data, opts = {}) {
    const r = Evolve.rng(opts.seed ?? 1);
    const nIslands = opts.islands || 4, popSize = opts.size || 30, fitSteps = opts.fitSteps || 30;
    const migrateEvery = opts.migrateEvery || 10;
    const mean = data.y.reduce((s, v) => s + v, 0) / data.y.length;
    const variance = data.y.reduce((s, v) => s + (v - mean) ** 2, 0) / data.y.length || 1;
    const display = { eps: 0.005 * Math.sqrt(variance), expand: true };
    // Nota (menor es mejor): error relativo + una pequeña penalización por tamaño.
    const score = (ind) => {
      if (ind.s === undefined) {
        ind.t = simplify(ind.t);
        const res = fit(ind.t, data, fitSteps);
        ind.mse = res.mse; ind.full = res.tree;
        ind.s = ind.mse / variance + (opts.parsimony ?? 0.0003) * size(ind.t);
      }
      return ind.s;
    };
    const sortPop = (pop) => { pop.forEach(score); pop.sort((a, b) => a.s - b.s); };
    let islands = Array.from({ length: nIslands }, () => {
      const pop = Array.from({ length: popSize }, () => ({ t: randTree(r, 3) }));
      sortPop(pop);
      return pop;
    });
    let generation = 0;
    const evolveIsland = (pop) => {
      const tournament = () => { let best = null; for (let k = 0; k < 3; k++) { const c = pick(r, pop); if (!best || c.s < best.s) best = c; } return best; };
      const seen = new Set(), next = [];
      for (const ind of pop) {
        const key = structureKey(ind.t);
        if (seen.has(key)) continue;
        seen.add(key); next.push(ind);
        if (next.length === 4) break;
      }
      while (next.length < popSize - 2) {
        const a = tournament();
        next.push({ t: r() < 0.3 ? crossover(a.t, tournament().t, r) : mutate(a.t, r) });
      }
      while (next.length < popSize) next.push({ t: randTree(r, 3) });
      sortPop(next);
      return next;
    };
    const champion = () => islands.map((p) => p[0]).reduce((a, b) => (b.s < a.s ? b : a));
    const describe = (ind) => { const t = simplify(clone(ind.full), display); return { formula: formula(t), mse: ind.mse, size: size(t), tree: t }; };
    return {
      get generation() { return generation; },
      best: () => describe(champion()),
      score: () => champion().s,
      step() {
        islands = islands.map(evolveIsland);
        generation++;
        if (generation % migrateEvery === 0) {
          // El mejor de cada isla viaja a la siguiente y sustituye a su peor individuo.
          const travellers = islands.map((p) => ({ t: clone(p[0].t) }));
          islands.forEach((p, k) => { p[p.length - 1] = travellers[(k + nIslands - 1) % nIslands]; sortPop(p); });
        }
        return { generation, ...describe(champion()) };
      },
      // Afina las constantes del mejor con muchos más pasos y devuelve el programa final.
      finish(steps = 400) {
        const res = fit(simplify(clone(champion().t)), data, steps, 0.05);
        const t = simplify(res.tree, display); // tras ajustar, ordena signos y constantes
        const prog = toProgram(t);
        const c = Nexo.compile(prog, { inputs: [data.x, data.y] });
        c.frame(0);
        return { formula: formula(t), mse: c.lossValue(), size: size(t), tree: t, program: prog };
      },
    };
  }

  // Busca hasta `generations` generaciones; para antes si la mejor fórmula
  // lleva `patience` generaciones sin mejorar.
  function synthesize(data, opts = {}) {
    const s = create(data, opts);
    const gens = opts.generations ?? 80, patience = opts.patience ?? 25;
    let bestScore = Infinity, since = 0;
    for (let k = 0; k < gens; k++) {
      s.step();
      const b = s.score();
      if (b < bestScore - 1e-9) { bestScore = b; since = 0; } else since++;
      if (opts.onStep) opts.onStep(s.best(), s.generation);
      if (since >= patience) break;
    }
    return { generations: s.generation, ...s.finish() };
  }

  return { create, synthesize, toProgram, formula, simplify, fit };
});
