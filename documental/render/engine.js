// Motor de dibujo procedural para el documental "La rama humana".
// Todo se dibuja con Canvas 2D a partir de funciones deterministas del tiempo t,
// de modo que cualquier fotograma puede renderizarse de forma independiente.
'use strict';

const W = 1920, H = 1080;

// ---------- utilidades numéricas ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(i, s = 0) { // pseudoaleatorio estable por índice
  let x = Math.imul((i | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(s | 0, 0xC2B2AE35);
  x ^= x >>> 16; x = Math.imul(x, 0x7FEB352D); x ^= x >>> 15; x = Math.imul(x, 0x846CA68B); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function makeNoise(seed) {
  const r = mulberry32(seed); const p = new Float32Array(4096);
  for (let i = 0; i < p.length; i++) p[i] = r();
  return (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return p[i & 4095] * (1 - u) + p[(i + 1) & 4095] * u;
  };
}
function fbm(n, x, oct = 5) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f + i * 17.31); norm += a; a *= 0.5; f *= 2.03; }
  return s / norm;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mixc = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const TAU = Math.PI * 2;

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// envolvente de aparición/desaparición
function fadeInOut(t, a, b, fin = 0.6, fout = 0.6) { return smooth(a, a + fin, t) * (1 - smooth(b - fout, b, t)); }

// ---------- cielo, luz, atmósfera ----------
function skyGradient(g, stops, y0 = 0, y1 = H) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, rgb(c));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function glow(g, x, y, r, c, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgb(c, a)); gr.addColorStop(0.25, rgb(c, a * 0.45));
  gr.addColorStop(0.6, rgb(c, a * 0.12)); gr.addColorStop(1, rgb(c, 0));
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore();
}
function fogBand(g, y0, y1, c, a) { // banda de niebla vertical
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, rgb(c, 0)); gr.addColorStop(0.5, rgb(c, a)); gr.addColorStop(1, rgb(c, 0));
  g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0);
}
function godRays(g, x, y, c, a, t, n = 9, seed = 1) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const ang = Math.PI * 0.25 + (i / n) * Math.PI * 0.55 + 0.03 * Math.sin(t * 0.2 + i);
    const w = 0.02 + 0.03 * hash(i, seed);
    const len = 2600;
    const al = a * (0.4 + 0.6 * hash(i, seed + 3)) * (0.7 + 0.3 * Math.sin(t * 0.5 + i * 2));
    const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    gr.addColorStop(0, rgb(c, al)); gr.addColorStop(1, rgb(c, 0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang - w) * len, y + Math.sin(ang - w) * len);
    g.lineTo(x + Math.cos(ang + w) * len, y + Math.sin(ang + w) * len); g.closePath(); g.fill();
  }
  g.restore();
}
function stars(g, t, seed = 7, n = 900, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const x = hash(i, seed) * W, y = hash(i, seed + 1) * H, m = hash(i, seed + 2);
    const tw = 0.6 + 0.4 * Math.sin(t * (1 + 3 * m) + i);
    g.fillStyle = `rgba(255,${235 + 20 * m | 0},${215 + 40 * m | 0},${alpha * tw * (0.25 + 0.75 * m * m)})`;
    const r = 0.5 + 1.3 * m * m * m;
    g.fillRect(x, y, r * 1.4, r * 1.4);
  }
}

// nube suave pre-renderizada
const _cloudCache = {};
function cloudSprite(seed, w, h, c = [255, 255, 255]) {
  const k = seed + ':' + w + ':' + h + ':' + c.join(',');
  if (_cloudCache[k]) return _cloudCache[k];
  const cv = mkCanvas(w, h), g = cv.getContext('2d'); const r = mulberry32(seed);
  for (let i = 0; i < 90; i++) {
    const u = r(), x = w * (0.08 + 0.84 * u), env = Math.sin(u * Math.PI);
    const y = h * (0.62 - 0.32 * env * r());
    const rad = h * (0.08 + 0.22 * r()) * (0.5 + env);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, rgb(c, 0.1)); gr.addColorStop(0.6, rgb(c, 0.05)); gr.addColorStop(1, rgb(c, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  return (_cloudCache[k] = cv);
}

// ---------- capas de relieve ----------
// Devuelve {c, y(x)} con un perfil de montaña/colina pre-renderizado más ancho que la pantalla.
function ridgeLayer({ w = W * 1.6, h = H, seed = 1, base = 700, amp = 200, freq = 0.004, oct = 5,
  top = [80, 80, 100], bot = [40, 40, 50], sharp = 0, trees = null, rim = null }) {
  const n = makeNoise(seed);
  const ys = new Float32Array(Math.ceil(w / 2) + 2);
  for (let i = 0; i < ys.length; i++) {
    let v = fbm(n, i * 2 * freq, oct);
    if (sharp) v = lerp(v, 1 - Math.abs(2 * fbm(n, i * 2 * freq * 0.7 + 50, oct) - 1), sharp);
    ys[i] = base - v * amp;
  }
  const yAt = (x) => { const i = clamp(x / 2, 0, ys.length - 2); const i0 = Math.floor(i); return lerp(ys[i0], ys[i0 + 1], i - i0); };
  const cv = mkCanvas(w, h), g = cv.getContext('2d');
  let minY = h; for (const y of ys) minY = Math.min(minY, y);
  const gr = g.createLinearGradient(0, minY, 0, h);
  gr.addColorStop(0, rgb(top)); gr.addColorStop(1, rgb(bot));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, h);
  for (let i = 0; i < ys.length; i++) g.lineTo(i * 2, ys[i]);
  g.lineTo(w, h); g.closePath(); g.fill();
  if (rim) { // borde iluminado
    g.strokeStyle = rgb(rim[0], rim[1]); g.lineWidth = rim[2] || 2;
    g.beginPath(); for (let i = 0; i < ys.length; i++) g.lineTo(i * 2, ys[i] + 1); g.stroke();
  }
  if (trees) {
    const r = mulberry32(seed + 99);
    g.fillStyle = gr;
    for (let x = 0; x < w; x += trees.spacing * (0.5 + r())) {
      if (r() > trees.density) continue;
      const y = yAt(x) + 3, s = trees.size * (0.6 + 0.8 * r());
      trees.draw(g, x, y, s, r);
    }
  }
  return { c: cv, y: yAt, w };
}
function drawLayer(g, L, offX, offY = 0) { // offX: desplazamiento de cámara en px
  const x = -((offX % L.w) + L.w) % L.w;
  g.drawImage(L.c, x, offY);
  if (x + L.w < W) g.drawImage(L.c, x + L.w, offY);
}

// ---------- vegetación (dibujan en el contexto dado) ----------
function conifer(g, x, y, s, r) {
  g.beginPath(); g.moveTo(x, y - s);
  const tiers = 7;
  for (let i = 1; i <= tiers; i++) { const yy = y - s + (s * i) / tiers; const ww = s * 0.07 + (s * 0.28 * i) / tiers; g.lineTo(x + ww, yy); g.lineTo(x + ww * 0.45, yy - s * 0.02); }
  for (let i = tiers; i >= 1; i--) { const yy = y - s + (s * i) / tiers; const ww = s * 0.07 + (s * 0.28 * i) / tiers; g.lineTo(x - ww * 0.45, yy - s * 0.02); g.lineTo(x - ww, yy); }
  g.closePath(); g.fill();
  g.fillRect(x - s * 0.025, y - s * 0.1, s * 0.05, s * 0.12);
}
function broadTree(g, x, y, s, r) {
  g.fillRect(x - s * 0.03, y - s * 0.6, s * 0.06, s * 0.6);
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, d = r() * s * 0.25;
    g.beginPath(); g.ellipse(x + Math.cos(a) * d, y - s * 0.7 + Math.sin(a) * d * 0.6, s * (0.14 + 0.12 * r()), s * (0.1 + 0.08 * r()), 0, 0, TAU); g.fill();
  }
}
function palm(g, x, y, s, r, sway = 0) {
  const lean = (r() - 0.5) * 0.4;
  const tx = x + Math.sin(lean) * s, ty = y - s;
  g.lineWidth = s * 0.04; g.strokeStyle = g.fillStyle; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * s * 0.2, y - s * 0.5, tx, ty); g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI + sway + (r() - 0.5) * 0.3;
    const reach = s * (0.3 + 0.12 * r()), dx = -Math.cos(a) * reach;
    const ex = tx + dx, ey = ty + s * (0.12 + 0.18 * Math.abs(Math.cos(a)) + 0.06 * r());
    g.lineWidth = s * 0.022;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + dx * 0.6, ty - s * 0.1 * (1 - Math.abs(Math.cos(a))) - s * 0.04, ex, ey); g.stroke();
    for (let k = 1; k < 7; k++) { const u = k / 7, px = tx + dx * u, py = ty + (ey - ty) * u * u - s * 0.05 * Math.sin(u * Math.PI); g.lineWidth = s * 0.008; g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx * 0.05, py + s * 0.07); g.stroke(); }
  }
}
function acacia(g, x, y, s, r) {
  g.strokeStyle = g.fillStyle; g.lineCap = 'round';
  g.lineWidth = s * 0.035;
  const ty = y - s * 0.62;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.02, ty + s * 0.15);
  g.lineTo(x - s * 0.22, ty); g.moveTo(x + s * 0.02, ty + s * 0.15); g.lineTo(x + s * 0.25, ty - s * 0.02); g.stroke();
  for (let i = 0; i < 14; i++) {
    const px = x + (r() - 0.5) * s * 0.85, py = ty - s * 0.06 + (r() - 0.5) * s * 0.06;
    g.beginPath(); g.ellipse(px, py, s * (0.12 + 0.1 * r()), s * (0.035 + 0.02 * r()), 0, 0, TAU); g.fill();
  }
}
function fern(g, x, y, s, t = 0, seed = 0) { // helecho/cícada con frondas curvas
  g.strokeStyle = g.fillStyle; g.lineCap = 'round';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.6 + 0.05 * Math.sin(t * 1.3 + i + seed);
    const L = s * (0.7 + 0.3 * hash(i, seed));
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L * 0.8 + L * 0.25;
    const cx = x + Math.cos(a) * L * 0.6, cy = y + Math.sin(a) * L * 0.75;
    g.lineWidth = s * 0.025;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    for (let k = 1; k < 9; k++) { // foliolos
      const u = k / 9, px = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * cx + u * u * ex, py = (1 - u) * (1 - u) * y + 2 * (1 - u) * u * cy + u * u * ey;
      const ll = s * 0.12 * (1 - u * 0.7);
      g.lineWidth = s * 0.012;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a - 1.2) * ll, py + Math.sin(a - 1.2) * ll + ll * 0.4);
      g.moveTo(px, py); g.lineTo(px + Math.cos(a + 1.2) * ll, py + Math.sin(a + 1.2) * ll + ll * 0.4); g.stroke();
    }
  }
}
function grassTuft(g, x, y, s, t, seed) {
  g.strokeStyle = g.fillStyle; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const h = s * (0.5 + 0.5 * hash(i, seed)); const lean = (hash(i, seed + 1) - 0.5) * 0.8 + 0.12 * Math.sin(t * 1.7 + x * 0.01 + i);
    g.lineWidth = s * 0.03;
    g.beginPath(); g.moveTo(x + (i - 3) * s * 0.04, y);
    g.quadraticCurveTo(x + lean * h * 0.4, y - h * 0.6, x + lean * h, y - h); g.stroke();
  }
}
function deadTrunk(g, x, y, s, seed) {
  g.strokeStyle = g.fillStyle; g.lineCap = 'round';
  g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(1, seed) - 0.5) * s * 0.1, y - s); g.stroke();
  for (let i = 0; i < 4; i++) {
    const yy = y - s * (0.45 + 0.13 * i), d = i % 2 ? 1 : -1;
    g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(x, yy);
    g.lineTo(x + d * s * (0.15 + 0.15 * hash(i, seed)), yy - s * (0.1 + 0.1 * hash(i + 5, seed))); g.stroke();
  }
}

// ---------- primitivas anatómicas ----------
// tubo cónico a lo largo de una curva de Bézier cúbica
function tube(g, p0, p1, p2, p3, r0, r1, n = 18) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    const x = v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0];
    const y = v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1];
    const dx = 3 * v * v * (p1[0] - p0[0]) + 6 * v * u * (p2[0] - p1[0]) + 3 * u * u * (p3[0] - p2[0]);
    const dy = 3 * v * v * (p1[1] - p0[1]) + 6 * v * u * (p2[1] - p1[1]) + 3 * u * u * (p3[1] - p2[1]);
    const l = Math.hypot(dx, dy) || 1, r = lerp(r0, r1, u);
    L.push([x - dy / l * r, y + dx / l * r]); R.push([x + dy / l * r, y - dx / l * r]);
  }
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fill();
  g.beginPath(); g.arc(p0[0], p0[1], r0, 0, TAU); g.fill();
  g.beginPath(); g.arc(p3[0], p3[1], r1, 0, TAU); g.fill();
}
function seg(g, a, b, r0, r1) { // segmento recto cónico
  tube(g, a, [lerp(a[0], b[0], 0.33), lerp(a[1], b[1], 0.33)], [lerp(a[0], b[0], 0.66), lerp(a[1], b[1], 0.66)], b, r0, r1, 4);
}
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); }
const polar = (p, a, L) => [p[0] + Math.sin(a) * L, p[1] + Math.cos(a) * L]; // a=0 hacia abajo, + hacia delante

// Dibuja una figura dos veces: primero desplazada con color de borde (luz de contorno) y luego el cuerpo.
function withRim(g, rim, dx, dy, body, fn) {
  if (rim) { g.save(); g.translate(dx, dy); g.fillStyle = rim; g.strokeStyle = rim; fn(true); g.restore(); }
  g.fillStyle = body; g.strokeStyle = body; fn(false);
}

// ---------- criaturas (coordenadas locales: suelo y=0, mirando a +x) ----------
function quadLeg(g, hip, len, ph, amp, w, knee = 1) {
  const a1 = amp * Math.sin(ph);
  const bend = knee * (0.15 + 0.5 * Math.max(0, Math.sin(ph + 1.4))) * (amp > 0 ? 1 : 0.3);
  const k = polar(hip, a1, len * 0.52);
  const f = polar(k, a1 - bend * knee, len * 0.5);
  seg(g, hip, k, w, w * 0.75); seg(g, k, f, w * 0.75, w * 0.55);
  return f;
}
function sauropod(g, x, y, s, t, opt = {}) {
  const ph = t * (opt.speed || 1.6) + (opt.phase || 0), dir = opt.dir || 1;
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  const bob = 0.03 * Math.sin(ph * 2);
  const neckSw = 0.12 * Math.sin(t * 0.5 + (opt.phase || 0)), tailSw = 0.15 * Math.sin(t * 0.7 + 1 + (opt.phase || 0));
  const legs = (back) => {
    const sh = back ? 0 : Math.PI;
    quadLeg(g, [0.75, -1.25 + bob], 1.25, ph + sh, 0.28, 0.17);
    quadLeg(g, [-0.75, -1.25 + bob], 1.25, ph + sh + Math.PI / 2, 0.28, 0.2);
  };
  const draw = () => {
    legs(true);
    tube(g, [-1.0, -1.35 + bob], [-2.0, -1.3], [-3.0, -0.9 + tailSw], [-4.1, -0.55 + tailSw * 2], 0.38, 0.03);
    ell(g, 0, -1.45 + bob, 1.35, 0.62, -0.04);
    tube(g, [0.9, -1.6 + bob], [1.6, -2.1], [1.9 + neckSw, -3.0], [2.2 + neckSw, -3.55], 0.38, 0.13);
    ell(g, 2.38 + neckSw, -3.58, 0.25, 0.11, 0.25);
    legs(false);
  };
  g.fillStyle = opt.color; draw();
  g.restore();
}
function theropod(g, x, y, s, t, opt = {}) {
  const ph = t * (opt.speed || 3) + (opt.phase || 0), dir = opt.dir || 1, roar = opt.roar || 0;
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  const bob = 0.04 * Math.abs(Math.sin(ph));
  const hip = [0, -1.55 - bob];
  const leg = (p, w) => {
    const a = 0.5 * Math.sin(p);
    const k = polar(hip, a + 0.35, 0.75);
    const lift = Math.max(0, Math.sin(p + 1.5));
    const an = polar(k, a - 0.6 - 0.5 * lift, 0.62);
    const f = polar(an, a + 0.2, 0.32);
    seg(g, hip, k, 0.26 * w, 0.17 * w); seg(g, k, an, 0.13 * w, 0.08 * w); seg(g, an, f, 0.08 * w, 0.05 * w);
    ell(g, f[0] + 0.12, f[1] - 0.02, 0.2, 0.06);
  };
  const tsw = 0.08 * Math.sin(ph * 0.5);
  const draw = () => {
    leg(ph + Math.PI, 0.9);
    tube(g, [-0.2, hip[1]], [-1.0, hip[1] - 0.1], [-1.8, hip[1] + tsw], [-2.8, hip[1] + 0.15 + tsw * 2], 0.42, 0.03);
    tube(g, [-0.2, hip[1]], [0.3, hip[1] - 0.05], [0.8, hip[1] - 0.25], [1.15, hip[1] - 0.45], 0.48, 0.32);
    const nk = [1.15, hip[1] - 0.45], hd = [1.55, hip[1] - 0.95 - 0.1 * roar];
    tube(g, nk, [1.35, hip[1] - 0.6], [1.35, hip[1] - 0.85], hd, 0.3, 0.22);
    // cabeza: cráneo + mandíbula
    g.save(); g.translate(hd[0], hd[1]); g.rotate(-0.15 * roar);
    g.beginPath(); g.moveTo(-0.15, -0.2); g.quadraticCurveTo(0.35, -0.3, 0.75, -0.08); g.lineTo(0.72, 0.05); g.lineTo(-0.1, 0.12); g.closePath(); g.fill();
    g.rotate(0.35 * roar);
    g.beginPath(); g.moveTo(-0.1, 0.05); g.lineTo(0.62, 0.08); g.lineTo(0.55, 0.18); g.lineTo(-0.1, 0.22); g.closePath(); g.fill();
    g.restore();
    // brazos
    const sh = [1.0, hip[1] - 0.25];
    seg(g, sh, [1.15, hip[1] + 0.0], 0.07, 0.05); seg(g, [1.15, hip[1]], [1.3, hip[1] - 0.05], 0.05, 0.03);
    leg(ph, 1);
  };
  g.fillStyle = opt.color; draw();
  g.restore();
}
function smallMammal(g, x, y, s, t, opt = {}) { // mamífero pequeño tipo musaraña
  const ph = t * (opt.speed || 14) + (opt.phase || 0), dir = opt.dir || 1, mv = opt.moving ?? 1;
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  const bob = 0.03 * Math.sin(ph * 2) * mv;
  const sniff = opt.sniff ? 0.04 * Math.sin(t * 22) : 0;
  g.fillStyle = opt.color;
  const leg = (hx, p) => quadLeg(g, [hx, -0.22 + bob], 0.24, p, 0.6 * mv, 0.045);
  leg(0.25, ph + Math.PI); leg(-0.25, ph);
  tube(g, [-0.4, -0.3 + bob], [-0.8, -0.35], [-1.0, -0.2 + 0.05 * Math.sin(t * 3)], [-1.25, -0.12], 0.04, 0.012);
  ell(g, 0, -0.32 + bob, 0.45, 0.2, 0.05);
  g.beginPath(); g.moveTo(0.3, -0.45 + bob); g.quadraticCurveTo(0.7 + sniff, -0.38 + bob, 0.82 + sniff, -0.28 + bob); g.quadraticCurveTo(0.6, -0.18 + bob, 0.3, -0.2 + bob); g.closePath(); g.fill();
  ell(g, 0.38, -0.47 + bob, 0.07, 0.09, -0.4);
  leg(0.25, ph); leg(-0.25, ph + Math.PI);
  if (opt.eye) { g.fillStyle = opt.eye; ell(g, 0.55, -0.37 + bob, 0.03, 0.03); }
  g.restore();
}
function earlyHorse(g, x, y, s, t, opt = {}) { // équido primitivo del Eoceno, del tamaño de un zorro
  const ph = t * (opt.speed || 6) + (opt.phase || 0), dir = opt.dir || 1;
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  const bob = 0.02 * Math.sin(ph * 2);
  g.fillStyle = opt.color;
  const legs = (o) => { quadLeg(g, [0.42, -0.55 + bob], 0.58, ph + o, 0.45, 0.05); quadLeg(g, [-0.42, -0.58 + bob], 0.6, ph + o + Math.PI / 2, 0.45, 0.06, -1); };
  legs(Math.PI);
  tube(g, [-0.5, -0.7 + bob], [-0.62, -0.66], [-0.7, -0.55], [-0.72, -0.45], 0.05, 0.02);
  g.beginPath(); g.moveTo(-0.55, -0.55 + bob); g.quadraticCurveTo(-0.5, -0.86 + bob, 0, -0.84 + bob); g.quadraticCurveTo(0.45, -0.84 + bob, 0.55, -0.7 + bob); g.quadraticCurveTo(0.5, -0.5 + bob, 0, -0.5 + bob); g.quadraticCurveTo(-0.5, -0.45 + bob, -0.55, -0.55 + bob); g.fill();
  tube(g, [0.45, -0.72 + bob], [0.6, -0.85], [0.65, -0.95], [0.72, -1.02 + bob], 0.12, 0.08);
  g.beginPath(); g.moveTo(0.65, -1.1 + bob); g.quadraticCurveTo(0.95, -1.05 + bob, 1.02, -0.92 + bob); g.lineTo(0.95, -0.88 + bob); g.quadraticCurveTo(0.8, -0.92 + bob, 0.68, -0.95 + bob); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(0.66, -1.08 + bob); g.lineTo(0.7, -1.22 + bob); g.lineTo(0.76, -1.08 + bob); g.fill();
  legs(0);
  g.restore();
}
function mammoth(g, x, y, s, t, opt = {}) {
  const ph = t * (opt.speed || 1.4) + (opt.phase || 0), dir = opt.dir || 1;
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  const bob = 0.02 * Math.sin(ph * 2);
  g.fillStyle = opt.color;
  const legs = (o) => { quadLeg(g, [0.7, -1.2 + bob], 1.2, ph + o, 0.25, 0.22); quadLeg(g, [-0.65, -1.2 + bob], 1.2, ph + o + Math.PI / 2, 0.25, 0.24); };
  legs(Math.PI);
  // cuerpo con joroba y pelaje
  g.beginPath(); g.moveTo(-1.1, -1.0 + bob);
  g.quadraticCurveTo(-1.2, -2.0 + bob, 0.1, -2.35 + bob); g.quadraticCurveTo(0.9, -2.55 + bob, 1.25, -2.05 + bob);
  g.quadraticCurveTo(1.45, -1.3 + bob, 1.0, -0.8 + bob);
  for (let i = 0; i <= 12; i++) { const xx = lerp(1.0, -1.1, i / 12); g.lineTo(xx, -0.72 + bob + (i % 2 ? -0.08 : 0.06) + 0.03 * Math.sin(t * 2 + i)); }
  g.closePath(); g.fill();
  // cabeza abombada
  ell(g, 1.25, -2.15 + bob, 0.42, 0.45, 0.3);
  // trompa
  const sw = 0.12 * Math.sin(t * 0.9 + (opt.phase || 0));
  tube(g, [1.5, -1.9 + bob], [1.8, -1.4], [1.65 + sw, -0.8], [1.8 + sw, -0.45], 0.18, 0.07);
  // colmillos
  g.save(); g.strokeStyle = opt.tusk || 'rgba(230,225,210,0.9)'; g.lineWidth = 0.08; g.lineCap = 'round';
  g.beginPath(); g.moveTo(1.45, -1.75 + bob); g.bezierCurveTo(1.9, -1.2, 2.4, -1.4, 2.2, -1.95); g.stroke(); g.restore();
  g.fillStyle = opt.color;
  tube(g, [-1.1, -1.6 + bob], [-1.25, -1.4], [-1.3, -1.2], [-1.32, -1.0], 0.06, 0.03);
  legs(0);
  g.restore();
}
function bird(g, x, y, s, t, seed = 0) { // silueta de ave en vuelo
  const f = Math.sin(t * 9 + seed * 3);
  g.beginPath(); g.moveTo(x - s, y - f * s * 0.5); g.quadraticCurveTo(x - s * 0.4, y - s * 0.25 - f * s * 0.2, x, y);
  g.quadraticCurveTo(x + s * 0.4, y - s * 0.25 - f * s * 0.2, x + s, y - f * s * 0.5);
  g.quadraticCurveTo(x + s * 0.4, y - s * 0.05, x, y + s * 0.12); g.quadraticCurveTo(x - s * 0.4, y - s * 0.05, x - s, y - f * s * 0.5); g.fill();
}
function pterosaur(g, x, y, s, t, seed = 0) {
  const f = Math.sin(t * 3 + seed);
  g.beginPath(); g.moveTo(x, y);
  g.lineTo(x - s * 1.2, y - s * 0.5 * f - s * 0.1); g.lineTo(x - s * 0.3, y + s * 0.1);
  g.lineTo(x + s * 0.3, y + s * 0.1); g.lineTo(x + s * 1.2, y - s * 0.5 * f - s * 0.1); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + s * 0.1, y); g.lineTo(x + s * 0.55, y - s * 0.08); g.lineTo(x + s * 0.1, y + s * 0.08); g.fill();
  g.beginPath(); g.moveTo(x + s * 0.2, y - s * 0.02); g.lineTo(x - s * 0.15, y - s * 0.3); g.lineTo(x + s * 0.1, y + s * 0.03); g.fill();
}
function primate(g, x, y, s, t, opt = {}) { // primate primitivo (tipo omomiforme) sobre una rama
  const dir = opt.dir || 1;
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  g.fillStyle = opt.color;
  const cl = opt.climb || 0; // ciclo de trepar
  const ph = cl * TAU;
  const look = opt.look || 0;
  // cola larga colgando
  tube(g, [-0.35, -0.35], [-0.7, -0.1], [-0.75, 0.6 + 0.05 * Math.sin(t)], [-0.45 + 0.1 * Math.sin(t * 0.8), 1.0], 0.07, 0.03, 20);
  // patas traseras agarradas a la rama
  seg(g, [-0.25, -0.35], [-0.05, -0.15], 0.1, 0.07); seg(g, [-0.05, -0.15], [-0.25 + 0.05 * Math.sin(ph), 0.0], 0.07, 0.05);
  // cuerpo
  ell(g, -0.05, -0.5, 0.35, 0.22, -0.5);
  // brazo delantero
  const hand = [0.42 + 0.08 * Math.sin(ph + 1), -0.02];
  seg(g, [0.15, -0.62], [0.35, -0.35], 0.07, 0.05); seg(g, [0.35, -0.35], hand, 0.05, 0.04);
  // cabeza con ojos grandes
  g.save(); g.translate(0.3, -0.82); g.rotate(look);
  ell(g, 0, 0, 0.2, 0.17);
  ell(g, 0.17, 0.04, 0.09, 0.07);
  ell(g, -0.08, -0.16, 0.06, 0.08, -0.3); ell(g, 0.06, -0.17, 0.05, 0.07, 0.3);
  if (opt.eye) { g.fillStyle = opt.eye; ell(g, 0.1, -0.03, 0.055, 0.055); ell(g, 0.1, -0.03, 0.02, 0.02); }
  g.restore();
  g.restore();
}
function batShape(g, x, y, s, t, seed = 0) {
  const f = Math.sin(t * 14 + seed);
  g.beginPath(); g.moveTo(x, y);
  g.quadraticCurveTo(x - s * 0.6, y - s * 0.6 * f, x - s, y - s * 0.2 * f);
  g.lineTo(x - s * 0.7, y + s * 0.1); g.lineTo(x - s * 0.4, y + s * 0.02); g.lineTo(x - s * 0.15, y + s * 0.15);
  g.lineTo(x, y + s * 0.08); g.lineTo(x + s * 0.15, y + s * 0.15); g.lineTo(x + s * 0.4, y + s * 0.02); g.lineTo(x + s * 0.7, y + s * 0.1);
  g.lineTo(x + s, y - s * 0.2 * f); g.quadraticCurveTo(x + s * 0.6, y - s * 0.6 * f, x, y); g.fill();
}

// ---------- homininos ----------
// Proporciones aproximadas en metros. lean = inclinación del tronco; prog = prognatismo.
const SPECIES = {
  australopithecus: { h: 1.1, leg: 0.46, torso: 0.36, arm: 0.5, w: 1.15, lean: 0.14, prog: 0.75, brow: 0.6, head: 0.105, hair: 0.0, fur: true },
  erectus: { h: 1.76, leg: 0.88, torso: 0.55, arm: 0.66, w: 1.0, lean: 0.03, prog: 0.45, brow: 0.8, head: 0.115, hair: 0.2 },
  neandertal: { h: 1.66, leg: 0.78, torso: 0.56, arm: 0.64, w: 1.32, lean: 0.04, prog: 0.4, brow: 0.9, head: 0.125, hair: 0.8, cloak: true },
  sapiens: { h: 1.72, leg: 0.86, torso: 0.54, arm: 0.66, w: 0.95, lean: 0.0, prog: 0.15, brow: 0.15, head: 0.12, hair: 0.9 },
  floresiensis: { h: 1.06, leg: 0.46, torso: 0.36, arm: 0.48, w: 1.05, lean: 0.04, prog: 0.4, brow: 0.7, head: 0.08, hair: 0.2 },
};
function walkPose(ph, amp = 1) {
  const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
  return {
    thA: 0.42 * amp * s1, knA: (0.12 + 0.6 * Math.max(0, Math.sin(ph - 0.9))) * amp + 0.05,
    thB: 0.42 * amp * s2, knB: (0.12 + 0.6 * Math.max(0, Math.sin(ph + Math.PI - 0.9))) * amp + 0.05,
    arA: -0.38 * amp * s1, elA: 0.25 + 0.2 * amp * Math.max(0, -s1),
    arB: -0.38 * amp * s2, elB: 0.25 + 0.2 * amp * Math.max(0, -s2),
    bob: 0.025 * amp * Math.abs(Math.cos(ph)), lean: 0, head: 0,
  };
}
function sitPose(t, work = 0) {
  return { sit: true, thA: -1.45, knA: -1.5, thB: -1.35, knB: -1.6, arA: -0.9 - work * (0.3 + 0.3 * Math.sin(t * 7)), elA: 0.9 + work * 0.4 * Math.sin(t * 7), arB: -0.6, elB: 1.2, bob: 0, lean: 0.25, head: 0.15 + 0.03 * Math.sin(t * 0.7) };
}
function standPose(t, look = 0) {
  return { thA: 0.04, knA: 0.04, thB: -0.05, knB: 0.05, arA: 0.06 + 0.02 * Math.sin(t), elA: 0.2, arB: -0.05, elB: 0.25, bob: 0.004 * Math.sin(t * 2), lean: 0, head: look };
}
function hominin(g, x, y, px, sp, pose, opt = {}) {
  const S = SPECIES[sp] || sp, dir = opt.dir || 1;
  g.save(); g.translate(x, y); g.scale(px * dir, px);
  const w = S.w, Lt = S.leg * 0.5, Ls = S.leg * 0.5;
  const hipH = pose.sit ? 0.22 : S.leg * (1 - 0.06 * Math.max(pose.knA, pose.knB) * 0.5) - pose.bob;
  const hip = [0, -hipH];
  const lean = S.lean + (pose.lean || 0);
  const sh = [hip[0] + Math.sin(lean) * S.torso, hip[1] - Math.cos(lean) * S.torso];
  const leg = (th, kn, side) => {
    const k = polar(hip, th, Lt), a = polar(k, th - kn, Ls);
    seg(g, hip, k, 0.075 * w, 0.055 * w); seg(g, k, a, 0.052 * w, 0.035 * w);
    ell(g, a[0] + 0.07, a[1] - 0.015, 0.11, 0.035);
  };
  const arm = (ar, el, hold) => {
    const e = polar(sh, ar, S.arm * 0.5), hnd = polar(e, ar + el, S.arm * 0.48);
    seg(g, sh, e, 0.05 * w, 0.04 * w); seg(g, e, hnd, 0.04 * w, 0.03 * w);
    ell(g, hnd[0], hnd[1], 0.04, 0.045);
    if (hold) hold(hnd, ar + el);
  };
  const body = opt.color;
  g.fillStyle = opt.colorBack || body; g.strokeStyle = g.fillStyle;
  // extremidades traseras (más oscuras)
  leg(pose.thB, pose.knB); arm(pose.arB, pose.elB, opt.holdB);
  g.fillStyle = body; g.strokeStyle = body;
  // torso
  const mid = [lerp(hip[0], sh[0], 0.5) + 0.02, lerp(hip[1], sh[1], 0.5)];
  g.save(); g.translate(mid[0], mid[1]); g.rotate(lean);
  g.beginPath();
  const tw = 0.13 * w, th = S.torso * 0.62;
  g.moveTo(-tw * 0.9, th); g.quadraticCurveTo(-tw * 1.25, 0, -tw * 1.0, -th * 0.95);
  g.quadraticCurveTo(0, -th * 1.15, tw * 1.1, -th * 0.9); g.quadraticCurveTo(tw * (S.fur ? 1.5 : 1.2), 0, tw * 0.95, th);
  g.closePath(); g.fill();
  if (S.cloak) { // capa de piel
    g.beginPath(); g.moveTo(-tw * 1.3, -th * 0.9); g.lineTo(tw * 1.25, -th * 0.95);
    for (let i = 0; i <= 8; i++) g.lineTo(lerp(tw * 1.35, -tw * 1.4, i / 8), th * 0.55 + (i % 2 ? 0.04 : 0));
    g.closePath(); g.fill();
  }
  g.restore();
  // cuello y cabeza
  const hc = [sh[0] + Math.sin(lean * 1.3 + (pose.head || 0)) * 0.13 + S.prog * 0.04, sh[1] - Math.cos(lean + (pose.head || 0)) * 0.13 - S.head * 0.6];
  seg(g, sh, hc, 0.05 * w, 0.045 * w);
  g.save(); g.translate(hc[0], hc[1]); g.rotate((pose.head || 0) + lean * 0.4);
  const r = S.head;
  ell(g, -0.01, -r * 0.15, r * (S.prog > 0.5 ? 0.95 : 1.0), r * (sp === 'sapiens' ? 1.08 : 0.92));
  // cara y mandíbula
  g.beginPath(); g.moveTo(r * 0.2, -r * 0.45);
  g.lineTo(r * (0.95 + S.brow * 0.25), -r * 0.35); // arco superciliar
  g.lineTo(r * (0.85 + S.prog * 0.35), r * 0.05);
  g.lineTo(r * (0.8 + S.prog * 0.45), r * 0.45);
  g.lineTo(r * (0.55 + S.prog * 0.2), r * 0.82); g.lineTo(r * 0.0, r * 0.75); g.closePath(); g.fill();
  if (S.hair > 0.1) { ell(g, -r * 0.15, -r * 0.4, r * 1.02, r * (0.6 + 0.2 * S.hair), -0.2); ell(g, -r * 0.55, r * 0.15, r * 0.4, r * 0.6 * S.hair); }
  g.restore();
  // extremidades delanteras
  leg(pose.thA, pose.knA); arm(pose.arA, pose.elA, opt.holdA);
  g.restore();
}
// objetos que se sostienen
function holdSpear(g, len = 2.1) {
  return (h, a) => { g.save(); g.lineWidth = 0.025; g.lineCap = 'round'; g.beginPath(); const ang = -1.25; g.moveTo(h[0] - Math.cos(ang) * len * 0.35, h[1] - Math.sin(ang) * len * 0.35); g.lineTo(h[0] + Math.cos(ang) * len * 0.65, h[1] + Math.sin(ang) * len * 0.65); g.stroke(); g.restore(); };
}
function holdAxe(g) { return (h) => { ell(g, h[0] + 0.02, h[1] + 0.06, 0.05, 0.08, 0.3); }; }

// ---------- fuego y partículas ----------
function fire(g, x, y, s, t, intensity = 1) {
  g.save(); g.globalCompositeOperation = 'lighter';
  glow(g, x, y - s * 0.4, s * 6 * intensity, [255, 120, 40], 0.35 * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3)));
  for (let i = 0; i < 26; i++) {
    const life = (t * (1.3 + hash(i, 3)) + hash(i, 4)) % 1;
    const xx = x + (hash(i, 5) - 0.5) * s * 0.9 * (1 - life) + Math.sin(t * 6 + i) * s * 0.08;
    const yy = y - life * s * (1.2 + hash(i, 6));
    const r = s * (0.32 * (1 - life) + 0.04);
    const c = life < 0.3 ? [255, 230, 150] : life < 0.6 ? [255, 150, 50] : [200, 60, 20];
    const gr = g.createRadialGradient(xx, yy, 0, xx, yy, r);
    gr.addColorStop(0, rgb(c, 0.55 * (1 - life))); gr.addColorStop(1, rgb(c, 0));
    g.fillStyle = gr; g.fillRect(xx - r, yy - r, 2 * r, 2 * r);
  }
  g.restore();
}
function embers(g, x, y, spread, height, t, n = 30, seed = 11, col = [255, 170, 80]) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const life = (t * (0.25 + 0.3 * hash(i, seed)) + hash(i, seed + 1)) % 1;
    const xx = x + (hash(i, seed + 2) - 0.5) * spread + Math.sin(t * 2 + i) * 20 * life;
    const yy = y - life * height;
    g.fillStyle = rgb(col, (1 - life) * 0.9);
    g.fillRect(xx, yy, 2.2, 2.2);
  }
  g.restore();
}
function fallingParticles(g, t, { n = 300, seed = 3, speed = 60, drift = 20, size = 2, color = [200, 200, 200], alpha = 0.6, wind = 0 }) {
  g.fillStyle = rgb(color, alpha);
  for (let i = 0; i < n; i++) {
    const depth = 0.3 + 0.7 * hash(i, seed);
    const x = ((hash(i, seed + 1) * (W + 200) + (wind * depth + Math.sin(t * 0.7 + i) * drift) * t) % (W + 200) + W + 200) % (W + 200) - 100;
    const y = ((hash(i, seed + 2) * (H + 100) + speed * depth * t) % (H + 100)) - 50;
    const r = size * depth;
    g.globalAlpha = 0.4 + 0.6 * depth;
    g.fillRect(x, y, r, r);
  }
  g.globalAlpha = 1;
}

// ---------- texto ----------
function spacedText(g, txt, x, y, spacing) {
  // dibuja texto centrado con espaciado entre letras
  const chars = [...txt]; let total = 0; const ws = chars.map((c) => { const w = g.measureText(c).width; total += w + spacing; return w; });
  total -= spacing; let cx = x - total / 2;
  const prev = g.textAlign; g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, cx, y); cx += ws[i] + spacing; });
  g.textAlign = prev;
}
function lowerThird(g, t, a, b, title, sub) {
  const k = fadeInOut(t, a, b, 0.7, 0.7); if (k <= 0) return;
  g.save(); g.globalAlpha = k;
  const x = 120, y = H - 190, slide = (1 - smooth(a, a + 0.9, t)) * 30;
  const bg = g.createLinearGradient(0, 0, 1100, 0); bg.addColorStop(0, 'rgba(0,0,0,0.5)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = bg; g.fillRect(0, y - 90, 1100, 180);
  g.fillStyle = 'rgba(230,190,120,0.95)'; g.fillRect(x - 24, y - 52, 4, 104);
  g.fillStyle = 'rgba(255,248,235,0.97)'; g.font = 'italic 600 46px Montserrat'; g.textAlign = 'left';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 18;
  g.fillText(title, x + slide, y - 4);
  g.font = '400 26px Montserrat'; g.fillStyle = 'rgba(240,225,200,0.9)';
  g.fillText(sub, x + slide, y + 36);
  g.restore();
}
