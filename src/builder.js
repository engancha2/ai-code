/*
 * Constructor de grafos NEXO. Es la herramienta que usa una IA (o un humano
 * curioso) para emitir programas sin escribir texto: cada llamada añade un
 * nodo y devuelve su índice. Los números sueltos se convierten en constantes
 * y se deduplican.
 */
const Nexo = require('./nexo');

function graph(caps = ['draw']) {
  const nodes = [];
  const consts = new Map();
  const ref = (x) => {
    if (consts.has(x)) return consts.get(x);
    nodes.push(['const', [], x]);
    consts.set(x, nodes.length - 1);
    return nodes.length - 1;
  };
  const node = (op, ins, c) => {
    const n = [op, ins.map((x) => (typeof x === 'object' ? x.i : ref(x)))];
    if (c !== undefined) n.push(c);
    nodes.push(n);
    return { __node: true, i: nodes.length - 1 };
  };
  const g = { nodes };
  for (const [name, arity] of Nexo.OPS) {
    if (['const', 'range'].includes(name)) continue;
    g[name] = arity < 0 ? (...xs) => node(name, xs) : (...xs) => node(name, xs.slice(0, arity));
  }
  g.range = (n) => node('range', [], n);
  g.time = () => node('time', []);
  g.build = () => ({ nexo: 1, caps, nodes });
  return g;
}

module.exports = { graph };
