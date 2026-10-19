// Genera los programas de ejemplo en JSON (andamio) y en binario (.nx).
// Uso: node examples/generate.js
const fs = require('fs');
const path = require('path');
const Nexo = require('../src/nexo');
const { graph } = require('../src/builder');

const TAU = 6.283185;
const programs = {};

// ---------- Visuales ----------

// Girasol: filotaxis con el ángulo áureo y un pulso que viaja hacia fuera.
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

// Hilos: arte de hilos entre dos curvas de Lissajous.
{
  const g = graph(), t = g.time(), N = 360;
  const i = g.range(N), p = g.mul(g.div(i, N), TAU);
  const x1 = g.mul(g.cos(g.add(g.mul(p, 3), g.mul(t, 0.4))), 0.92);
  const y1 = g.mul(g.sin(g.add(g.mul(p, 2), g.mul(t, 0.3))), 0.92);
  const x2 = g.mul(g.cos(g.sub(g.mul(p, 5), g.mul(t, 0.5))), 0.5);
  const y2 = g.mul(g.sin(g.sub(g.mul(p, 4), g.mul(t, 0.2))), 0.5);
  g.line(x1, y1, x2, y2, g.add(g.div(i, N), g.mul(t, 0.05)), 0.35);
  programs.hilos = g.build();
}

// Nebulosa: 1500 estrellas en un disco espiral con parpadeo y núcleo.
{
  const g = graph(), t = g.time(), N = 1500;
  const i = g.range(N);
  const h1 = g.hash(i), h2 = g.hash(g.add(i, 17.3)), h3 = g.hash(g.add(i, 51.7));
  const rad = g.mul(g.pow(h1, 0.6), 0.95);
  const speed = g.mul(g.sub(1.2, rad), 0.6);
  const ang = g.add(g.add(g.mul(h2, TAU), g.mul(t, speed)), g.mul(rad, 4));
  const twinkle = g.add(g.mul(g.sin(g.add(g.mul(t, 3), g.mul(h3, 40))), 0.5), 0.5);
  const stars = g.circle(
    g.mul(g.cos(ang), rad), g.mul(g.mul(g.sin(ang), rad), 0.55),
    g.add(0.002, g.mul(h3, 0.006)), g.add(0.55, g.mul(rad, 0.35)), g.add(0.15, g.mul(twinkle, 0.6)),
  );
  const core = g.circle(0, 0, g.add(0.07, g.mul(g.sin(g.mul(t, 1.5)), 0.01)), 0.08, 0.35);
  g.layer(core, stars);
  programs.nebulosa = g.build();
}

// Partículas: 700 partículas con memoria (posición y velocidad) que orbitan
// un atractor en movimiento. Usa estado, funciones, condicionales y reducciones.
{
  const SWIRL = 0.35, DAMP = 0.985; // giro alrededor del atractor y rozamiento
  const g = graph(), t = g.time(), f = g.frame(), dt = g.dt(), N = 700;
  const i = g.range(N), h = g.hash(i);
  const len = g.func(2, (s, a, b) => s.sqrt(s.add(s.mul(a, a), s.mul(b, b))));
  const pulse = g.func(2, (s, a, b) => s.add(s.mul(s.sin(s.mul(a, b)), 0.5), 0.5));
  const x = g.state(), y = g.state(), vx = g.state(), vy = g.state();
  const first = g.lt(f, 0.5);
  const ax = g.mul(g.sin(g.mul(t, 0.7)), 0.55), ay = g.mul(g.sin(g.mul(t, 1.4)), 0.3);
  const dx = g.sub(ax, x), dy = g.sub(ay, y);
  const d = g.add(g.call(len, dx, dy), 0.12);
  const inv = g.div(g.add(1.2, g.mul(h, 1.5)), d);
  const ux = g.add(g.mul(dx, inv), g.mul(g.mul(dy, -SWIRL), inv));
  const uy = g.add(g.mul(dy, inv), g.mul(g.mul(dx, SWIRL), inv));
  const nvx = g.select(first, g.mul(g.sub(g.hash(g.add(i, 3)), 0.5), 0.6), g.mul(g.add(vx, g.mul(ux, dt)), DAMP));
  const nvy = g.select(first, g.mul(g.sub(g.hash(g.add(i, 9)), 0.5), 0.6), g.mul(g.add(vy, g.mul(uy, dt)), DAMP));
  const nx = g.select(first, g.mul(g.sub(g.mul(h, 2), 1), 0.9), g.add(x, g.mul(nvx, dt)));
  const ny = g.select(first, g.mul(g.sub(g.mul(g.hash(g.add(i, 7.1)), 2), 1), 0.9), g.add(y, g.mul(nvy, dt)));
  vx.set(nvx); vy.set(nvy); x.set(nx); y.set(ny);
  const speed = g.call(len, nvx, nvy);
  const parts = g.circle(nx, ny, 0.006, g.add(0.55, g.mul(g.min(speed, 1.5), 0.3)),
    g.add(0.3, g.mul(g.call(pulse, g.add(t, g.mul(h, 10)), 2), 0.5)));
  const cx = g.div(g.sum(nx), g.count(nx)), cy = g.div(g.sum(ny), g.count(ny));
  const centroid = g.circle(cx, cy, 0.025, 0.12, 0.9);
  const attractor = g.circle(ax, ay, 0.012, 0.0, 0.6);
  g.layer(parts, attractor, centroid);
  programs.particulas = g.build();
}

// Aurora: un campo calculado píxel a píxel en la GPU y un cielo de estrellas.
{
  const g = graph(), t = g.time(), px = g.px(), py = g.py();
  const wave = g.func(3, (s, a, freq, phase) => s.sin(s.add(s.mul(a, freq), phase)));
  const v = g.add(g.add(
    g.call(wave, px, 3, g.mul(t, 0.6)),
    g.mul(g.call(wave, py, 4.3, g.mul(t, -0.4)), 0.6)),
    g.mul(g.call(wave, g.add(px, py), 2.1, g.mul(t, 0.3)), 0.5));
  const curtain = g.sub(py, g.mul(g.call(wave, px, 2, g.mul(t, 0.5)), 0.25));
  const band = g.exp(g.mul(g.mul(curtain, curtain), -6));
  const sky = g.shade(
    g.fract(g.add(g.add(0.38, g.mul(v, 0.08)), g.mul(t, 0.01))),
    g.add(g.add(0.04, g.mul(band, 0.42)), g.mul(v, 0.03)),
    1,
  );
  const N = 400, i = g.range(N);
  const tw = g.add(g.mul(g.sin(g.add(g.mul(t, 2), g.mul(g.hash(g.add(i, 2)), 30))), 0.3), 0.4);
  const stars = g.circle(g.sub(g.mul(g.hash(i), 2), 1), g.sub(g.mul(g.hash(g.add(i, 0.37)), 2), 1),
    g.add(0.002, g.mul(g.hash(g.add(i, 5)), 0.004)), 0.6, tw);
  g.layer(sky, stars);
  programs.aurora = g.build();
}

// ---------- Cálculo ----------

// π por Montecarlo: 20.000 puntos aleatorios, cuántos caen dentro del círculo.
{
  const g = graph([]), N = 20000, i = g.range(N);
  const x = g.sub(g.mul(g.hash(i), 2), 1);
  const y = g.sub(g.mul(g.hash(g.add(g.mul(g.hash(i), 1000), g.mul(i, 0.37))), 2), 1);
  const inside = g.lt(g.add(g.mul(x, x), g.mul(y, y)), 1);
  g.mul(g.div(g.sum(inside), g.count(inside)), 4);
  programs.pi = g.build();
}

// Estadística de unos datos de entrada: [media, desviación típica, mínimo, máximo].
{
  const g = graph(['input']), d = g.input(0), n = g.count(d);
  const mean = g.div(g.sum(d), n);
  const dev = g.sub(d, mean);
  const sd = g.sqrt(g.div(g.sum(g.mul(dev, dev)), n));
  g.pack(mean, sd, g.vmin(d), g.vmax(d));
  programs.estadistica = g.build();
}

// Trayectoria de un proyectil con rozamiento del aire, paso a paso.
// Devuelve [alcance (m), tiempo de vuelo (s), altura máxima (m)].
{
  const g = graph([]), f = g.frame(), dt = g.dt(), first = g.lt(f, 0.5);
  const V0 = 20, ANG = Math.PI / 4, DRAG = 0.02, GRAV = 9.81;
  const x = g.state(), y = g.state(), vx = g.state(), vy = g.state();
  const range = g.state(), flight = g.state(), top = g.state();
  const v = g.sqrt(g.add(g.mul(vx, vx), g.mul(vy, vy)));
  const nvx = g.select(first, V0 * Math.cos(ANG), g.sub(vx, g.mul(g.mul(g.mul(vx, v), DRAG), dt)));
  const nvy = g.select(first, V0 * Math.sin(ANG), g.sub(vy, g.mul(g.add(GRAV, g.mul(g.mul(vy, v), DRAG)), dt)));
  const nx = g.select(first, 0, g.add(x, g.mul(nvx, dt)));
  const ny = g.select(first, 0, g.add(y, g.mul(nvy, dt)));
  const landed = g.mul(g.lt(ny, 0), g.lt(range, 0.0001));
  const nRange = g.select(first, 0, g.select(landed, nx, range));
  const nFlight = g.select(first, 0, g.select(landed, g.mul(f, dt), flight));
  const nTop = g.select(first, 0, g.max(top, ny));
  x.set(nx); y.set(ny); vx.set(nvx); vy.set(nvy);
  range.set(nRange); flight.set(nFlight); top.set(nTop);
  g.pack(nRange, nFlight, nTop);
  programs.trayectoria = g.build();
}

const dir = __dirname;
for (const [name, prog] of Object.entries(programs)) {
  const v = Nexo.verify(prog);
  if (!v.ok) throw new Error(`${name}: ${v.errors.join(', ')}`);
  const bytes = Nexo.encode(prog);
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(prog));
  fs.writeFileSync(path.join(dir, `${name}.nx`), bytes);
  console.log(`${name.padEnd(12)} ${String(v.flat.length).padStart(4)} nodos  ${String(v.levels).padStart(3)} niveles  ` +
    `${String(v.staticCount).padStart(4)} precalculados  ${String(bytes.length).padStart(4)} bytes  → ${v.output}`);
}
