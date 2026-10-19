#!/usr/bin/env node
// Línea de comandos de NEXO.
const fs = require('fs');
const path = require('path');
const Nexo = require('../src/nexo');
const Evolve = require('../src/evolve');

const HELP = `nexo — herramientas para programas NEXO

  nexo run <programa> [--steps N] [--dt X] [--input ranura=archivo.json]
      Ejecuta un programa (.nx o .json). Con --steps simula N pasos.
      Los archivos de entrada pueden ser un array o {"valores": [...]}.
  nexo inspect <programa>     Muestra el grafo expandido para depurar.
  nexo encode <in.json> <out.nx>
  nexo decode <in.nx> <out.json>
  nexo evolve [--gens 30] [--seed 1] [--out mejor.nx]
      Deja que la IA evolucione un programa visual nuevo.`;

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name, def) => {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === `--${name}`) out.push(args[i + 1]);
  return out.length ? out : def;
};
const load = (file) => {
  const buf = fs.readFileSync(file);
  return file.endsWith('.nx') ? Nexo.decode(new Uint8Array(buf)) : JSON.parse(buf.toString());
};
const fmt = (v) => (typeof v === 'number' ? +v.toFixed(6) : Array.from(v, (x) => +x.toFixed(6)));

try {
  switch (cmd) {
    case 'run': {
      const prog = load(args[0]);
      const inputs = [];
      for (const spec of flag('input', [])) {
        const [slot, file] = spec.split('=');
        const data = JSON.parse(fs.readFileSync(file));
        inputs[+slot] = Array.isArray(data) ? data : data.valores;
      }
      const c = Nexo.compile(prog, { inputs });
      const steps = +flag('steps', ['1'])[0], dt = +flag('dt', [String(1 / 60)])[0];
      const out = c.run(steps, dt);
      if (c.plan.output === 'draw') {
        const n = out.reduce((s, d) => s + (d.kind === 'f' ? 1 : Math.max(1, ...d.a.map((x) => (typeof x === 'number' ? 1 : x.length)))), 0);
        console.log(`dibujo: ${out.length} capas, ${n} primitivas`);
      } else console.log(JSON.stringify(fmt(out)));
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
    case 'evolve': {
      const gens = +flag('gens', ['30'])[0], seed = +flag('seed', ['1'])[0];
      const ev = Evolve.create({ seed });
      for (let k = 0; k < gens; k++) {
        const r = ev.step();
        if (k % 5 === 4 || k === gens - 1) console.log(`generación ${r.generation}: nota ${r.score}`);
      }
      const out = flag('out', ['evolucionado.nx'])[0];
      const prog = Evolve.toProgram(ev.best().g);
      fs.writeFileSync(out, out.endsWith('.json') ? JSON.stringify(prog) : Nexo.encode(prog));
      console.log(`guardado en ${path.resolve(out)}`);
      break;
    }
    default: console.log(HELP);
  }
} catch (e) {
  console.error('error:', e.message);
  process.exit(1);
}
