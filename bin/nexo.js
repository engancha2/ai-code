#!/usr/bin/env node
// Línea de comandos de NEXO.
const fs = require('fs');
const path = require('path');
const Nexo = require('../src/nexo');
const Evolve = require('../src/evolve');
const Synth = require('../src/synth');
const Raster = require('../src/raster');

const HELP = `nexo — herramientas para programas NEXO

  nexo run <programa> [--steps N] [--dt X] [--input ranura=archivo.json[#clave]]
      Ejecuta un programa (.nx o .json). Con --steps simula N pasos.
  nexo render <programa> <salida.png> [--t 1] [--size 512] [--input ...]
      Dibuja el fotograma del instante t en un PNG (sin navegador).
  nexo learn <programa> <salida.json|.nx> [--steps 300] [--lr 0.05] [--input ...]
      Ajusta los param del programa minimizando sus loss.
  nexo synth <datos.json> [--gens 80] [--seed 1] [--out formula.nx]
      Descubre una fórmula y = f(x). datos.json = {"x": [...], "y": [...]}.
  nexo evolve [--gens 30] [--seed 1] [--out mejor.nx]
      Deja que la IA evolucione un programa visual nuevo.
  nexo inspect <programa>     Muestra el grafo expandido para depurar.
  nexo encode <in.json> <out.nx>
  nexo decode <in.nx> <out.json>

  Archivos de entrada: un array, {"valores": [...]}, o cualquier JSON con
  #clave para elegir un campo (p. ej. examples/corazon.json#x).`;

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name, def) => {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === `--${name}`) out.push(args[i + 1]);
  return out.length ? out : def;
};
const num = (name, def) => +flag(name, [String(def)])[0];
const load = (file) => {
  const buf = fs.readFileSync(file);
  return file.endsWith('.nx') ? Nexo.decode(new Uint8Array(buf)) : JSON.parse(buf.toString());
};
const save = (file, prog) => fs.writeFileSync(file, file.endsWith('.nx') ? Nexo.encode(prog) : JSON.stringify(prog));
const inputs = () => {
  const out = [];
  for (const spec of flag('input', [])) {
    const [slot, ref] = spec.split('=');
    const [file, key] = ref.split('#');
    const data = JSON.parse(fs.readFileSync(file));
    out[+slot] = Array.isArray(data) ? data : key ? data[key] : data.valores;
  }
  return out;
};
const fmt = (v) => (typeof v === 'number' ? +v.toFixed(6) : Array.from(v, (x) => +x.toFixed(6)));

try {
  switch (cmd) {
    case 'run': {
      const c = Nexo.compile(load(args[0]), { inputs: inputs() });
      const out = c.run(num('steps', 1), num('dt', 1 / 60));
      if (c.plan.output === 'draw') {
        const n = out.reduce((s, d) => s + (d.kind === 'f' ? 1 : Math.max(1, ...d.a.map((x) => (typeof x === 'number' ? 1 : x.length)))), 0);
        console.log(`dibujo: ${out.length} capas, ${n} primitivas`);
      } else console.log(JSON.stringify(fmt(out)));
      if (c.lossIds.length) console.log(`loss: ${c.lossValue()}`);
      break;
    }
    case 'render': {
      const png = Raster.renderPNG(load(args[0]), { t: num('t', 1), size: num('size', 512), inputs: inputs() });
      fs.writeFileSync(args[1], png);
      console.log(`${args[1]}: ${png.length} bytes`);
      break;
    }
    case 'learn': {
      const res = Nexo.learn(load(args[0]), { inputs: inputs(), steps: num('steps', 300), lr: num('lr', 0.05) });
      save(args[1], res.program);
      console.log(`loss: ${res.history[0]} → ${res.loss}`);
      console.log(`guardado en ${args[1]}`);
      break;
    }
    case 'synth': {
      const data = JSON.parse(fs.readFileSync(args[0]));
      const res = Synth.synthesize(data, {
        generations: num('gens', 80), seed: num('seed', 1),
        onStep: (b, gen) => { if (gen % 10 === 0) console.log(`generación ${gen}: ${b.formula}  (error ${b.mse.toExponential(2)})`); },
      });
      console.log(`\ny = ${res.formula}\nerror cuadrático medio: ${res.mse.toExponential(3)}  ·  ${res.generations} generaciones`);
      const out = flag('out', [null])[0];
      if (out) { save(out, res.program); console.log(`programa guardado en ${out}`); }
      break;
    }
    case 'evolve': {
      const ev = Evolve.create({ seed: num('seed', 1) });
      const gens = num('gens', 30);
      for (let k = 0; k < gens; k++) {
        const r = ev.step();
        if (k % 5 === 4 || k === gens - 1) console.log(`generación ${r.generation}: nota ${r.score}`);
      }
      const out = flag('out', ['evolucionado.nx'])[0];
      save(out, Evolve.toProgram(ev.best().g));
      console.log(`guardado en ${path.resolve(out)}`);
      break;
    }
    case 'inspect': {
      const prog = load(args[0]);
      const v = Nexo.verify(prog);
      if (!v.ok) { console.error(v.errors.join('\n')); process.exit(1); }
      console.log(`# ${v.flat.length} nodos tras expandir ${(prog.funcs || []).length} funciones · ${v.levels} niveles · salida ${v.output}`);
      console.log('# columnas: índice  nivel  forma(s/v/p/d)  dinámico(~)  operación');
      v.flat.forEach((n, i) => {
        const ins = n[1].length ? `(${n[1].map((r) => '#' + r).join(', ')})` : '';
        const c = n.length > 2 ? ' ' + +(+n[2]).toFixed(4) : '';
        console.log(`#${String(i).padEnd(4)} L${String(v.level[i]).padEnd(3)} ${v.shape[i]} ${v.dyn[i] ? '~' : '·'} ${n[0]}${ins}${c}`);
      });
      break;
    }
    case 'encode': fs.writeFileSync(args[1], Nexo.encode(load(args[0]))); console.log(`${args[1]}: ${fs.statSync(args[1]).size} bytes`); break;
    case 'decode': fs.writeFileSync(args[1], JSON.stringify(load(args[0]))); console.log(args[1]); break;
    default: console.log(HELP);
  }
} catch (e) {
  console.error('error:', e.message);
  process.exit(1);
}
