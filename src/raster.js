/*
 * Rasterizador en CPU y codificador PNG sin dependencias.
 *
 * Sirve para que una IA vea lo que ha dibujado sin navegador: se ejecuta un
 * fotograma, se rasteriza y se devuelve una imagen PNG. Los campos por píxel
 * (`shade`) se evalúan en la CPU con el mismo grafo que en la GPU.
 */
const zlib = require('zlib');
const Nexo = require('./nexo');

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fract = (x) => x - Math.floor(x);
const at = (x, k) => (typeof x === 'number' ? x : x[k]);
const lengthOf = (arr) => { let n = Infinity; for (const x of arr) if (typeof x !== 'number') n = Math.min(n, x.length); return n === Infinity ? 1 : n; };

// Devuelve un Float32Array RGB (0..1) de w×h.
function rasterize(draws, w, h, background = [5 / 255, 6 / 255, 12 / 255]) {
  const img = new Float32Array(w * h * 3);
  for (let k = 0; k < w * h; k++) img.set(background, k * 3);
  const s = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
  const add = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 3;
    img[o] += rgb[0] * a; img[o + 1] += rgb[1] * a; img[o + 2] += rgb[2] * a;
  };
  let PX = null, PY = null;
  for (const d of draws || []) {
    if (d.kind === 'f') {
      if (!d.eval) continue;
      if (!PX) {
        PX = new Float64Array(w * h); PY = new Float64Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { PX[y * w + x] = (x + 0.5 - cx) / s; PY[y * w + x] = (y + 0.5 - cy) / s; }
      }
      const [H, L, A] = d.eval(PX, PY);
      for (let k = 0; k < w * h; k++) {
        const a = clamp01(at(A, k));
        const rgb = Nexo.hsl(fract(at(H, k)), 0.85, clamp01(at(L, k)));
        const o = k * 3;
        for (let c = 0; c < 3; c++) img[o + c] = rgb[c] * a + img[o + c] * (1 - a);
      }
      continue;
    }
    const n = lengthOf(d.a), hi = d.kind === 'c' ? 3 : 4;
    for (let k = 0; k < n; k++) {
      const v = d.a.map((x) => at(x, k));
      if (!v.every(Number.isFinite)) continue;
      const rgb = Nexo.hsl(fract(v[hi]), 0.85, 0.62), alpha = clamp01(v[hi + 1]);
      if (d.kind === 'c') {
        const px = cx + v[0] * s, py = cy + v[1] * s, r = Math.max(0.5, Math.abs(v[2]) * s);
        for (let y = Math.floor(py - r - 1); y <= Math.ceil(py + r + 1); y++) {
          for (let x = Math.floor(px - r - 1); x <= Math.ceil(px + r + 1); x++) {
            const dist = Math.hypot(x + 0.5 - px, y + 0.5 - py);
            const cov = clamp01(r + 0.5 - dist);
            if (cov > 0) add(x, y, rgb, alpha * cov);
          }
        }
      } else {
        const x1 = cx + v[0] * s, y1 = cy + v[1] * s, x2 = cx + v[2] * s, y2 = cy + v[3] * s;
        const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          add(Math.floor(x1 + (x2 - x1) * t), Math.floor(y1 + (y2 - y1) * t), rgb, alpha);
        }
      }
    }
  }
  return img;
}

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function toPNG(img, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = Math.round(clamp01(img[y * w * 3 + x]) * 255);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Atajo: ejecuta un programa hasta el instante t y devuelve un PNG.
function renderPNG(prog, opts = {}) {
  const size = Math.min(1024, Math.max(32, opts.size || 512));
  const c = Nexo.compile(prog, { inputs: opts.inputs });
  const dt = opts.dt ?? 1 / 60, t = opts.t ?? 1;
  const steps = Math.max(1, Math.round(opts.steps ?? t / dt));
  const out = c.run(steps, dt);
  if (c.plan.output !== 'draw') throw new Error('el programa no dibuja; usa run para obtener números');
  return toPNG(rasterize(out, size, size), size, size);
}

module.exports = { rasterize, toPNG, renderPNG };
