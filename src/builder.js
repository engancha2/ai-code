/*
 * Constructor de grafos NEXO. Es la herramienta con la que una IA (o un
 * humano curioso) emite programas sin escribir texto: cada llamada añade un
 * nodo y devuelve una referencia. Los números sueltos se convierten en
 * constantes y se deduplican.
 *
 *   const g = graph(['draw']);
 *   const onda = g.func(2, (f, a, b) => f.sin(f.mul(a, b)));
 *   const x = g.state();                 // memoria entre fotogramas
 *   x.set(g.add(x, g.call(onda, g.time(), 2)));
 *   g.circle(x, 0, 0.1, 0.5, 1);
 *   const programa = g.build();
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./nexo'));
  else root.NexoBuilder = factory(root.Nexo);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Nexo) {
  'use strict';
  const SPECIAL = new Set(['const', 'range', 'prev', 'input', 'call', 'arg', 'param']);
  const DRAW = new Set(['circle', 'line', 'layer', 'shade']);

  function scope(nodes, funcs, isMain) {
    const consts = new Map();
    const g = { nodes };
    const ref = (x) => {
      if (x && x.__node) return x.i;
      if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`valor no válido: ${x}`);
      if (!consts.has(x)) { nodes.push(['const', [], x]); consts.set(x, nodes.length - 1); }
      return consts.get(x);
    };
    const node = (op, ins, c) => {
      const n = [op, ins.map(ref)];
      if (c !== undefined) n.push(c);
      nodes.push(n);
      return { __node: true, i: nodes.length - 1 };
    };
    g._node = node;
    for (const [name, arity, , hasConst] of Nexo.OPS) {
      if (SPECIAL.has(name) || hasConst) continue;
      g[name] = (...xs) => {
        if (arity >= 0 && xs.length !== arity) throw new Error(`${name} espera ${arity} entradas`);
        return node(name, xs);
      };
    }
    g.range = (n) => node('range', [], n);
    g.input = (slot) => node('input', [], slot);
    g.call = (f, ...xs) => {
      if (xs.length !== f.nargs) throw new Error(`la función espera ${f.nargs} argumentos`);
      return node('call', xs, f.idx);
    };
    // Define una función (subgrafo). Solo puede llamar a funciones ya definidas.
    g.func = (nargs, body) => {
      const fs = scope([], funcs, false);
      const args = [];
      for (let k = 0; k < nargs; k++) args.push(fs._node('arg', [], k));
      fs._finish(body(fs, ...args));
      funcs.push({ nodes: fs.nodes });
      return { __func: true, idx: funcs.length - 1, nargs };
    };
    // La salida de un cuerpo es su último nodo.
    g._finish = (out) => {
      const i = ref(out);
      if (i === nodes.length - 1) return;
      const r = { __node: true, i };
      if (DRAW.has(nodes[i][0])) node('layer', [r]); else node('add', [r, 0]);
    };
    // Marca qué valor es la salida del cuerpo (lo coloca como último nodo).
    g.output = (x) => { g._finish(x); return { __node: true, i: nodes.length - 1 }; };
    if (isMain) {
      // Constante que el programa puede aprender (ver `loss` y Nexo.learn).
      g.param = (initial) => node('param', [], initial);
      // Estado: devuelve el valor del fotograma anterior; se fija con .set(nuevo).
      g.state = () => {
        const s = node('prev', [], -1);
        s.set = (x) => { nodes[s.i][2] = ref(x); };
        return s;
      };
    }
    return g;
  }

  function graph(caps = ['draw']) {
    const funcs = [];
    const g = scope([], funcs, true);
    g.build = () => {
      const p = { nexo: Nexo.VERSION, caps, nodes: g.nodes };
      if (funcs.length) p.funcs = funcs;
      return p;
    };
    return g;
  }

  return { graph };
});
