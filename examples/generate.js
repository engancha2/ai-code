// Genera los programas de ejemplo en JSON (andamio) y en binario (.nx).
// Uso: node examples/generate.js
const fs = require('fs');
const path = require('path');
const Nexo = require('../src/nexo');
const { graph } = require('../src/builder');

const TAU = 6.283185;
const programs = {};

// 1. Girasol: filotaxis con el ángulo áureo y un pulso que viaja hacia fuera.
{
  const g = graph(), t = g.time(), N = 900;
  const i = g.range(N), u = g.div(i, N);
  const rad = g.mul(g.sqrt(u), 0.95);
  const a = g.add(g.mul(i, 2.399963), g.mul(t, 0.15));
  const pulse = g.add(g.mul(g.sin(g.sub(g.mul(t, 2), g.mul(rad, 14))), 0.5), 1);
  const r = g.mul(g.add(0.006, g.mul(u, 0.012)), pulse);
  const hue = g.add(g.mul(u, 0.5), g.mul(t, 0.03));
  g.circle(g.mul(g.cos(a), rad), g.mul(g.sin(a), rad), r, hue, 0.75);
  programs.girasol = g.build();
}

// 2. Hilos: arte de hilos entre dos curvas de Lissajous.
{
  const g = graph(), t = g.time(), N = 360;
  const i = g.range(N), p = g.mul(g.div(i, N), TAU);
  const x1 = g.mul(g.cos(g.add(g.mul(p, 3), g.mul(t, 0.4))), 0.92);
  const y1 = g.mul(g.sin(g.add(g.mul(p, 2), g.mul(t, 0.3))), 0.92);
  const x2 = g.mul(g.cos(g.sub(g.mul(p, 5), g.mul(t, 0.5))), 0.5);
  const y2 = g.mul(g.sin(g.sub(g.mul(p, 4), g.mul(t, 0.2))), 0.5);
  const hue = g.add(g.div(i, N), g.mul(t, 0.05));
  g.line(x1, y1, x2, y2, hue, 0.35);
  programs.hilos = g.build();
}

// 3. Nebulosa: 1500 estrellas en un disco espiral con parpadeo y núcleo.
{
  const g = graph(), t = g.time(), N = 1500;
  const i = g.range(N);
  const h1 = g.hash(i), h2 = g.hash(g.add(i, 17.3)), h3 = g.hash(g.add(i, 51.7));
  const rad = g.mul(g.pow(h1, 0.6), 0.95);
  const speed = g.mul(g.sub(1.2, rad), 0.6);
  const ang = g.add(g.add(g.mul(h2, TAU), g.mul(t, speed)), g.mul(rad, 4));
  const twinkle = g.add(g.mul(g.sin(g.add(g.mul(t, 3), g.mul(h3, 40))), 0.5), 0.5);
  const stars = g.circle(
    g.mul(g.cos(ang), rad),
    g.mul(g.mul(g.sin(ang), rad), 0.55),
    g.add(0.002, g.mul(h3, 0.006)),
    g.add(0.55, g.mul(rad, 0.35)),
    g.add(0.15, g.mul(twinkle, 0.6)),
  );
  const core = g.circle(0, 0, g.add(0.07, g.mul(g.sin(g.mul(t, 1.5)), 0.01)), 0.08, 0.35);
  g.layer(core, stars);
  programs.nebulosa = g.build();
}

const dir = __dirname;
for (const [name, prog] of Object.entries(programs)) {
  const v = Nexo.verify(prog);
  if (!v.ok) throw new Error(`${name}: ${v.errors.join(', ')}`);
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(prog));
  fs.writeFileSync(path.join(dir, `${name}.nx`), Nexo.encode(prog));
  console.log(`${name}: ${prog.nodes.length} nodos, ${v.levels} niveles, ` +
    `${v.staticCount} precalculados, ${Nexo.encode(prog).length} bytes`);
}
