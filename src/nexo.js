/*
 * NEXO — un lenguaje de programación hecho para que lo escriban y lean las IA.
 *
 * Un programa NEXO no es texto: es un grafo de flujo de datos.
 *   - Cada nodo es [operación, [entradas], constante?]
 *   - Las entradas solo pueden apuntar a nodos ANTERIORES  → no hay ciclos,
 *     todo programa válido termina, y el orden ya es un orden topológico.
 *   - Todos los valores son vectores: una operación se aplica a miles de
 *     elementos a la vez (sin bucles explícitos).
 *   - No hay strings ejecutables, ni eval, ni acceso al sistema salvo las
 *     capacidades declaradas → las inyecciones no se pueden ni expresar.
 *
 * Forma canónica para máquinas: binario compacto (encode/decode).
 * Forma JSON: andamio para depurar mientras el proyecto madura.
 *
 * Licencia MIT.
 */
(function (root) {
  'use strict';

  // [nombre, aridad (-1 = variable), tipo de salida, usa constante, capacidad]
  const OPS = [
    ['const', 0, 'num', true, null],
    ['time', 0, 'num', false, null],
    ['range', 0, 'num', true, null],
    ['add', 2, 'num', false, null],
    ['sub', 2, 'num', false, null],
    ['mul', 2, 'num', false, null],
    ['div', 2, 'num', false, null],
    ['mod', 2, 'num', false, null],
    ['sin', 1, 'num', false, null],
    ['cos', 1, 'num', false, null],
    ['abs', 1, 'num', false, null],
    ['sqrt', 1, 'num', false, null],
    ['min', 2, 'num', false, null],
    ['max', 2, 'num', false, null],
    ['pow', 2, 'num', false, null],
    ['fract', 1, 'num', false, null],
    ['hash', 1, 'num', false, null],
    ['circle', 5, 'draw', false, 'draw'], // x y radio tono alfa
    ['line', 6, 'draw', false, 'draw'],   // x1 y1 x2 y2 tono alfa
    ['layer', -1, 'draw', false, 'draw'],
  ];
  const BY_NAME = Object.fromEntries(OPS.map((o, i) => [o[0], i]));
  const CAPS = ['draw'];
  const MAX_NODES = 4096;
  const MAX_RANGE = 20000;

  // ---------- verificación ----------
  // Devuelve un "plan": tipos, niveles paralelos y qué nodos dependen del tiempo.
  function verify(prog) {
    const errors = [];
    const err = (i, m) => errors.push(`nodo ${i}: ${m}`);
    if (!prog || !Array.isArray(prog.nodes)) return { ok: false, errors: ['falta nodes'] };
    const caps = new Set(prog.caps || []);
    const n = prog.nodes.length;
    if (n === 0 || n > MAX_NODES) return { ok: false, errors: [`tamaño inválido (${n})`] };
    const type = [], level = [], dyn = [];
    let cost = 0;
    prog.nodes.forEach((node, i) => {
      const op = BY_NAME[node[0]];
      if (op === undefined) return err(i, `operación desconocida "${node[0]}"`);
      const [name, arity, out, hasConst, cap] = OPS[op];
      const ins = node[1] || [];
      if (arity >= 0 && ins.length !== arity) err(i, `${name} espera ${arity} entradas`);
      if (arity < 0 && ins.length === 0) err(i, `${name} necesita entradas`);
      if (cap && !caps.has(cap)) err(i, `requiere la capacidad "${cap}"`);
      if (hasConst && typeof node[2] !== 'number') err(i, `${name} necesita una constante numérica`);
      if (name === 'range' && !(node[2] >= 1 && node[2] <= MAX_RANGE)) err(i, `range fuera de límites`);
      let lv = 0, d = name === 'time';
      for (const r of ins) {
        if (!Number.isInteger(r) || r < 0 || r >= i) { err(i, `referencia ${r} no apunta hacia atrás`); continue; }
        const want = name === 'layer' ? 'draw' : 'num';
        if (type[r] !== want) err(i, `entrada ${r} es ${type[r]}, se esperaba ${want}`);
        lv = Math.max(lv, level[r] + 1);
        d = d || dyn[r];
      }
      type[i] = out; level[i] = lv; dyn[i] = d;
      cost += name === 'range' ? node[2] : 1;
    });
    if (!errors.length && type[n - 1] !== 'draw') errors.push('el último nodo debe producir dibujo');
    const levels = errors.length ? 0 : Math.max(...level) + 1;
    return { ok: !errors.length, errors, type, level, dyn, levels, cost,
             staticCount: dyn.filter(x => !x).length };
  }

  // ---------- binario ----------
  // Cabecera "NX" + versión + capacidades (bitmask) + nº nodos (varint)
  // Cada nodo: opcode (1 byte) [+ nº entradas si variable] + entradas como
  // distancia hacia atrás (varint) [+ constante float32].
  function encode(prog) {
    const v = verify(prog);
    if (!v.ok) throw new Error(v.errors.join('; '));
    const out = [];
    const varint = (x) => { do { let b = x & 127; x >>>= 7; if (x) b |= 128; out.push(b); } while (x); };
    out.push(0x4e, 0x58, 1);
    out.push(CAPS.reduce((m, c, i) => m | ((prog.caps || []).includes(c) ? 1 << i : 0), 0));
    varint(prog.nodes.length);
    const f = new DataView(new ArrayBuffer(4));
    prog.nodes.forEach((node, i) => {
      const op = BY_NAME[node[0]];
      out.push(op);
      const ins = node[1] || [];
      if (OPS[op][1] < 0) varint(ins.length);
      for (const r of ins) varint(i - r);
      if (OPS[op][3]) { f.setFloat32(0, node[2], true); for (let k = 0; k < 4; k++) out.push(f.getUint8(k)); }
    });
    return new Uint8Array(out);
  }

  function decode(bytes) {
    let p = 0;
    const varint = () => { let x = 0, s = 0, b; do { b = bytes[p++]; x |= (b & 127) << s; s += 7; } while (b & 128); return x >>> 0; };
    if (bytes[0] !== 0x4e || bytes[1] !== 0x58) throw new Error('no es un programa NEXO');
    p = 3;
    const mask = bytes[p++];
    const caps = CAPS.filter((_, i) => mask & (1 << i));
    const n = varint();
    if (n > MAX_NODES) throw new Error('demasiados nodos');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const op = bytes[p++];
      if (!OPS[op]) throw new Error(`opcode ${op} desconocido`);
      const [name, arity, , hasConst] = OPS[op];
      const k = arity < 0 ? varint() : arity;
      const ins = [];
      for (let j = 0; j < k; j++) ins.push(i - varint());
      const node = [name, ins];
      if (hasConst) { node.push(dv.getFloat32(p, true)); p += 4; }
      nodes.push(node);
    }
    return { nexo: 1, caps, nodes };
  }

  // ---------- ejecución vectorizada ----------
  const isArr = (x) => typeof x !== 'number';
  const len = (x) => (isArr(x) ? x.length : 1);
  const at = (x, k) => (isArr(x) ? x[k] : x);
  function map1(a, f) {
    if (!isArr(a)) return f(a);
    const o = new Float64Array(a.length);
    for (let k = 0; k < a.length; k++) o[k] = f(a[k]);
    return o;
  }
  function map2(a, b, f) {
    if (!isArr(a) && !isArr(b)) return f(a, b);
    const n = isArr(a) && isArr(b) ? Math.min(a.length, b.length) : Math.max(len(a), len(b));
    const o = new Float64Array(n);
    for (let k = 0; k < n; k++) o[k] = f(at(a, k), at(b, k));
    return o;
  }
  const fr = (x) => x - Math.floor(x);
  const NUM = {
    add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b,
    div: (a, b) => (b === 0 ? 0 : a / b), mod: (a, b) => (b === 0 ? 0 : ((a % b) + b) % b),
    min: Math.min, max: Math.max, pow: (a, b) => Math.pow(Math.abs(a), b),
    sin: Math.sin, cos: Math.cos, abs: Math.abs, sqrt: (a) => Math.sqrt(Math.abs(a)),
    fract: fr, hash: (a) => fr(Math.sin(a * 12.9898 + 78.233) * 43758.5453),
  };

  // Compila: verifica una vez, precalcula todo lo que no depende del tiempo.
  function compile(prog) {
    const plan = verify(prog);
    if (!plan.ok) throw new Error(plan.errors.join('\n'));
    const nodes = prog.nodes;
    const vals = new Array(nodes.length);
    const evalNode = (i, t) => {
      const [name, ins, c] = nodes[i];
      const a = ins.map((r) => vals[r]);
      switch (name) {
        case 'const': return c;
        case 'time': return t;
        case 'range': { const o = new Float64Array(c); for (let k = 0; k < c; k++) o[k] = k; return o; }
        case 'circle': return [{ kind: 'c', a }];
        case 'line': return [{ kind: 'l', a }];
        case 'layer': return a.flat();
        default: return a.length === 1 ? map1(a[0], NUM[name]) : map2(a[0], a[1], NUM[name]);
      }
    };
    for (let i = 0; i < nodes.length; i++) if (!plan.dyn[i]) vals[i] = evalNode(i, 0);
    const dynIdx = [];
    for (let i = 0; i < nodes.length; i++) if (plan.dyn[i]) dynIdx.push(i);
    return {
      plan,
      frame(t) { for (const i of dynIdx) vals[i] = evalNode(i, t); return vals[nodes.length - 1]; },
    };
  }

  // Dibuja una lista de primitivas en un canvas 2D. Espacio: -1..1, origen centro.
  function render(ctx, draws, w, h) {
    const s = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    let count = 0;
    for (const d of draws) {
      const n = Math.max(...d.a.map(len));
      for (let k = 0; k < n; k++) {
        const v = d.a.map((x) => at(x, k));
        const hue = fr(v[d.kind === 'c' ? 3 : 4]) * 360;
        const alpha = Math.max(0, Math.min(1, v[d.kind === 'c' ? 4 : 5]));
        if (d.kind === 'c') {
          ctx.fillStyle = `hsla(${hue},85%,62%,${alpha})`;
          ctx.beginPath();
          ctx.arc(cx + v[0] * s, cy + v[1] * s, Math.abs(v[2]) * s, 0, 6.2832);
          ctx.fill();
        } else {
          ctx.strokeStyle = `hsla(${hue},85%,62%,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(cx + v[0] * s, cy + v[1] * s);
          ctx.lineTo(cx + v[2] * s, cy + v[3] * s);
          ctx.stroke();
        }
        count++;
      }
    }
    return count;
  }

  const Nexo = { OPS, CAPS, verify, encode, decode, compile, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = Nexo;
  else root.Nexo = Nexo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
