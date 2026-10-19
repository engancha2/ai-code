#!/usr/bin/env node
/*
 * Servidor MCP de NEXO: permite que cualquier IA compatible con el Model
 * Context Protocol (Claude, por ejemplo) escriba, verifique, ejecute, vea y
 * haga aprender programas NEXO.
 *
 * Transporte: JSON-RPC 2.0 por stdio, un mensaje por línea. Sin dependencias.
 *
 *   Claude Code:     claude mcp add nexo -- node /ruta/a/ai-code/bin/nexo-mcp.js
 *   Claude Desktop:  "mcpServers": { "nexo": { "command": "node",
 *                      "args": ["/ruta/a/ai-code/bin/nexo-mcp.js"] } }
 */
const readline = require('readline');
const Nexo = require('../src/nexo');
const Evolve = require('../src/evolve');
const Synth = require('../src/synth');
const Raster = require('../src/raster');
const VERSION = require('../package.json').version;

// ---------- utilidades ----------
const programProp = {
  program: { type: 'object', description: 'Programa NEXO como grafo JSON: {"nexo":2,"caps":[...],"funcs":[...],"nodes":[[op,[entradas],constante?],...]}' },
  nx: { type: 'string', description: 'Alternativa a program: el binario NEXO en base64.' },
};
const inputsProp = { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Datos de entrada por ranura (input 0, input 1, …).' };

function getProgram(args) {
  if (args.program) return typeof args.program === 'string' ? JSON.parse(args.program) : args.program;
  if (args.nx) return Nexo.decode(new Uint8Array(Buffer.from(args.nx, 'base64')));
  throw new Error('falta program (JSON) o nx (base64)');
}
const b64 = (prog) => Buffer.from(Nexo.encode(prog)).toString('base64');
const text = (t) => ({ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) });
const image = (png) => ({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
const round = (v) => (typeof v === 'number' ? +v.toPrecision(8) : Array.from(v, (x) => +x.toPrecision(8)));

// Descripción del lenguaje legible por máquinas: así una IA lo aprende de la propia herramienta.
function spec() {
  return {
    language: 'NEXO', version: VERSION,
    model: 'Un programa es un grafo. Cada nodo es [op, [entradas], constante?]. Las entradas son índices de nodos ANTERIORES del mismo cuerpo. La salida es el último nodo. Todo valor es escalar o vector (operaciones elemento a elemento, difusión de escalares).',
    program: '{"nexo":2,"caps":["draw"|"input"],"funcs":[{"nodes":[...]}],"nodes":[...]}',
    rules: [
      'Una función solo puede llamar a funciones con índice menor (sin recursión). Dentro: arg (constante = índice del argumento). Para llamar: ["call",[args...],índiceFunción].',
      'prev (constante = índice de un nodo del cuerpo principal) devuelve su valor en el fotograma anterior (0 en el primero). Es la única referencia hacia delante.',
      'param (constante = valor inicial) es una constante aprendible; loss marca un valor a minimizar. nexo_learn ajusta los param por gradiente.',
      'Formas: escalar, vector o píxel. px/py son píxel y solo pueden acabar en shade. No se mezclan vectores y píxeles.',
      'Dibujo: espacio de -1 a 1, origen en el centro, y hacia abajo. Tono en [0,1). circle/line/shade/layer requieren la capacidad "draw"; input requiere "input".',
      'param y prev no están permitidos dentro de funciones.',
    ],
    ops: Nexo.OPS.map(([name, arity, out, hasConst, cap]) => ({ op: name, inputs: arity < 0 ? 'variable' : arity, output: out, constant: hasConst, capability: cap || undefined })),
    example: {
      description: 'Espiral de 400 puntos que gira con el tiempo',
      program: { nexo: 2, caps: ['draw'], nodes: [['range', [], 400], ['const', [], 400], ['div', [0, 1]], ['time', []], ['const', [], 20], ['mul', [2, 4]], ['add', [5, 3]], ['cos', [6]], ['mul', [7, 2]], ['sin', [6]], ['mul', [9, 2]], ['const', [], 0.01], ['const', [], 0.8], ['circle', [8, 10, 11, 2, 12]]] },
    },
  };
}

// ---------- herramientas ----------
const TOOLS = [
  {
    name: 'nexo_spec',
    description: 'Devuelve la especificación de NEXO (operaciones, reglas y un ejemplo) en JSON. Llámala primero para aprender el lenguaje.',
    inputSchema: { type: 'object', properties: {} },
    run: () => [text(spec())],
  },
  {
    name: 'nexo_verify',
    description: 'Verifica un programa NEXO sin ejecutarlo: errores, número de nodos, niveles paralelos, tipo de salida y su binario en base64.',
    inputSchema: { type: 'object', properties: { ...programProp } },
    run: (a) => {
      const prog = getProgram(a), v = Nexo.verify(prog);
      if (!v.ok) return [text({ ok: false, errors: v.errors })];
      return [text({ ok: true, nodes: v.flat.length, levels: v.levels, precomputed: v.staticCount, output: v.output, bytes: Nexo.encode(prog).length, nx: b64(prog) })];
    },
  },
  {
    name: 'nexo_run',
    description: 'Ejecuta un programa NEXO. Si calcula números, los devuelve. Si dibuja, devuelve una imagen PNG del fotograma en el instante t para que puedas VER el resultado.',
    inputSchema: {
      type: 'object',
      properties: {
        ...programProp, inputs: inputsProp,
        steps: { type: 'integer', description: 'Pasos de simulación (por defecto 1, o t/dt si dibuja).' },
        dt: { type: 'number', description: 'Paso de tiempo (por defecto 1/60).' },
        t: { type: 'number', description: 'Instante a dibujar en segundos (por defecto 1).' },
        size: { type: 'integer', description: 'Lado de la imagen en píxeles (por defecto 384, máximo 1024).' },
      },
    },
    run: (a) => {
      const prog = getProgram(a);
      const c = Nexo.compile(prog, { inputs: a.inputs });
      if (c.plan.output === 'draw') {
        const png = Raster.renderPNG(prog, { inputs: a.inputs, t: a.t ?? 1, dt: a.dt, steps: a.steps, size: a.size || 384 });
        return [text(`Fotograma en t = ${a.t ?? 1} s · ${c.plan.flat.length} nodos`), image(png)];
      }
      const out = c.run(a.steps || 1, a.dt ?? 1 / 60);
      const res = { result: round(out) };
      if (c.lossIds.length) res.loss = c.lossValue();
      return [text(res)];
    },
  },
  {
    name: 'nexo_learn',
    description: 'Hace aprender a un programa: ajusta sus param por descenso de gradiente (diferenciación automática) para minimizar sus loss. Devuelve el programa con los valores aprendidos.',
    inputSchema: {
      type: 'object',
      properties: {
        ...programProp, inputs: inputsProp,
        steps: { type: 'integer', description: 'Pasos de optimización (por defecto 300).' },
        lr: { type: 'number', description: 'Tasa de aprendizaje de Adam (por defecto 0.05).' },
      },
    },
    run: (a) => {
      const res = Nexo.learn(getProgram(a), { inputs: a.inputs, steps: Math.min(a.steps || 300, 20000), lr: a.lr ?? 0.05 });
      const params = res.program.nodes.map((n, i) => (n[0] === 'param' ? { node: i, value: +n[2].toPrecision(6) } : null)).filter(Boolean);
      const out = [text({ lossStart: res.history[0], lossEnd: res.loss, steps: res.history.length, params, program: res.program })];
      if (Nexo.verify(res.program).output === 'draw') out.push(image(Raster.renderPNG(res.program, { inputs: a.inputs, size: 384 })));
      return out;
    },
  },
  {
    name: 'nexo_synthesize',
    description: 'Descubre una fórmula y = f(x) que explica unos datos: la estructura se busca por evolución y las constantes por gradiente. Devuelve la fórmula legible y el programa NEXO.',
    inputSchema: {
      type: 'object', required: ['x', 'y'],
      properties: {
        x: { type: 'array', items: { type: 'number' } },
        y: { type: 'array', items: { type: 'number' } },
        generations: { type: 'integer', description: 'Máximo de generaciones (por defecto 80).' },
        seed: { type: 'integer' },
      },
    },
    run: (a) => {
      if (!Array.isArray(a.x) || a.x.length !== (a.y || []).length || a.x.length < 3) throw new Error('x e y deben ser arrays de la misma longitud (mínimo 3)');
      const res = Synth.synthesize({ x: a.x, y: a.y }, { generations: Math.min(a.generations || 80, 300), seed: a.seed ?? 1 });
      return [text({ formula: `y = ${res.formula}`, mse: res.mse, size: res.size, generations: res.generations, program: res.program })];
    },
  },
  {
    name: 'nexo_evolve',
    description: 'Evoluciona desde cero un programa visual NEXO (sin intervención) y devuelve el mejor junto con su imagen.',
    inputSchema: {
      type: 'object',
      properties: { generations: { type: 'integer', description: 'Por defecto 40.' }, seed: { type: 'integer' } },
    },
    run: (a) => {
      const ev = Evolve.create({ seed: a.seed ?? 1 });
      for (let k = 0; k < Math.min(a.generations || 40, 300); k++) ev.step();
      const prog = Evolve.toProgram(ev.best().g);
      return [text({ score: ev.best().s, generations: ev.generation, nx: b64(prog), program: prog }), image(Raster.renderPNG(prog, { size: 384 }))];
    },
  },
];

// ---------- JSON-RPC ----------
function reply(id, result, error) {
  process.stdout.write(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }) + '\n');
}

function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return; // notificación
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'nexo', version: VERSION },
        instructions: 'NEXO es un lenguaje de programación para IA: los programas son grafos JSON/binarios. Empieza con nexo_spec, verifica con nexo_verify y mira el resultado con nexo_run.',
      });
    case 'ping': return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return reply(id, null, { code: -32602, message: `herramienta desconocida: ${params.name}` });
      try {
        return reply(id, { content: tool.run(params.arguments || {}) });
      } catch (e) {
        return reply(id, { content: [text(`error: ${e.message}`)], isError: true });
      }
    }
    default:
      return reply(id, null, { code: -32601, message: `método no soportado: ${method}` });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return reply(null, null, { code: -32700, message: 'JSON no válido' }); }
  try { handle(msg); } catch (e) { reply(msg.id ?? null, null, { code: -32603, message: e.message }); }
});
