/*
 * NEXO — un lenguaje de programación hecho para que lo escriban y lean las IA.
 *
 * Un programa NEXO no es texto: es un grafo de flujo de datos.
 *   - Cada nodo es [operación, [entradas], constante?]
 *   - Las entradas solo apuntan a nodos ANTERIORES → no hay ciclos y todo
 *     fotograma termina. El orden de los nodos ya es el orden de ejecución.
 *   - Funciones: subgrafos que solo pueden llamar a funciones anteriores
 *     (sin recursión) y que se expanden en línea al compilar.
 *   - Estado: `prev` lee el valor que tuvo un nodo en el fotograma anterior.
 *     Es la única forma de "memoria" y no rompe la garantía de terminación.
 *   - Formas: escalar, vector (miles de elementos a la vez) o píxel (se
 *     compila a la GPU). El verificador impide mezclarlas mal.
 *   - Sin strings ejecutables ni acceso al sistema salvo capacidades
 *     declaradas → las inyecciones no se pueden ni expresar.
 *
 * Licencia MIT.
 */
(function (root) {
  'use strict';

  // [nombre, aridad (-1 = variable), tipo de salida, usa constante, capacidad]
  // El índice es el opcode binario: NUNCA se reordena, solo se añade al final.
  const OPS = [
    // v0.1
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
    ['circle', 5, 'draw', false, 'draw'],
    ['line', 6, 'draw', false, 'draw'],
    ['layer', -1, 'draw', false, 'draw'],
    // v0.2 — lógica y matemáticas
    ['lt', 2, 'num', false, null],
    ['gt', 2, 'num', false, null],
    ['floor', 1, 'num', false, null],
    ['select', 3, 'num', false, null],
    ['mix', 3, 'num', false, null],
    ['atan2', 2, 'num', false, null],
    ['exp', 1, 'num', false, null],
    // v0.2 — vectores
    ['sum', 1, 'num', false, null],
    ['vmin', 1, 'num', false, null],
    ['vmax', 1, 'num', false, null],
    ['count', 1, 'num', false, null],
    ['scan', 1, 'num', false, null],
    ['gather', 2, 'num', false, null],
    ['pack', -1, 'num', false, null],
    // v0.2 — tiempo y estado
    ['frame', 0, 'num', false, null],
    ['dt', 0, 'num', false, null],
    ['prev', 0, 'num', true, null],
    // v0.2 — datos de entrada
    ['input', 0, 'num', true, 'input'],
    // v0.2 — funciones
    ['call', -1, 'num', true, null],
    ['arg', 0, 'num', true, null],
    // v0.2 — GPU
    ['px', 0, 'num', false, null],
    ['py', 0, 'num', false, null],
    ['shade', 3, 'draw', false, 'draw'],
  ];
  const BY_NAME = Object.fromEntries(OPS.map((o, i) => [o[0], i]));
  const CAPS = ['draw', 'input'];
  const VERSION = 2;
  const LIMITS = { nodes: 4096, funcs: 256, flat: 65536, range: 20000, slots: 16, uniforms: 64 };
  const DYN_SOURCES = new Set(['time', 'frame', 'dt', 'prev']);
  const REDUCE = new Set(['sum', 'vmin', 'vmax', 'count']);

  // ---------- expansión de funciones ----------
  // Inserta en línea cada `call`. Como una función solo puede llamar a
  // funciones anteriores, la expansión siempre termina.
  function expand(prog) {
    const errors = [];
    if (!prog || !Array.isArray(prog.nodes)) return { errors: ['falta nodes'] };
    const funcs = Array.isArray(prog.funcs) ? prog.funcs : [];
    if (funcs.length > LIMITS.funcs) return { errors: ['demasiadas funciones'] };
    const nargs = funcs.map((f) => {
      let m = -1;
      for (const nd of (f && f.nodes) || []) if (Array.isArray(nd) && nd[0] === 'arg') m = Math.max(m, nd[2]);
      return m + 1;
    });

    const checkBody = (nodes, where, fi) => {
      if (!Array.isArray(nodes) || nodes.length === 0) return errors.push(`${where}: vacío`);
      if (nodes.length > LIMITS.nodes) return errors.push(`${where}: demasiados nodos`);
      nodes.forEach((nd, j) => {
        const e = (m) => errors.push(`${where}, nodo ${j}: ${m}`);
        if (!Array.isArray(nd)) return e('no es un nodo');
        const ins = Array.isArray(nd[1]) ? nd[1] : [];
        for (const r of ins) if (!Number.isInteger(r) || r < 0 || r >= j) e(`referencia ${r} no apunta hacia atrás`);
        if (nd[0] === 'call') {
          const limit = fi === null ? funcs.length : fi;
          if (!Number.isInteger(nd[2]) || nd[2] < 0 || nd[2] >= limit) {
            e(fi === null ? `función ${nd[2]} no existe` : 'solo puede llamar a funciones anteriores (sin recursión)');
          } else if (ins.length !== nargs[nd[2]]) e(`la función ${nd[2]} espera ${nargs[nd[2]]} argumentos`);
        }
        if (nd[0] === 'arg') {
          if (fi === null) e('arg solo existe dentro de funciones');
          else if (!Number.isInteger(nd[2]) || nd[2] < 0 || nd[2] >= LIMITS.slots) e('índice de argumento inválido');
        }
        if (nd[0] === 'prev' && fi !== null) e('prev no está permitido dentro de funciones');
      });
    };
    funcs.forEach((f, fi) => checkBody(f && f.nodes, `función ${fi}`, fi));
    checkBody(prog.nodes, 'programa', null);
    if (errors.length) return { errors };

    const flat = [];
    const emit = (nodes, argRefs) => {
      const map = [];
      nodes.forEach((nd, j) => {
        const ins = (Array.isArray(nd[1]) ? nd[1] : []).map((r) => map[r]);
        if (nd[0] === 'arg') { map[j] = argRefs[nd[2]]; return; }
        if (nd[0] === 'call') { const m = emit(funcs[nd[2]].nodes, ins); map[j] = m[m.length - 1]; return; }
        const c = [nd[0], ins];
        if (nd.length > 2) c.push(nd[2]);
        flat.push(c);
        if (flat.length > LIMITS.flat) throw new Error('la expansión de funciones es demasiado grande');
        map[j] = flat.length - 1;
      });
      return map;
    };
    let map;
    try { map = emit(prog.nodes, []); } catch (e) { return { errors: [e.message] }; }
    // `prev` apunta a un nodo del programa original: lo traducimos al grafo plano.
    prog.nodes.forEach((nd, j) => {
      if (nd[0] !== 'prev') return;
      const t = nd[2];
      flat[map[j]][2] = Number.isInteger(t) && t >= 0 && t < prog.nodes.length ? map[t] : -1;
    });
    return { errors: [], flat, map };
  }

  // ---------- verificación del grafo plano ----------
  function check(nodes, caps) {
    const errors = [];
    const err = (i, m) => errors.push(`nodo ${i}: ${m}`);
    const n = nodes.length;
    const op = [], type = [], level = [], dyn = [];
    const prevNodes = [];
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      type[i] = 'num'; level[i] = 0; dyn[i] = false;
      const o = BY_NAME[node[0]];
      if (o === undefined) { err(i, `operación desconocida "${node[0]}"`); continue; }
      op[i] = o;
      const [name, arity, out, hasConst, cap] = OPS[o];
      const ins = node[1];
      if (name === 'call' || name === 'arg') err(i, `${name} no puede quedar tras expandir`);
      if (arity >= 0 && ins.length !== arity) err(i, `${name} espera ${arity} entradas`);
      if (arity < 0 && ins.length === 0) err(i, `${name} necesita entradas`);
      if (cap && !caps.has(cap)) err(i, `requiere la capacidad "${cap}"`);
      if (hasConst && !Number.isFinite(node[2])) err(i, `${name} necesita una constante numérica`);
      if (name === 'range' && !(node[2] >= 1 && node[2] <= LIMITS.range)) err(i, 'range fuera de límites');
      if (name === 'input' && !(Number.isInteger(node[2]) && node[2] >= 0 && node[2] < LIMITS.slots)) err(i, 'ranura de entrada inválida');
      if (name === 'prev') {
        if (!(Number.isInteger(node[2]) && node[2] >= 0 && node[2] < n)) err(i, 'prev apunta a un nodo inexistente');
        else prevNodes.push(i);
      }
      let lv = 0, d = DYN_SOURCES.has(name);
      for (const r of ins) {
        if (!Number.isInteger(r) || r < 0 || r >= i) { err(i, `referencia ${r} no apunta hacia atrás`); continue; }
        const want = name === 'layer' ? 'draw' : 'num';
        if (type[r] !== want) err(i, `entrada ${r} es ${type[r]}, se esperaba ${want}`);
        lv = Math.max(lv, level[r] + 1);
        d = d || dyn[r];
      }
      type[i] = out; level[i] = lv; dyn[i] = d;
      cost += name === 'range' ? node[2] : 1;
    }
    for (const p of prevNodes) if (type[nodes[p][2]] !== 'num') err(p, 'prev solo puede recordar números');
    if (errors.length) return { ok: false, errors };

    // Formas: s = escalar, v = vector, p = píxel (GPU), d = dibujo.
    // `prev` toma la forma de su destino, que puede estar más adelante:
    // se resuelve por punto fijo.
    const guess = {};
    let shape, shapeErrors;
    for (let iter = 0; iter < 8; iter++) {
      ({ shape, shapeErrors } = shapes(nodes, op, guess));
      let changed = false;
      for (const p of prevNodes) {
        const ts = shape[nodes[p][2]];
        if (ts === 'p') { shapeErrors.push(`nodo ${p}: prev no puede recordar valores por píxel`); continue; }
        if (ts === 'v' && guess[p] !== 'v') { guess[p] = 'v'; changed = true; }
      }
      if (!changed) break;
    }
    if (shapeErrors.length) return { ok: false, errors: shapeErrors };

    return {
      ok: true, errors: [], type, shape, level, dyn, cost,
      levels: Math.max(...level) + 1,
      staticCount: dyn.filter((x) => !x).length,
      output: type[n - 1],
    };
  }

  function shapes(nodes, op, guess) {
    const shape = [], shapeErrors = [];
    for (let i = 0; i < nodes.length; i++) {
      const name = OPS[op[i]][0];
      const s = nodes[i][1].map((r) => shape[r]);
      const bad = (m) => shapeErrors.push(`nodo ${i}: ${m}`);
      switch (name) {
        case 'const': case 'time': case 'frame': case 'dt': shape[i] = 's'; break;
        case 'range': case 'input': shape[i] = 'v'; break;
        case 'px': case 'py': shape[i] = 'p'; break;
        case 'prev': shape[i] = guess[i] || 's'; break;
        case 'sum': case 'vmin': case 'vmax': case 'count':
          if (s[0] === 'p') bad(`${name} no acepta valores por píxel`);
          shape[i] = 's'; break;
        case 'scan':
          if (s[0] === 'p') bad('scan no acepta valores por píxel');
          shape[i] = s[0] === 'v' ? 'v' : 's'; break;
        case 'gather':
          if (s.includes('p')) bad('gather no acepta valores por píxel');
          shape[i] = s[1] === 'v' ? 'v' : 's'; break;
        case 'pack':
          if (s.some((x) => x !== 's')) bad('pack solo empaqueta escalares');
          shape[i] = 'v'; break;
        case 'circle': case 'line':
          if (s.includes('p')) bad(`${name} no acepta valores por píxel; usa shade`);
          shape[i] = 'd'; break;
        case 'shade':
          if (s.includes('v')) bad('shade acepta escalares o valores por píxel, no vectores');
          shape[i] = 'd'; break;
        case 'layer': shape[i] = 'd'; break;
        default: {
          const hasV = s.includes('v'), hasP = s.includes('p');
          if (hasV && hasP) bad('no se pueden mezclar vectores y valores por píxel');
          shape[i] = hasP ? 'p' : hasV ? 'v' : 's';
        }
      }
    }
    return { shape, shapeErrors };
  }

  // Punto de entrada: expande, verifica y devuelve el plan de ejecución.
  function verify(prog) {
    const e = expand(prog);
    if (e.errors.length) return { ok: false, errors: e.errors };
    const plan = check(e.flat, new Set(prog.caps || []));
    plan.flat = e.flat;
    plan.map = e.map;
    return plan;
  }

  // ---------- binario ----------
  // "NX" · versión · capacidades · nº funciones · [funciones] · programa
  // Cada cuerpo: nº nodos (varint) y por nodo: opcode, [nº entradas si es
  // variable], entradas como distancia hacia atrás (varint), [constante f32].
  function encodeMap(prog) {
    const v = verify(prog);
    if (!v.ok) throw new Error(v.errors.join('; '));
    const out = [], opAt = [];
    const varint = (x) => { do { let b = x & 127; x >>>= 7; if (x) b |= 128; out.push(b); } while (x); };
    const f = new DataView(new ArrayBuffer(4));
    const body = (nodes) => {
      varint(nodes.length);
      nodes.forEach((node, i) => {
        const op = BY_NAME[node[0]];
        opAt.push(out.length);
        out.push(op);
        const ins = node[1] || [];
        if (OPS[op][1] < 0) varint(ins.length);
        for (const r of ins) varint(i - r);
        if (OPS[op][3]) { f.setFloat32(0, node[2], true); for (let k = 0; k < 4; k++) out.push(f.getUint8(k)); }
      });
    };
    out.push(0x4e, 0x58, VERSION);
    out.push(CAPS.reduce((m, c, i) => m | ((prog.caps || []).includes(c) ? 1 << i : 0), 0));
    const funcs = prog.funcs || [];
    varint(funcs.length);
    funcs.forEach((fn) => body(fn.nodes));
    body(prog.nodes);
    return { bytes: new Uint8Array(out), opAt };
  }
  const encode = (prog) => encodeMap(prog).bytes;

  function decode(bytes) {
    let p = 0;
    const need = (k) => { if (p + k > bytes.length) throw new Error('programa truncado'); };
    const byte = () => { need(1); return bytes[p++]; };
    const varint = () => { let x = 0, s = 0, b; do { b = byte(); x |= (b & 127) << s; s += 7; } while (b & 128 && s < 35); return x >>> 0; };
    if (bytes[0] !== 0x4e || bytes[1] !== 0x58) throw new Error('no es un programa NEXO');
    p = 2;
    const version = byte();
    if (version !== 1 && version !== 2) throw new Error(`versión ${version} no soportada`);
    const mask = byte();
    const caps = CAPS.filter((_, i) => mask & (1 << i));
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const body = () => {
      const n = varint();
      if (n > LIMITS.nodes) throw new Error('demasiados nodos');
      const nodes = [];
      for (let i = 0; i < n; i++) {
        const op = byte();
        if (!OPS[op]) throw new Error(`opcode ${op} desconocido`);
        const [name, arity, , hasConst] = OPS[op];
        const k = arity < 0 ? varint() : arity;
        const ins = [];
        for (let j = 0; j < k; j++) ins.push(i - varint());
        const node = [name, ins];
        if (hasConst) { need(4); node.push(dv.getFloat32(p, true)); p += 4; }
        nodes.push(node);
      }
      return nodes;
    };
    const funcs = [];
    if (version >= 2) {
      const nf = varint();
      if (nf > LIMITS.funcs) throw new Error('demasiadas funciones');
      for (let i = 0; i < nf; i++) funcs.push({ nodes: body() });
    }
    const prog = { nexo: version, caps, nodes: body() };
    if (funcs.length) prog.funcs = funcs;
    return prog;
  }

  // ---------- ejecución vectorizada (CPU) ----------
  const isArr = (x) => typeof x !== 'number';
  const at = (x, k) => (isArr(x) ? x[k] : x);
  function mapN(args, f) {
    let n = Infinity;
    for (const x of args) if (isArr(x)) n = Math.min(n, x.length);
    if (n === Infinity) return f(...args);
    const o = new Float64Array(n);
    if (args.length === 1) { const a = args[0]; for (let k = 0; k < n; k++) o[k] = f(a[k]); }
    else if (args.length === 2) { const [a, b] = args; for (let k = 0; k < n; k++) o[k] = f(at(a, k), at(b, k)); }
    else { const [a, b, c] = args; for (let k = 0; k < n; k++) o[k] = f(at(a, k), at(b, k), at(c, k)); }
    return o;
  }
  const fr = (x) => x - Math.floor(x);
  const NUM = {
    add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b,
    div: (a, b) => (b === 0 ? 0 : a / b), mod: (a, b) => (b === 0 ? 0 : a - b * Math.floor(a / b)),
    min: Math.min, max: Math.max, pow: (a, b) => Math.pow(Math.abs(a), b),
    sin: Math.sin, cos: Math.cos, abs: Math.abs, sqrt: (a) => Math.sqrt(Math.abs(a)),
    fract: fr, hash: (a) => fr(Math.sin(a * 12.9898 + 78.233) * 43758.5453),
    lt: (a, b) => (a < b ? 1 : 0), gt: (a, b) => (a > b ? 1 : 0), floor: Math.floor,
    select: (c, a, b) => (c > 0 ? a : b), mix: (a, b, t) => a + (b - a) * t,
    atan2: Math.atan2, exp: Math.exp,
  };
  function reduce(name, a) {
    if (!isArr(a)) return name === 'count' ? 1 : a;
    if (name === 'count') return a.length;
    if (a.length === 0) return 0;
    let r = name === 'sum' ? 0 : a[0];
    for (let k = 0; k < a.length; k++) r = name === 'sum' ? r + a[k] : name === 'vmin' ? Math.min(r, a[k]) : Math.max(r, a[k]);
    return r;
  }
  const toVec = (x) => (x === undefined ? new Float64Array(0) : typeof x === 'number' ? Float64Array.of(x) : Float64Array.from(x));

  function compile(prog, opts = {}) {
    const plan = verify(prog);
    if (!plan.ok) throw new Error(plan.errors.join('\n'));
    const nodes = plan.flat, n = nodes.length, shape = plan.shape;
    const inputs = opts.inputs || [];
    const vals = new Array(n);
    const prevStore = new Map();
    const prevTargets = [...new Set(nodes.filter((nd) => nd[0] === 'prev').map((nd) => nd[2]))];
    const shaders = {};
    nodes.forEach((nd, i) => { if (nd[0] === 'shade') shaders[i] = glsl(nodes, shape, i); });
    let T = 0, DT = 1 / 60, F = 0;

    const evalNode = (i) => {
      const [name, ins, c] = nodes[i];
      const a = ins.map((r) => vals[r]);
      switch (name) {
        case 'const': return c;
        case 'time': return T;
        case 'frame': return F;
        case 'dt': return DT;
        case 'range': { const o = new Float64Array(c); for (let k = 0; k < c; k++) o[k] = k; return o; }
        case 'input': return toVec(inputs[c]);
        case 'prev': return prevStore.has(c) ? prevStore.get(c) : 0;
        case 'sum': case 'vmin': case 'vmax': case 'count': return reduce(name, a[0]);
        case 'scan': {
          if (!isArr(a[0])) return a[0];
          const o = new Float64Array(a[0].length); let acc = 0;
          for (let k = 0; k < o.length; k++) { acc += a[0][k]; o[k] = acc; }
          return o;
        }
        case 'gather': {
          const v = a[0];
          if (!isArr(v)) return mapN([a[1]], () => v);
          const m = v.length;
          return mapN([a[1]], (x) => (m ? v[((Math.floor(x) % m) + m) % m] : 0));
        }
        case 'pack': return Float64Array.from(a);
        case 'circle': return [{ kind: 'c', a }];
        case 'line': return [{ kind: 'l', a }];
        case 'layer': return a.flat();
        case 'shade': {
          const s = shaders[i];
          return [{ kind: 'f', src: s.src, u: Float32Array.from(s.uniforms.map((r) => vals[r])) }];
        }
        default: return mapN(a, NUM[name]);
      }
    };

    for (let i = 0; i < n; i++) if (!plan.dyn[i] && shape[i] !== 'p') vals[i] = evalNode(i);
    const dynIdx = [];
    for (let i = 0; i < n; i++) if (plan.dyn[i] && shape[i] !== 'p') dynIdx.push(i);

    return {
      plan, shaders,
      frame(t, dt = 1 / 60) {
        T = t; DT = dt;
        for (const i of dynIdx) vals[i] = evalNode(i);
        for (const tg of prevTargets) prevStore.set(tg, vals[tg]);
        F++;
        return vals[n - 1];
      },
      run(steps, dt = 1 / 60) {
        let out;
        for (let k = 0; k < steps; k++) out = this.frame(k * dt, dt);
        return out;
      },
    };
  }

  // ---------- GPU: campos por píxel → GLSL ----------
  const GL = {
    add: (a, b) => `(${a}+${b})`, sub: (a, b) => `(${a}-${b})`, mul: (a, b) => `(${a}*${b})`,
    div: (a, b) => `dv(${a},${b})`, mod: (a, b) => `md(${a},${b})`,
    sin: (a) => `sin(${a})`, cos: (a) => `cos(${a})`, abs: (a) => `abs(${a})`, sqrt: (a) => `sqrt(abs(${a}))`,
    min: (a, b) => `min(${a},${b})`, max: (a, b) => `max(${a},${b})`, pow: (a, b) => `pow(abs(${a}),${b})`,
    fract: (a) => `fract(${a})`, hash: (a) => `hsh(${a})`,
    lt: (a, b) => `(${a}<${b}?1.0:0.0)`, gt: (a, b) => `(${a}>${b}?1.0:0.0)`, floor: (a) => `floor(${a})`,
    select: (c, a, b) => `(${c}>0.0?${a}:${b})`, mix: (a, b, t) => `(${a}+(${b}-${a})*${t})`,
    atan2: (a, b) => `atan(${a},${b})`, exp: (a) => `exp(${a})`,
    px: () => 'PX', py: () => 'PY',
  };
  const lit = (x) => {
    let s = Number.isInteger(x) && Math.abs(x) < 1e15 ? x.toFixed(1) : String(x);
    if (!/[.e]/.test(s)) s += '.0';
    return x < 0 ? `(${s})` : s;
  };
  function glsl(nodes, shape, root) {
    const need = new Set();
    const visit = (i) => { if (need.has(i)) return; need.add(i); if (shape[i] === 'p') nodes[i][1].forEach(visit); };
    nodes[root][1].forEach(visit);
    const uniforms = [], uidx = new Map();
    const ref = (r) => {
      if (shape[r] === 'p') return 'n' + r;
      if (nodes[r][0] === 'const') return lit(nodes[r][2]);
      if (!uidx.has(r)) { uidx.set(r, uniforms.length); uniforms.push(r); }
      return `u[${uidx.get(r)}]`;
    };
    const lines = [];
    for (const i of [...need].sort((a, b) => a - b)) {
      if (shape[i] !== 'p') continue;
      const [name, ins] = nodes[i];
      lines.push(`float n${i}=${GL[name](...ins.map(ref))};`);
    }
    const [h, l, al] = nodes[root][1].map(ref);
    if (uniforms.length > LIMITS.uniforms) throw new Error('demasiados valores enviados a la GPU');
    const src = [
      'precision highp float;',
      'uniform vec2 res;',
      `uniform float u[${Math.max(1, uniforms.length)}];`,
      'float dv(float a,float b){return b==0.0?0.0:a/b;}',
      'float md(float a,float b){return b==0.0?0.0:a-b*floor(a/b);}',
      'float hsh(float a){return fract(sin(a*12.9898+78.233)*43758.5453);}',
      'vec3 hsl(float h,float s,float l){vec3 k=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);return l+s*(k-0.5)*(1.0-abs(2.0*l-1.0));}',
      'void main(){',
      'float sc=min(res.x,res.y)*0.5;',
      'float PX=(gl_FragCoord.x-res.x*0.5)/sc;',
      'float PY=(res.y*0.5-gl_FragCoord.y)/sc;',
      ...lines,
      `float A=clamp(${al},0.0,1.0);`,
      `gl_FragColor=vec4(hsl(fract(${h}),0.85,clamp(${l},0.0,1.0))*A,A);`,
      '}',
    ].join('\n');
    return { src, uniforms };
  }

  // Renderizador WebGL para los campos (solo en navegador).
  function createFieldRenderer(scale = 0.5) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const cache = new Map();
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = (src) => {
      if (cache.has(src)) return cache.get(src);
      let e = null;
      try {
        const p = gl.createProgram();
        gl.attachShader(p, shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));
        gl.attachShader(p, shader(gl.FRAGMENT_SHADER, src));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        e = { p, loc: gl.getAttribLocation(p, 'p'), u: gl.getUniformLocation(p, 'u'), res: gl.getUniformLocation(p, 'res') };
      } catch (err) { console.warn('NEXO shader:', err); }
      cache.set(src, e);
      return e;
    };
    return {
      draw(d, w, h) {
        const e = program(d.src);
        if (!e) return null;
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        gl.viewport(0, 0, cw, ch);
        gl.useProgram(e.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(e.loc);
        gl.vertexAttribPointer(e.loc, 2, gl.FLOAT, false, 0, 0);
        if (e.u && d.u.length) gl.uniform1fv(e.u, d.u);
        gl.uniform2f(e.res, cw, ch);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return canvas;
      },
    };
  }

  // Dibuja una lista de primitivas en un canvas 2D. Espacio: -1..1, origen centro.
  function render(ctx, draws, w, h, field) {
    const s = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    let count = 0;
    if (!Array.isArray(draws)) return 0;
    for (const d of draws) {
      if (d.kind === 'f') {
        const c = field && field.draw(d, w, h);
        if (c) {
          const op = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(c, 0, 0, w, h);
          ctx.globalCompositeOperation = op;
          count++;
        }
        continue;
      }
      let n = Infinity;
      for (const x of d.a) if (isArr(x)) n = Math.min(n, x.length);
      if (n === Infinity) n = 1;
      const hi = d.kind === 'c' ? 3 : 4;
      for (let k = 0; k < n; k++) {
        const v = d.a.map((x) => at(x, k));
        if (!v.every(Number.isFinite)) continue;
        const color = `hsla(${fr(v[hi]) * 360},85%,62%,${Math.max(0, Math.min(1, v[hi + 1]))})`;
        if (d.kind === 'c') {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx + v[0] * s, cy + v[1] * s, Math.abs(v[2]) * s, 0, 6.2832);
          ctx.fill();
        } else {
          ctx.strokeStyle = color;
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

  const Nexo = { OPS, CAPS, VERSION, LIMITS, expand, verify, encode, encodeMap, decode, compile, glsl, render, createFieldRenderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = Nexo;
  else root.Nexo = Nexo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
