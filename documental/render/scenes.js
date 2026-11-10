// Escenas del documental. Cada escena: draw(g, lt, sc) con lt = tiempo local (s).
'use strict';

// ---------- buffers para fundidos ----------
const _pool = []; let _depth = 0;
function renderToBuffer(fn) {
  if (!_pool[_depth]) _pool[_depth] = mkCanvas(W, H);
  const c = _pool[_depth++], g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.clearRect(0, 0, W, H);
  fn(g); _depth--; return c;
}
// Planos dentro de una escena con fundido encadenado: list = [[inicio, fn(g, tPlano, lt)], ...]
function shots(g, lt, list, xf = 0.9) {
  let i = list.length - 1; while (i > 0 && lt < list[i][0]) i--;
  if (i > 0 && lt < list[i][0] + xf) {
    list[i - 1][1](g, lt - list[i - 1][0], lt);
    const k = smooth(list[i][0], list[i][0] + xf, lt);
    const c = renderToBuffer((b) => list[i][1](b, lt - list[i][0], lt));
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = k; g.drawImage(c, 0, 0); g.restore();
  } else list[i][1](g, lt - list[i][0], lt);
}
// cámara con zoom alrededor de un punto
function zoomAt(g, cx, cy, z) { g.translate(cx, cy); g.scale(z, z); g.translate(-cx, -cy); }

// ---------- mapas (proyección equirectangular) ----------
let LAND = [];
function mapView(v) {
  const sx = W / (v.lon1 - v.lon0), sy = sx; // misma escala en ambos ejes
  const cy = (v.lat0 + v.lat1) / 2;
  return { P: (lon, lat) => [(lon - v.lon0) * sx, H / 2 - (lat - cy) * sy], s: sx };
}
function drawLand(g, mv, fill, stroke) {
  g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 1.5; g.lineJoin = 'round';
  g.beginPath();
  for (const ring of LAND) {
    ring.forEach(([lo, la], i) => { const p = mv.P(lo, la); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.closePath();
  }
  g.fill(); if (stroke) g.stroke();
}
function catmull(pts, n = 16) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(pts[pts.length - 1]); return out;
}
function migration(g, mv, route, prog, col, width = 4) { // route: [[lon,lat],...]
  if (prog <= 0) return null;
  const pts = catmull(route.map(([a, b]) => mv.P(a, b)));
  const n = Math.max(2, Math.floor(pts.length * clamp(prog)));
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = rgb(col, 0.25); g.lineWidth = width * 3.5;
  g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]); g.stroke();
  g.strokeStyle = rgb(col, 0.95); g.lineWidth = width; g.setLineDash([14, 10]); g.lineDashOffset = -prog * 400;
  g.stroke(); g.setLineDash([]);
  const head = pts[n - 1];
  glow(g, head[0], head[1], 40, col, 0.9);
  g.fillStyle = rgb([255, 255, 240]); ell(g, head[0], head[1], 5, 5);
  g.restore();
  return head;
}
function mapLabel(g, x, y, title, sub, a, col = [255, 240, 210], align = 'left') {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a; g.textAlign = align; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 10;
  g.fillStyle = rgb(col); g.font = '600 30px Montserrat'; g.fillText(title, x, y);
  if (sub) { g.font = '400 23px Montserrat'; g.fillStyle = 'rgba(235,225,205,0.9)'; g.fillText(sub, x, y + 30); }
  g.restore();
}
function mapBase(g, lt, mv, tint = [24, 30, 38]) {
  const gr = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.75);
  gr.addColorStop(0, rgb([18, 34, 52])); gr.addColorStop(1, rgb([6, 10, 18]));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // retícula de meridianos y paralelos
  g.strokeStyle = 'rgba(140,180,220,0.07)'; g.lineWidth = 1;
  for (let lo = -180; lo <= 180; lo += 15) { const a = mv.P(lo, -90), b = mv.P(lo, 90); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  for (let la = -75; la <= 75; la += 15) { const a = mv.P(-180, la), b = mv.P(180, la); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.save(); g.shadowColor = 'rgba(230,180,110,0.35)'; g.shadowBlur = 25;
  drawLand(g, mv, rgb([120, 100, 72]), 'rgba(255,220,160,0.55)');
  g.restore();
}

// ---------- globo terráqueo (mapeo esférico por píxel) ----------
let GLOBE = null;
function buildGlobeTextures() {
  const tw = 2048, th = 1024;
  const mask = mkCanvas(tw, th), mg = mask.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, tw, th); mg.fillStyle = '#fff';
  mg.beginPath();
  for (const ring of LAND) { ring.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * tw, y = (90 - la) / 180 * th; i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); }
  mg.fill();
  const md = mg.getImageData(0, 0, tw, th).data;
  const blur = mkCanvas(tw, th), bg = blur.getContext('2d'); bg.filter = 'blur(10px)'; bg.drawImage(mask, 0, 0);
  const bd = bg.getImageData(0, 0, tw, th).data;
  const land = new Uint8Array(tw * th), lights = new Float32Array(tw * th);
  for (let i = 0; i < tw * th; i++) land[i] = md[i * 4] > 127 ? 1 : 0;
  const r = mulberry32(42);
  for (let k = 0; k < 160000; k++) {
    const x = (r() * tw) | 0, y = (th * (0.12 + 0.62 * r())) | 0, i = y * tw + x;
    if (!land[i]) continue;
    const lat = 90 - (y / th) * 180;
    const coast = 1 - Math.abs(bd[i * 4] / 255 - 0.5) * 2; // máximo cerca de la costa
    const band = lat > 20 && lat < 62 ? 1 : lat > -40 && lat < 20 ? 0.45 : 0.12;
    const pr = band * (0.25 + 0.75 * coast);
    if (r() > pr) continue;
    const v = 0.4 + 0.6 * r() * r();
    lights[i] = Math.min(1.5, lights[i] + v);
    if (r() < 0.5) { lights[i + 1] = Math.min(1.5, lights[i + 1] + v * 0.5); lights[i + tw] = Math.min(1.5, lights[i + tw] + v * 0.4); }
  }
  // nubes procedurales
  const n = makeNoise(9), n2 = makeNoise(17), cloud = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x += 1) {
    const v = fbm(n, x * 0.012 + fbm(n2, y * 0.02, 3) * 3, 4) * 0.6 + fbm(n2, x * 0.004 + y * 0.03, 3) * 0.6;
    cloud[y * tw + x] = clamp((v - 0.52) * 3.2);
  }
  GLOBE = { tw, th, land, lights, cloud, img: null };
}
function drawGlobe(g, cx, cy, R, rot, tilt, mode, sunX = 0.9) {
  const size = Math.ceil(R * 2) + 2;
  if (!GLOBE.img || GLOBE.img.width !== size) { GLOBE.cv = mkCanvas(size, size); GLOBE.img = GLOBE.cv.getContext('2d').createImageData(size, size); }
  const d = GLOBE.img.data, { tw, th, land, lights, cloud } = GLOBE;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const sun = [sunX, -0.25, -Math.sqrt(Math.max(0, 1 - sunX * sunX - 0.0625))];
  for (let py = 0; py < size; py++) {
    const ny = (py - R) / R;
    for (let px = 0; px < size; px++) {
      const nx = (px - R) / R, rr = nx * nx + ny * ny, o = (py * size + px) * 4;
      if (rr > 1) { d[o + 3] = 0; continue; }
      const nz = Math.sqrt(1 - rr);
      const y2 = ny * ct - nz * st, z2 = ny * st + nz * ct;
      const lon = Math.atan2(nx, z2) + rot, lat = Math.asin(-y2);
      let u = ((lon / TAU + 0.5) % 1 + 1) % 1, v = 0.5 - lat / Math.PI;
      const ti = ((v * th) | 0) * tw + ((u * tw) | 0);
      const limb = Math.pow(1 - nz, 2.2);
      let r, gg, b;
      const cl = cloud[ti];
      if (mode === 'ancient') { // océano y nubes (sin continentes modernos)
        const dl = clamp(nx * 0.8 - ny * 0.35 + nz * 0.45);
        r = 8 + 30 * dl; gg = 22 + 70 * dl; b = 48 + 120 * dl;
        r = lerp(r, 230 * dl + 12, cl * 0.85); gg = lerp(gg, 235 * dl + 14, cl * 0.85); b = lerp(b, 240 * dl + 22, cl * 0.85);
      } else { // noche con luces urbanas y un borde iluminado
        const dl = Math.pow(clamp(nx * 0.95 + ny * 0.1 - 0.62) * 2.6, 1.5);
        const L = land[ti];
        r = L ? 22 : 4; gg = L ? 24 : 9; b = L ? 26 : 22;
        const li = lights[ti] * (1 - dl) * (1 - cl * 0.7);
        r += 255 * li; gg += 190 * li; b += 100 * li;
        const dr = L ? 90 : 20, dg = L ? 110 : 60, db = L ? 70 : 140;
        r = lerp(r, dr + cl * 160, clamp(dl)); gg = lerp(gg, dg + cl * 160, clamp(dl)); b = lerp(b, db + cl * 150, clamp(dl));
        r += cl * 6; gg += cl * 8; b += cl * 12;
      }
      r += limb * 40; gg += limb * 90; b += limb * 170;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  GLOBE.cv.getContext('2d').putImageData(GLOBE.img, 0, 0);
  g.drawImage(GLOBE.cv, cx - R - 1, cy - R - 1);
  // atmósfera
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) { g.strokeStyle = `rgba(90,160,255,${0.1 - i * 0.011})`; g.lineWidth = 6 + i * 7; g.beginPath(); g.arc(cx, cy, R + i * 4, 0, TAU); g.stroke(); }
  g.restore();
}

// ---------- escenas ----------
const SCENES = {};
const cache = {};
function once(k, fn) { return cache[k] || (cache[k] = fn()); }

// ===== INTRO: el espacio, la Tierra antigua y el asteroide =====
SCENES.intro = {
  init() {
    once('asteroid', () => {
      const c = mkCanvas(200, 200), g = c.getContext('2d'); const r = mulberry32(5);
      g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, rad = 70 + r() * 22; g.lineTo(100 + Math.cos(a) * rad, 100 + Math.sin(a) * rad * 0.8); } g.closePath();
      const gr = g.createRadialGradient(140, 70, 10, 100, 100, 100); gr.addColorStop(0, '#b8a488'); gr.addColorStop(0.5, '#5a4c40'); gr.addColorStop(1, '#120e0c');
      g.fillStyle = gr; g.fill();
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + 0.2 * r()})`; ell(g, 30 + r() * 140, 40 + r() * 120, 4 + r() * 12, 3 + r() * 9); }
      return c;
    });
  },
  draw(g, lt) {
    g.fillStyle = '#020306'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(-lt * 4, -lt * 1.5); stars(g, lt, 7, 1100); g.restore();
    // nebulosa tenue
    glow(g, W * 0.2, H * 0.25, 700, [60, 40, 90], 0.25); glow(g, W * 0.8, H * 0.15, 500, [30, 50, 90], 0.2);
    // Tierra del Cretácico: océanos y nubes (los continentes tenían otra forma)
    const R = 820 + lt * 9, cx = W * 0.5 + 40 - lt * 6, cy = H + 500 - lt * 8;
    drawGlobe(g, cx, cy, R, 1.2 + lt * 0.012, -0.45, 'ancient');
    glow(g, W * 0.98, cy - R * 0.62, 600, [255, 220, 170], 0.35);
    // asteroide
    const k = lt / 8, ax = lerp(W * 0.22, W * 0.4, k), ay = lerp(H * 0.12, H * 0.34, k), as = lerp(0.18, 0.32, k);
    g.save(); g.translate(ax, ay); g.rotate(lt * 0.15); g.scale(as, as); g.drawImage(cache.asteroid, -100, -100); g.restore();
    glow(g, ax + 6, ay - 4, 60, [255, 210, 160], 0.12);
    // título
    const a = fadeInOut(lt, 1.4, 7.4, 1.4, 1.2);
    if (a > 0) {
      g.save(); g.globalAlpha = a; g.fillStyle = '#f7ead2'; g.shadowColor = 'rgba(255,190,120,0.5)'; g.shadowBlur = 30;
      g.font = '700 118px Cinzel'; spacedText(g, 'LA RAMA HUMANA', W / 2, H * 0.42, 16 + lt * 1.5);
      g.shadowBlur = 8; g.font = '400 30px Montserrat'; g.fillStyle = 'rgba(240,225,200,0.92)';
      spacedText(g, '66 MILLONES DE AÑOS DE EVOLUCIÓN', W / 2, H * 0.42 + 70, 9);
      g.restore();
    }
  },
};

// ===== IMPACTO: Cretácico al atardecer =====
SCENES.impacto = {
  init(sc) {
    const L2 = sc.L[1]; sc.IMP = L2.s + 5.1; sc.FB = sc.IMP - 6.5;
    once('cret', () => ({
      far: ridgeLayer({ seed: 3, base: 690, amp: 300, freq: 0.0022, sharp: 0.6, top: [126, 78, 104], bot: [112, 70, 98] }),
      mid: ridgeLayer({ seed: 8, base: 770, amp: 140, freq: 0.004, top: [70, 42, 64], bot: [58, 36, 56], trees: { spacing: 22, density: 0.8, size: 70, draw: conifer } }),
      near: ridgeLayer({ seed: 12, base: 905, amp: 60, freq: 0.003, top: [34, 22, 32], bot: [22, 14, 20], trees: { spacing: 90, density: 0.6, size: 90, draw: (g, x, y, s) => fern(g, x, y, s, 0, x) } }),
    }));
  },
  draw(g, lt, sc) {
    const C = cache.cret, IMP = sc.IMP, FB = sc.FB;
    const shake = lt > IMP ? 14 * Math.exp(-(lt - IMP) * 1.2) : 0;
    g.save(); g.translate(Math.sin(lt * 60) * shake, Math.cos(lt * 47) * shake);
    const cam = lt * 22;
    const after = smooth(IMP, IMP + 3, lt);
    // cielo
    skyGradient(g, [[0, mixc([38, 28, 70], [60, 12, 8], after)], [0.45, mixc([170, 84, 92], [170, 40, 18], after)], [0.7, mixc([250, 160, 100], [255, 120, 40], after)], [1, [255, 190, 120]]]);
    const sunX = W * 0.72 - cam * 0.05, sunY = 600;
    glow(g, sunX, sunY, 520, [255, 190, 120], 0.55); glow(g, sunX, sunY, 70, [255, 240, 210], 0.9);
    for (let i = 0; i < 5; i++) { const cw = 700 + 500 * hash(i, 5); const cs = cloudSprite(20 + i, cw | 0, (cw * 0.3) | 0, [255, 200, 180]); const x = ((i * 520 - cam * 0.15 - lt * 6) % (W + 1200) + W + 1200) % (W + 1200) - 1000; g.drawImage(cs, x, 40 + 300 * hash(i, 2)); }
    // bola de fuego
    if (lt > FB && lt < IMP + 0.2) {
      const k = clamp((lt - FB) / (IMP - FB)), kk = Math.pow(k, 1.6);
      const x0 = -150, y0 = 40, x1 = W * 0.6, y1 = 700;
      const hx = lerp(x0, x1, kk), hy = lerp(y0, y1, kk);
      g.save(); g.globalCompositeOperation = 'lighter';
      const tl = 380 + 900 * kk, ang = Math.atan2(y1 - y0, x1 - x0);
      const tx = hx - Math.cos(ang) * tl, ty = hy - Math.sin(ang) * tl;
      const gr = g.createLinearGradient(tx, ty, hx, hy); gr.addColorStop(0, 'rgba(255,120,40,0)'); gr.addColorStop(0.8, 'rgba(255,170,80,0.45)'); gr.addColorStop(1, 'rgba(255,250,220,0.95)');
      g.strokeStyle = gr; g.lineCap = 'round';
      for (const [w, a] of [[46, 0.25], [20, 0.6], [7, 1]]) { g.globalAlpha = a; g.lineWidth = w * (0.6 + kk); g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke(); }
      g.globalAlpha = 1; g.restore();
      // estela de humo
      g.save(); g.strokeStyle = 'rgba(60,40,40,0.25)'; g.lineWidth = 30 + 40 * kk; g.beginPath(); g.moveTo(tx - 200, ty - 120); g.lineTo(hx - Math.cos(ang) * 80, hy - Math.sin(ang) * 80); g.stroke(); g.restore();
      glow(g, hx, hy, 160 + 500 * kk, [255, 220, 170], 0.5 + 0.5 * kk);
    }
    // explosión en el horizonte
    if (lt > IMP) {
      const e = lt - IMP, ix = W * 0.6 - cam * 0.05 + 22 * (lt - IMP) * 0.05;
      glow(g, ix, 690, 500 + e * 300, [255, 190, 110], Math.max(0.35, 1 - e * 0.12));
      // bola de fuego que asoma tras el horizonte
      const dome = Math.min(1, e / 2.5) * 420;
      const dg = g.createRadialGradient(ix, 700, 0, ix, 700, dome + 1);
      dg.addColorStop(0, 'rgba(255,250,220,0.95)'); dg.addColorStop(0.45, 'rgba(255,190,90,0.85)'); dg.addColorStop(1, 'rgba(255,90,30,0)');
      g.fillStyle = dg; g.beginPath(); g.arc(ix, 700, dome + 1, Math.PI, TAU); g.fill();
      // columna de eyección
      for (let i = 0; i < 70; i++) {
        const q = hash(i, 8), grow = Math.min(1, e / (2 + 3 * q));
        const hgt = grow * (150 + 750 * q); const yy = 700 - hgt;
        const xx = ix + (hash(i, 9) - 0.5) * (160 + e * 160) * (0.4 + hgt / 600);
        const rr = (70 + 110 * hash(i, 10)) * (0.5 + grow);
        const heat = clamp(1 - hgt / 500 - e * 0.1);
        const gr = g.createRadialGradient(xx, yy, 0, xx, yy, rr);
        gr.addColorStop(0, `rgba(${70 + 185 * heat | 0},${30 + 90 * heat | 0},${20 + 20 * heat | 0},0.6)`); gr.addColorStop(1, 'rgba(50,20,15,0)');
        g.fillStyle = gr; g.fillRect(xx - rr, yy - rr, rr * 2, rr * 2);
      }
      // onda expansiva
      const ring = e * 700; g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,200,140,${Math.max(0, 0.6 - e * 0.15)})`; g.lineWidth = 10;
      g.beginPath(); g.ellipse(ix, 700, ring, ring * 0.12, 0, Math.PI, TAU); g.stroke(); g.restore();
    }
    drawLayer(g, C.far, cam * 0.15);
    fogBand(g, 560, 780, [255, 170, 130], 0.28);
    drawLayer(g, C.mid, cam * 0.35);
    fogBand(g, 700, 830, [230, 130, 110], 0.25);
    // saurópodos
    const sauro = mixc([62, 38, 56], [40, 20, 20], after);
    for (let i = 0; i < 4; i++) {
      const sx = ((300 + i * 380 + lt * 14 - cam * 0.5) % (W + 600) + W + 600) % (W + 600) - 300;
      sauropod(g, sx, 815 + i * 6, 34 + i * 3, lt, { color: rgb(sauro), phase: i * 1.7, speed: 1.4 });
    }
    // pterosaurios
    g.fillStyle = 'rgba(40,22,34,0.9)';
    for (let i = 0; i < 3; i++) pterosaur(g, ((lt * 70 + i * 140) % (W + 400)) - 200, 260 + i * 40 + 20 * Math.sin(lt * 0.5 + i), 34 - i * 6, lt, i);
    drawLayer(g, C.near, cam * 0.7);
    // terópodo en primer plano
    const roar = smooth(FB + 2.2, FB + 3.2, lt) * (1 - smooth(IMP + 1, IMP + 2.5, lt));
    const walk = 1 - smooth(FB + 1.5, FB + 2.5, lt);
    const tx = 260 + Math.min(lt, FB + 2) * 18;
    g.save();
    theropod(g, tx + 6, 1000, 150, lt * walk + (1 - walk) * (FB + 2), { color: rgb([255, 150, 90], 0.75), roar, speed: 2.4 });
    theropod(g, tx, 1000, 150, lt * walk + (1 - walk) * (FB + 2), { color: rgb(mixc([20, 12, 18], [15, 6, 6], after)), roar, speed: 2.4 });
    g.restore();
    g.fillStyle = '#0c070a';
    fern(g, 80, 1090, 260, lt, 1); fern(g, W - 120, 1100, 300, lt, 2); fern(g, W - 420, 1110, 180, lt, 3);
    // luz del meteoro / del impacto
    const fbL = lt > FB ? smooth(FB, IMP, lt) : 0;
    if (fbL > 0) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,170,90,${0.25 * fbL})`; g.fillRect(0, 0, W, H); g.restore(); }
    g.restore();
    if (lt > IMP - 0.05) {
      const e = lt - IMP; const fl = e < 0.15 ? smooth(-0.05, 0.12, e) : Math.max(0, 1 - (e - 0.15) / 1.4) * 0.95;
      g.fillStyle = `rgba(255,248,235,${fl})`; g.fillRect(0, 0, W, H);
      // oscurecimiento final
      const dk = smooth(sc.dur - 2.2, sc.dur, lt); g.fillStyle = `rgba(30,8,4,${dk * 0.8})`; g.fillRect(0, 0, W, H);
    }
  },
};

// ===== INVIERNO DE IMPACTO =====
SCENES.invierno = {
  init(sc) {
    once('wint', () => ({
      far: ridgeLayer({ seed: 31, base: 700, amp: 220, freq: 0.0025, sharp: 0.4, top: [70, 40, 32], bot: [60, 34, 28] }),
      mid: ridgeLayer({ seed: 33, base: 800, amp: 110, freq: 0.004, top: [38, 24, 20], bot: [30, 19, 16], trees: { spacing: 40, density: 0.7, size: 120, draw: (g, x, y, s, r) => deadTrunk(g, x, y, s, (r() * 1000) | 0) } }),
      near: ridgeLayer({ seed: 35, base: 930, amp: 50, freq: 0.003, top: [24, 16, 14], bot: [14, 10, 9] }),
    }));
  },
  draw(g, lt, sc) {
    const C = cache.wint, L = sc.L, d = sc.dur;
    const z = 1 + 0.55 * ease(smooth(L[2].s - 1, L[2].s + 3, lt));
    const light = smooth(L[2].s + 2, d, lt); // el cielo se aclara al final
    g.save(); zoomAt(g, W * 0.62, 930, z);
    skyGradient(g, [[0, mixc([20, 12, 10], [60, 62, 70], light)], [0.6, mixc([80, 38, 22], [120, 110, 100], light)], [1, mixc([140, 60, 28], [170, 150, 120], light)]]);
    glow(g, W * 0.35, 380, 90, [255, 200, 160], 0.12 + 0.25 * light);
    const cam = lt * 12;
    for (let i = 0; i < 5; i++) { const cs = cloudSprite(40 + i, 900, 300, [70, 50, 45]); g.drawImage(cs, ((i * 500 - lt * 10) % (W + 900) + W + 900) % (W + 900) - 700, 60 + 80 * hash(i, 3)); }
    drawLayer(g, C.far, cam * 0.2);
    // incendios lejanos
    for (let i = 0; i < 4; i++) { const x = ((i * 520 + 200 - cam * 0.3) % (W + 400) + W + 400) % (W + 400) - 200; glow(g, x, 780, 220, [255, 90, 30], 0.25 * (1 - light) * (0.8 + 0.2 * Math.sin(lt * 3 + i))); }
    fogBand(g, 600, 860, [120, 70, 50], 0.35);
    drawLayer(g, C.mid, cam * 0.45);
    for (let i = 0; i < 3; i++) { const x = ((i * 700 + 400 - cam * 0.45) % (W + 400) + W + 400) % (W + 400) - 200; fire(g, x, 805, 22, lt + i, 0.6 * (1 - light)); embers(g, x, 800, 60, 300, lt, 14, i * 7); }
    // esqueleto semienterrado
    const bx = 1180 - cam * 0.7;
    g.save(); g.strokeStyle = 'rgba(150,130,110,0.55)'; g.lineCap = 'round'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(bx - 260, 905); g.quadraticCurveTo(bx, 840, bx + 280, 905); g.stroke();
    g.lineWidth = 6; for (let i = 0; i < 9; i++) { const x = bx - 170 + i * 42, y = 870 - 18 * Math.sin((i / 8) * Math.PI); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + 30, x + 12, 912); g.stroke(); }
    g.restore();
    drawLayer(g, C.near, cam * 0.7);
    // ave posada que luego levanta vuelo
    const tb = L[1].s + 7.8, fly = smooth(tb + 0.6, tb + 5, lt);
    g.fillStyle = '#120c0a';
    deadTrunk(g, 380 - cam * 0.9, 1000, 420, 3);
    const perchX = 380 - cam * 0.9 + 70, perchY = 1000 - 420 * 0.71;
    if (fly <= 0) { ell(g, perchX + 4, perchY - 16, 18, 11, -0.2); ell(g, perchX + 20, perchY - 30, 8, 7); g.beginPath(); g.moveTo(perchX + 26, perchY - 32); g.lineTo(perchX + 38, perchY - 29); g.lineTo(perchX + 26, perchY - 26); g.fill(); g.beginPath(); g.moveTo(perchX - 10, perchY - 14); g.lineTo(perchX - 36, perchY - 4); g.lineTo(perchX - 8, perchY - 8); g.fill(); }
    else bird(g, perchX + fly * 1200, perchY - 20 - fly * 380, 30, lt, 1);
    // madriguera y mamífero
    const mx = 1190, my = 952;
    g.fillStyle = '#1a120e'; ell(g, mx, my + 6, 120, 26); g.fillStyle = '#050303'; ell(g, mx, my + 2, 46, 16);
    const em = smooth(L[2].s + 1.6, L[2].s + 3.4, lt), run = smooth(L[2].s + 5.2, d, lt);
    if (em > 0) {
      g.save(); g.beginPath(); g.rect(0, 0, W, my + 4 + run * 200); g.clip();
      const x = mx - run * 700, y = my + 22 * (1 - em) - (run > 0 ? 4 : 0);
      smallMammal(g, x + 3, y - 2, 80, lt, { color: 'rgba(255,170,110,0.6)', dir: -1, moving: run > 0 ? 1 : 0, sniff: run <= 0 });
      smallMammal(g, x, y, 80, lt, { color: '#2a1d16', dir: -1, moving: run > 0 ? 1 : 0, sniff: run <= 0, eye: 'rgba(255,200,150,0.9)' });
      g.restore();
    }
    // brotes de helechos (el "pico de helechos" tras la extinción)
    g.strokeStyle = 'rgba(90,130,60,0.9)'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const gk = smooth(L[2].s + 2 + i * 0.5, L[2].s + 6 + i * 0.5, lt); if (gk <= 0) continue;
      const x = 920 + i * 70 + 20 * hash(i, 4), y = 960 + 12 * hash(i, 5), h = 60 * gk * (0.6 + 0.6 * hash(i, 6));
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - h * 0.6, x + 2, y - h);
      g.arc(x + 2 + 8 * (1 - gk), y - h, 8 * (1 - gk * 0.6) + 2, Math.PI, Math.PI + TAU * (1 - gk * 0.7), false); g.stroke();
    }
    g.restore();
    fallingParticles(g, lt, { n: 420, seed: 5, speed: 45, drift: 30, size: 3.2, color: [175, 165, 155], alpha: 0.55 * (1 - light * 0.6), wind: 25 });
    if (lt < 2.5) { g.fillStyle = `rgba(30,8,4,${0.85 * (1 - smooth(0, 2.5, lt))})`; g.fillRect(0, 0, W, H); }
  },
};

// ===== MAMÍFEROS Y PRIMEROS PRIMATES =====
SCENES.mamiferos = {
  init() {
    once('eoc', () => ({
      far: ridgeLayer({ seed: 51, base: 640, amp: 120, freq: 0.003, top: [150, 175, 140], bot: [140, 168, 132], trees: { spacing: 30, density: 0.9, size: 200, draw: broadTree } }),
      mid: ridgeLayer({ seed: 53, base: 760, amp: 80, freq: 0.004, top: [80, 110, 70], bot: [70, 98, 60], trees: { spacing: 60, density: 0.85, size: 330, draw: (g, x, y, s, r) => (r() < 0.5 ? palm(g, x, y, s, r) : broadTree(g, x, y, s, r)) } }),
      near: ridgeLayer({ seed: 55, base: 960, amp: 40, freq: 0.004, top: [34, 48, 26], bot: [20, 30, 16], trees: { spacing: 70, density: 0.8, size: 110, draw: (g, x, y, s) => fern(g, x, y, s, 0, x) } }),
    }));
    once('bokeh', () => {
      const c = mkCanvas(W, H), g = c.getContext('2d'); const r = mulberry32(77);
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#5f7f45'); gr.addColorStop(0.5, '#86995a'); gr.addColorStop(1, '#2c3b20');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 130; i++) { const x = r() * W, y = r() * H * 0.8, rad = 20 + r() * 90; const c2 = r() < 0.5 ? [255, 240, 170] : [170, 210, 120]; const gg = g.createRadialGradient(x, y, rad * 0.7, x, y, rad); gg.addColorStop(0, rgb(c2, 0.18 + 0.2 * r())); gg.addColorStop(1, rgb(c2, 0)); g.fillStyle = gg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      return c;
    });
  },
  draw(g, lt, sc) {
    const L = sc.L, C = cache.eoc;
    shots(g, lt, [
      [0, (g, t) => {
        const cam = t * 30;
        skyGradient(g, [[0, [180, 205, 160]], [0.6, [225, 228, 170]], [1, [190, 200, 150]]]);
        glow(g, W * 0.8, 120, 700, [255, 245, 200], 0.5);
        drawLayer(g, C.far, cam * 0.2);
        fogBand(g, 500, 800, [230, 235, 200], 0.45);
        godRays(g, W * 0.85, -100, [255, 240, 190], 0.1, t, 10, 3);
        drawLayer(g, C.mid, cam * 0.45);
        fogBand(g, 700, 880, [200, 215, 170], 0.35);
        // aves y un murciélago
        g.fillStyle = 'rgba(40,50,30,0.85)';
        for (let i = 0; i < 4; i++) bird(g, ((t * 110 + i * 170) % (W + 300)) - 150, 230 + i * 30 + 15 * Math.sin(t + i), 16, t, i);
        if (t > 6 && t < 12) { g.fillStyle = 'rgba(30,30,25,0.9)'; batShape(g, W - (t - 6) * 380, 420 + 60 * Math.sin(t * 3), 26, t); }
        drawLayer(g, C.near, cam * 0.75);
        // équido primitivo y pequeño mamífero
        const hx = 520 + t * 55;
        earlyHorse(g, hx + 5, 975, 230, t, { color: 'rgba(240,220,160,0.6)', speed: 5 });
        earlyHorse(g, hx, 975, 230, t, { color: '#2a2a18', speed: 5 });
        smallMammal(g, 1500 - t * 90, 1010, 70, t, { color: '#262614', dir: -1 });
        g.fillStyle = '#141c0c'; fern(g, 120, 1100, 300, t, 4); fern(g, W - 200, 1110, 340, t, 5);
        lowerThird(g, t, 1.5, 7.5, 'La radiación de los mamíferos', 'Paleoceno y Eoceno · hace 66 a 34 millones de años');
      }],
      [L[1].s - 0.4, (g, t) => {
        const z = 1 + t * 0.012;
        g.save(); zoomAt(g, W / 2, H / 2, z);
        g.drawImage(cache.bokeh, 0, 0);
        godRays(g, W * 0.9, -150, [255, 240, 190], 0.12, t, 8, 9);
        // rama diagonal con hojas
        g.fillStyle = '#2c2216';
        tube(g, [-100, 900], [600, 780], [1200, 640], [2100, 520], 46, 26, 30);
        g.fillStyle = '#3a2e1c'; tube(g, [-100, 890], [600, 770], [1200, 630], [2100, 510], 20, 10, 30);
        for (let i = 0; i < 26; i++) {
          const x = 100 + i * 75, y = 860 - i * 15 + 10 * Math.sin(i * 1.3), a = -0.8 + Math.sin(t * 1.2 + i) * 0.15 + (i % 2 ? 0.9 : -0.3);
          g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = i % 3 ? '#2f4a1c' : '#3d5d22'; ell(g, 0, -45, 18, 46); g.restore();
        }
        const cl = clamp(t / 6), px = lerp(500, 900, ease(cl)), py = lerp(800, 725, ease(cl));
        primate(g, px + 5, py - 4, 330, t, { color: 'rgba(255,230,170,0.5)', climb: t * 0.5 * (1 - cl), look: 0.3 * smooth(6, 7.5, t) });
        primate(g, px, py, 330, t, { color: '#1e1610', climb: t * 0.5 * (1 - cl), look: 0.3 * smooth(6, 7.5, t), eye: 'rgba(255,215,140,0.95)' });
        g.restore();
        lowerThird(g, t, 1.5, sc.dur - L[1].s - 0.8, 'Primeros primates', 'Hace unos 55 millones de años · trepadores con manos prensiles');
      }],
    ]);
  },
};

// ===== ÁRBOL EVOLUTIVO =====
const TREE = (() => {
  const Y = (t) => 240 + (1000 - 240) * Math.sqrt(Math.max(0, t) / 16);
  const B = [
    // grupo 0: grandes simios
    { id: 'orang', p: 600, x: 250, t0: 15, t1: 0, alive: true, label: 'Orangutanes', grp: 0 },
    { id: 'apes', p: 600, x: 640, t0: 16, t1: 9, grp: 0, trunk: true },
    { id: 'gor', p: 640, x: 470, t0: 9, t1: 0, alive: true, label: 'Gorilas', grp: 0 },
    { id: 'ph', p: 640, x: 820, t0: 9, t1: 7.2, grp: 0, trunk: true },
    { id: 'pan', p: 820, x: 700, t0: 7.2, t1: 1.8, grp: 1, trunk: true },
    { id: 'chimp', p: 700, x: 640, t0: 1.8, t1: 0, alive: true, label: 'Chimpancés', grp: 1 },
    { id: 'bono', p: 700, x: 790, t0: 1.8, t1: 0, alive: true, label: 'Bonobos', grp: 1 },
    { id: 'homline', p: 820, x: 1665, t0: 7.2, t1: 0, alive: true, label: 'Humanos', grp: 2, simple: true },
    // grupo 3: el arbusto de los homininos
    { id: 'sahel', p: 900, x: 920, t0: 7.0, t1: 6.8, label: 'Sahelanthropus', grp: 3 },
    { id: 'ardi', p: 960, x: 1000, t0: 5.8, t1: 4.3, label: 'Ardipithecus', grp: 3 },
    { id: 'austr', p: 1030, x: 1085, t0: 4.2, t1: 2.0, label: 'Australopithecus', grp: 3 },
    { id: 'paran', p: 1080, x: 1170, t0: 2.7, t1: 1.2, label: 'Paranthropus', grp: 3 },
    { id: 'habil', p: 1110, x: 1250, t0: 2.4, t1: 1.5, label: 'H. habilis', grp: 3 },
    { id: 'erect', p: 1150, x: 1335, t0: 1.95, t1: 0.11, label: 'H. erectus', grp: 3 },
    { id: 'flor', p: 1335, x: 1420, t0: 0.9, t1: 0.05, label: 'H. floresiensis', grp: 3 },
    { id: 'deni', p: 1380, x: 1500, t0: 0.6, t1: 0.04, label: 'Denisovanos', grp: 3 },
    { id: 'nean', p: 1420, x: 1580, t0: 0.6, t1: 0.04, label: 'Neandertales', grp: 3 },
    { id: 'sap', p: 1450, x: 1665, t0: 0.6, t1: 0, alive: true, label: 'Homo sapiens', grp: 3, star: true },
  ];
  // tallo incierto del que brotan los homininos
  const stem = [[820, 7.2], [900, 7.0], [960, 5.8], [1030, 4.2], [1080, 2.7], [1110, 2.4], [1150, 1.95], [1335, 0.9], [1450, 0.6]];
  return { Y, B, stem };
})();
function branchPath(b, Y) {
  const y0 = Y(b.t0), y1 = Y(b.t1), pts = [];
  for (let i = 0; i <= 40; i++) { const y = lerp(y0, y1, i / 40); pts.push([lerp(b.p, b.x, ease(clamp((y0 - y) / Math.min(110, (y0 - y1) * 0.6 + 1)))), y]); }
  return pts;
}
function strokePart(g, pts, k) {
  const n = Math.max(1, Math.floor((pts.length - 1) * clamp(k)));
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i <= n; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke();
  return pts[n];
}
SCENES.arbol = {
  draw(g, lt, sc) {
    const L = sc.L, { Y, B, stem } = TREE;
    const gr = g.createRadialGradient(W * 0.55, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.8);
    gr.addColorStop(0, '#13232a'); gr.addColorStop(1, '#05090c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    embers(g, W / 2, H + 50, W, H + 100, lt * 0.3, 70, 21, [160, 200, 220]);
    const z = 1 + 0.04 * ease(clamp(lt / sc.dur));
    g.save(); zoomAt(g, W * 0.55, H * 0.62, z);
    // eje temporal
    g.font = '500 20px Montserrat'; g.textAlign = 'right';
    for (const [t, lab] of [[15, '15 M.a.'], [10, '10'], [7, '7'], [5, '5'], [3, '3'], [2, '2'], [1, '1'], [0.3, '0,3'], [0, 'hoy']]) {
      const y = Y(t); g.fillStyle = 'rgba(180,210,220,0.55)'; g.fillText(lab, 110, y + 7);
      g.strokeStyle = 'rgba(180,210,220,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(130, y); g.lineTo(W - 40, y); g.stroke();
    }
    g.save(); g.translate(40, H / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = 'rgba(180,210,220,0.5)'; g.font = '500 18px Montserrat'; g.fillText('MILLONES DE AÑOS ATRÁS (M.a.)', 0, 0); g.restore();
    // progresos por fase
    const p1 = ease(smooth(0.3, L[0].e - 1, lt));
    const p2 = smooth(L[1].s, L[1].s + 1.5, lt);
    const p3 = (i) => ease(smooth(L[2].s + 0.6 + i * 0.55, L[2].s + 2.2 + i * 0.55, lt));
    const bush = smooth(L[2].s, L[2].s + 1.2, lt);
    g.lineCap = 'round'; g.lineJoin = 'round';
    let hi = 0;
    for (const b of B) {
      const pts = branchPath(b, Y);
      let k, col, wdt = b.trunk ? 6 : 5, a = 1;
      if (b.grp <= 1) { k = p1; col = b.grp === 1 ? mixc([170, 210, 220], [90, 220, 210], p2) : [170, 210, 220]; a = 1 - 0.35 * bush; }
      else if (b.grp === 2) { k = p1; col = mixc([170, 210, 220], [255, 205, 120], p2); a = 1 - bush; }
      else { k = p3(hi++); col = b.star ? [255, 215, 130] : [230, 185, 120]; if (!b.alive) a = 1 - 0.35 * smooth(L[2].s + 6, L[2].s + 8, lt); }
      if (k <= 0 || a <= 0) continue;
      g.globalAlpha = a;
      g.strokeStyle = rgb(col, 0.18); g.lineWidth = wdt * 4; strokePart(g, pts, k);
      g.strokeStyle = rgb(col, 0.95); g.lineWidth = wdt; const tip = strokePart(g, pts, k);
      if (k >= 1 && b.label) {
        const la = smooth(0, 1, k);
        g.save(); g.translate(tip[0], tip[1] - 14);
        if (b.grp === 3) g.rotate(-1.1);
        g.textAlign = b.grp === 3 ? 'left' : 'center'; g.font = (b.star ? '700 ' : '500 ') + (b.grp === 3 ? 22 : 26) + 'px Montserrat';
        g.fillStyle = rgb(b.star ? [255, 225, 150] : [235, 240, 235]); g.fillText(b.label + (b.alive || b.grp < 3 ? '' : ' †'), b.grp === 3 ? 6 : 0, 0);
        g.restore();
        if (b.alive) { glow(g, tip[0], tip[1], b.star ? 70 : 34, col, 0.7); }
        else { g.fillStyle = 'rgba(230,185,120,0.9)'; ell(g, tip[0], tip[1], 5, 5); }
      }
    }
    g.globalAlpha = 1;
    // tallo de los homininos (relaciones inciertas: línea discontinua)
    if (bush > 0) {
      g.save(); g.globalAlpha = bush; g.setLineDash([10, 9]); g.strokeStyle = 'rgba(230,185,120,0.75)'; g.lineWidth = 3;
      const sp = stem.map(([x, t]) => [x, Y(t)]); const cp = catmull(sp, 10); strokePart(g, cp, smooth(L[2].s, L[2].s + 5, lt)); g.restore();
    }
    // ancestro común
    const na = smooth(L[0].s + 4.5, L[0].s + 6, lt);
    if (na > 0) {
      const x = 820, y = Y(7.2), pulse = 1 + 0.25 * Math.sin(lt * 4) * p2;
      glow(g, x, y, 90 * pulse, [255, 210, 150], 0.8 * na);
      g.fillStyle = `rgba(255,240,210,${na})`; ell(g, x, y, 9, 9);
      g.save(); g.globalAlpha = na; g.textAlign = 'left'; g.font = '600 26px Montserrat'; g.fillStyle = '#fff1d8';
      g.fillText('Ancestro común (extinto)', x + 26, y + 9);
      g.font = '400 22px Montserrat'; g.fillStyle = 'rgba(240,225,200,0.85)';
      g.fillText(p2 > 0 ? 'hace ≈ 7 a 6 M.a. · África' : 'no era un chimpancé ni un humano', x + 26, y + 40);
      g.restore();
    }
    g.restore();
    // rótulos
    const c1 = fadeInOut(lt, L[0].s + 7, L[1].s - 0.2, 0.8, 0.6);
    const c3 = fadeInOut(lt, L[2].s + 1.5, sc.dur + 1, 0.8, 0.6);
    g.save(); g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 12;
    if (c1 > 0) { g.globalAlpha = c1; g.font = '600 38px Montserrat'; g.fillStyle = '#fff3dc'; g.fillText('No descendemos de los monos actuales: somos primos', W / 2, 75); }
    if (c3 > 0) {
      g.globalAlpha = c3; g.font = '600 38px Montserrat'; g.fillStyle = '#fff3dc'; g.fillText('Un arbusto, no una escalera', W / 2, 75);
      g.font = '400 20px Montserrat'; g.fillStyle = 'rgba(220,225,220,0.75)'; g.fillText('† = linaje extinto · relaciones simplificadas; varias siguen en debate', W / 2, H - 28);
    }
    g.restore();
  },
};

// ===== AUSTRALOPITHECUS =====
SCENES.australopithecus = {
  init() {
    once('plio', () => ({
      far: ridgeLayer({ seed: 61, base: 700, amp: 90, freq: 0.002, top: [150, 140, 160], bot: [150, 140, 155] }),
      mid: ridgeLayer({ seed: 63, base: 790, amp: 50, freq: 0.003, top: [110, 90, 80], bot: [100, 82, 72], trees: { spacing: 140, density: 0.6, size: 200, draw: acacia } }),
      near: ridgeLayer({ seed: 65, base: 860, amp: 18, freq: 0.002, top: [150, 132, 112], bot: [118, 104, 92] }),
    }));
  },
  draw(g, lt, sc) {
    const L = sc.L, C = cache.plio;
    const speed = 72; // px/s del grupo en el mundo
    const cam = lt * speed;
    skyGradient(g, [[0, [70, 96, 150]], [0.5, [200, 160, 150]], [0.72, [250, 195, 140]], [1, [240, 200, 160]]]);
    const sx = W * 0.2, sy = 690; glow(g, sx, sy, 600, [255, 200, 140], 0.55); glow(g, sx, sy, 60, [255, 245, 220], 0.95);
    for (let i = 0; i < 5; i++) { const cs = cloudSprite(60 + i, 800, 200, [255, 210, 190]); g.drawImage(cs, ((i * 470 - lt * 8) % (W + 800) + W + 800) % (W + 800) - 600, 150 + 70 * hash(i, 1)); }
    // volcán Sadiman con fumarola
    const vx = 1450 - cam * 0.08;
    g.fillStyle = rgb([128, 110, 128]);
    g.beginPath(); g.moveTo(vx - 520, 720); g.quadraticCurveTo(vx - 120, 520, vx - 50, 470); g.lineTo(vx + 50, 470); g.quadraticCurveTo(vx + 120, 520, vx + 520, 720); g.fill();
    for (let i = 0; i < 14; i++) { const k = ((lt * 0.05 + i / 14) % 1); const cs = cloudSprite(80 + (i % 3), 360, 180, [150, 140, 150]); g.globalAlpha = 0.9 * (1 - k); g.drawImage(cs, vx - 180 + k * 500, 400 - k * 330, 360 * (0.6 + k), 180 * (0.6 + k)); }
    g.globalAlpha = 1;
    drawLayer(g, C.far, cam * 0.12);
    fogBand(g, 620, 800, [250, 210, 180], 0.3);
    drawLayer(g, C.mid, cam * 0.35);
    // aves
    g.fillStyle = 'rgba(60,45,45,0.8)'; for (let i = 0; i < 5; i++) bird(g, W - ((lt * 90 + i * 120) % (W + 300)), 300 + i * 25, 13, lt, i);
    // suelo de ceniza
    const gy = 905;
    const gg = g.createLinearGradient(0, 850, 0, H); gg.addColorStop(0, '#9a8c7e'); gg.addColorStop(1, '#5e544a'); g.fillStyle = gg; g.fillRect(0, 870, W, H - 870);
    drawLayer(g, C.near, cam * 0.6, 20);
    // huellas en la ceniza (posiciones en coordenadas del mundo)
    const px = 230, wx0 = 700; // escala px/m y posición inicial
    const walkers = [{ off: 0, z: 0, s: 1, ph: 0 }, { off: -150, z: 26, s: 0.92, ph: 1.3 }, { off: -330, z: 8, s: 0.7, ph: 2.1 }];
    for (const w of walkers) {
      const stride = 0.48 * px * w.s * 2;
      for (let k = 0; k < 60; k++) {
        const fx = k * stride / 2 + 200; const worldNow = wx0 + w.off + lt * speed;
        if (fx > worldNow - 40) break;
        const x = fx - cam, y = gy + w.z + (k % 2 ? 6 : -6) + 18;
        if (x < -50 || x > W + 50) continue;
        const age = clamp((worldNow - fx) / 1400);
        g.fillStyle = `rgba(55,45,38,${0.55 - age * 0.25})`; ell(g, x, y, 15 * w.s, 5 * w.s);
        g.fillStyle = `rgba(200,185,165,${0.35 - age * 0.15})`; ell(g, x + 2, y - 4, 13 * w.s, 2 * w.s);
      }
    }
    // grupo de Australopithecus afarensis
    for (const w of [...walkers].reverse()) {
      const ph = (lt * speed) / (0.48 * px * w.s * 2) * TAU + w.ph;
      const x = wx0 + w.off + lt * speed - cam;
      hominin(g, x + 4, gy + w.z, px * w.s, 'australopithecus', walkPose(ph, 0.9), { color: 'rgba(255,210,150,0.55)' });
      hominin(g, x, gy + w.z, px * w.s, 'australopithecus', walkPose(ph, 0.9), { color: '#2b1f19', colorBack: '#1c1410' });
    }
    g.fillStyle = '#3a2e22'; for (let i = 0; i < 18; i++) grassTuft(g, ((i * 130 - cam * 1.2) % (W + 200) + W + 200) % (W + 200) - 100, H + 10, 120, lt, i);
    lowerThird(g, lt, L[0].s + 6, L[1].s + 4, 'Australopithecus afarensis', 'Este de África · hace 3,9 a 2,9 millones de años');
    lowerThird(g, lt, L[1].s + 7, sc.dur - 0.2, 'Huellas de Laetoli (Tanzania)', 'Pisadas en ceniza volcánica · hace ~3,66 millones de años');
  },
};

// ===== HOMO ERECTUS =====
SCENES.erectus = {
  init() {
    once('erec', () => ({
      far: ridgeLayer({ seed: 71, base: 690, amp: 150, freq: 0.0018, top: [200, 170, 150], bot: [195, 165, 145] }),
      mid: ridgeLayer({ seed: 73, base: 800, amp: 40, freq: 0.003, top: [150, 115, 75], bot: [140, 105, 70], trees: { spacing: 180, density: 0.5, size: 230, draw: acacia } }),
      night: ridgeLayer({ seed: 75, base: 820, amp: 120, freq: 0.0025, top: [16, 20, 34], bot: [10, 12, 22] }),
    }));
  },
  draw(g, lt, sc) {
    const L = sc.L, C = cache.erec;
    const mapT = L[1].s + 4.6;
    shots(g, lt, [
      [0, (g, t) => {
        const speed = 120, cam = t * speed;
        skyGradient(g, [[0, [120, 150, 190]], [0.6, [235, 205, 165]], [1, [245, 210, 160]]]);
        glow(g, W * 0.75, 260, 600, [255, 235, 190], 0.5);
        drawLayer(g, C.far, cam * 0.1);
        fogBand(g, 600, 820, [250, 225, 190], 0.45);
        drawLayer(g, C.mid, cam * 0.35);
        const gg = g.createLinearGradient(0, 820, 0, H); gg.addColorStop(0, '#b08c5a'); gg.addColorStop(1, '#6a5232'); g.fillStyle = gg; g.fillRect(0, 830, W, H);
        g.fillStyle = 'rgba(120,90,50,0.9)'; for (let i = 0; i < 30; i++) grassTuft(g, ((i * 90 - cam * 0.7) % (W + 200) + W + 200) % (W + 200) - 100, 860 + (i % 5) * 12, 60, t, i);
        // calima
        g.save(); g.globalAlpha = 0.12; for (let i = 0; i < 6; i++) { g.fillStyle = '#fff2d8'; g.fillRect(0, 780 + i * 14 + 4 * Math.sin(t * 3 + i), W, 3); } g.restore();
        const px = 190, x = 820, gy = 975;
        const ph = (t * speed) / (0.88 * px) * Math.PI;
        hominin(g, x + 4, gy, px, 'erectus', walkPose(ph, 1.05), { color: 'rgba(255,225,170,0.6)', holdA: holdAxe(g) });
        hominin(g, x, gy, px, 'erectus', walkPose(ph, 1.05), { color: '#2a1c14', colorBack: '#1b120d', holdA: holdAxe(g) });
        hominin(g, x - 330, gy - 30, px * 0.9, 'erectus', walkPose(ph + 2, 1.05), { color: '#3a2a1e', colorBack: '#2a1d14' });
        g.fillStyle = '#4a3820'; for (let i = 0; i < 14; i++) grassTuft(g, ((i * 160 - cam * 1.3) % (W + 200) + W + 200) % (W + 200) - 100, H + 10, 140, t, i + 50);
        lowerThird(g, t, 2.5, L[1].s - 0.5, 'Homo erectus', 'Hace ~1,9 millones a ~110 000 años · África y Asia');
      }],
      [L[1].s - 0.3, (g, t) => {
        g.fillStyle = '#060912'; g.fillRect(0, 0, W, H);
        skyGradient(g, [[0, [4, 6, 16]], [0.7, [14, 20, 40]], [1, [20, 22, 40]]]);
        stars(g, t, 12, 700, 0.9);
        drawLayer(g, C.night, 100);
        g.fillStyle = '#0b0a0c'; g.fillRect(0, 900, W, H);
        const fx = W * 0.5, fy = 930;
        glow(g, fx, fy - 40, 900, [255, 120, 40], 0.22 + 0.04 * Math.sin(t * 9));
        // figuras alrededor del fuego
        const warm = 'rgba(255,150,70,0.85)';
        hominin(g, fx - 300, fy + 20, 200, 'erectus', sitPose(t, 1), { color: warm });
        hominin(g, fx - 304, fy + 20, 200, 'erectus', sitPose(t, 1), { color: '#120b08', holdA: holdAxe(g) });
        hominin(g, fx + 300, fy + 20, 200, 'erectus', sitPose(t + 2, 0), { color: warm, dir: -1 });
        hominin(g, fx + 304, fy + 20, 200, 'erectus', sitPose(t + 2, 0), { color: '#120b08', dir: -1 });
        hominin(g, fx + 520, fy + 10, 210, 'erectus', standPose(t, 0.1), { color: warm, dir: -1 });
        hominin(g, fx + 524, fy + 10, 210, 'erectus', standPose(t, 0.1), { color: '#120b08', dir: -1 });
        g.fillStyle = '#1a1210'; for (let i = 0; i < 6; i++) { g.save(); g.translate(fx, fy + 10); g.rotate(-0.9 + i * 0.35); g.fillRect(-60, -6, 120, 12); g.restore(); }
        fire(g, fx, fy, 70, t, 1.2); embers(g, fx, fy - 40, 120, 500, t, 40, 3);
        // chispas al tallar la piedra
        const kn = (t * 7 / TAU) % 1; if (kn < 0.12) embers(g, fx - 210, fy - 60, 30, 40, t * 4, 6, 9, [255, 240, 200]);
      }],
      [mapT, (g, t) => {
        const mv = mapView({ lon0: -25, lon1: 150, lat0: -35, lat1: 60 });
        g.save(); zoomAt(g, mv.P(40, 10)[0], mv.P(40, 10)[1], 1.1 - 0.06 * t / 6);
        mapBase(g, t, mv);
        const pr = ease(clamp(t / 4.5)), col = [255, 160, 70];
        const A = [36, 2];
        migration(g, mv, [A, [34, 20], [36, 32], [44, 41.3]], clamp(pr * 2.2), col);
        migration(g, mv, [A, [34, 20], [40, 28], [60, 28], [80, 24], [100, 25], [110, 34]], clamp(pr * 1.4 - 0.1), col);
        migration(g, mv, [[80, 24], [96, 14], [102, 3], [110.8, -7.4]], clamp(pr * 1.6 - 0.7), col);
        glow(g, mv.P(...A)[0], mv.P(...A)[1], 80, col, 0.8);
        mapLabel(g, mv.P(...A)[0] + 20, mv.P(...A)[1] + 40, 'África oriental', '~1,9 M.a.', smooth(0.2, 1, t));
        mapLabel(g, mv.P(44, 41.3)[0] + 18, mv.P(44, 41.3)[1] - 18, 'Dmanisi (Georgia)', '~1,8 M.a.', smooth(1.8, 2.6, t));
        mapLabel(g, mv.P(110, 34)[0] + 18, mv.P(110, 34)[1] - 10, 'China', '~1,6 M.a.', smooth(3.4, 4.2, t));
        mapLabel(g, mv.P(110.8, -7.4)[0] + 18, mv.P(110.8, -7.4)[1] + 10, 'Java', '~1,5 M.a.', smooth(4.4, 5.2, t));
        g.restore();
        g.save(); g.textAlign = 'center'; g.fillStyle = '#fff1d8'; g.font = '600 36px Montserrat'; g.shadowColor = '#000'; g.shadowBlur = 12;
        g.fillText('Primeras salidas de África', W / 2, 80); g.restore();
      }],
    ]);
  },
};

// ===== NEANDERTALES =====
SCENES.neandertales = {
  init() {
    once('ice', () => ({
      far: ridgeLayer({ seed: 81, base: 700, amp: 360, freq: 0.0024, sharp: 0.7, top: [225, 232, 242], bot: [150, 165, 185], rim: [[255, 255, 255], 0.5, 2] }),
      mid: ridgeLayer({ seed: 83, base: 790, amp: 90, freq: 0.004, top: [70, 86, 105], bot: [60, 74, 92], trees: { spacing: 26, density: 0.7, size: 110, draw: conifer } }),
      snow: ridgeLayer({ seed: 85, base: 900, amp: 40, freq: 0.003, top: [220, 228, 238], bot: [170, 182, 200] }),
    }));
    once('cave', () => {
      const c = mkCanvas(W, H), g = c.getContext('2d'); const n = makeNoise(3);
      g.fillStyle = '#0d0907'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(260, H);
      for (let i = 0; i <= 60; i++) { const a = Math.PI + (i / 60) * Math.PI; const r = 1 + 0.08 * (fbm(n, i * 0.3) - 0.5); g.lineTo(W / 2 + Math.cos(a) * 760 * r, 980 + Math.sin(a) * 800 * r); }
      g.lineTo(W - 260, H); g.closePath(); g.fill();
      return c;
    });
  },
  draw(g, lt, sc) {
    const L = sc.L, C = cache.ice;
    const lineup = L[1].s + (L[1].p[0] ? L[1].p[0][1] : 5) - 0.1;
    shots(g, lt, [
      [0, (g, t) => {
        const cam = t * 40;
        skyGradient(g, [[0, [70, 88, 118]], [0.6, [160, 172, 190]], [1, [205, 210, 220]]]);
        glow(g, W * 0.3, 420, 400, [255, 230, 210], 0.35);
        drawLayer(g, C.far, cam * 0.1);
        fogBand(g, 560, 860, [220, 228, 238], 0.5);
        drawLayer(g, C.mid, cam * 0.3);
        // manada de mamuts
        for (let i = 0; i < 4; i++) {
          const mx = ((1500 - i * 260 - t * 26 + 200 - cam * 0.45) % (W + 600) + W + 600) % (W + 600) - 300;
          mammoth(g, mx, 850 + i * 5, 46 - i * 3, t, { color: rgb([58, 52, 58]), dir: -1, phase: i * 1.3, tusk: 'rgba(200,200,200,0.8)' });
        }
        fogBand(g, 800, 920, [230, 235, 242], 0.4);
        drawLayer(g, C.snow, cam * 0.6);
        const px = 185, gy = 1000, speed = 60;
        for (let i = 2; i >= 0; i--) {
          const x = 560 + i * 300 + t * 6, ph = (t * speed) / (0.8 * px) * Math.PI + i * 1.7, s = 1 - i * 0.06;
          hominin(g, x + 4, gy - i * 10, px * s, 'neandertal', walkPose(ph, 0.85), { color: 'rgba(230,240,255,0.7)', holdA: holdSpear(g) });
          hominin(g, x, gy - i * 10, px * s, 'neandertal', walkPose(ph, 0.85), { color: '#1d1714', colorBack: '#141010', holdA: holdSpear(g) });
        }
        fallingParticles(g, t, { n: 500, seed: 9, speed: 80, drift: 40, size: 3.5, color: [255, 255, 255], alpha: 0.8, wind: -60 });
        lowerThird(g, t, 2.5, L[1].s - 0.6, 'Neandertales', 'Europa y Asia occidental · hace ~400 000 a 40 000 años');
      }],
      [L[1].s - 0.3, (g, t) => {
        // vista desde dentro de la cueva
        skyGradient(g, [[0, [40, 54, 82]], [1, [130, 145, 170]]]);
        drawLayer(g, C.far, 500, -80);
        drawLayer(g, C.snow, 300, 40);
        fallingParticles(g, t, { n: 300, seed: 4, speed: 70, drift: 30, size: 3, color: [255, 255, 255], alpha: 0.7, wind: -40 });
        g.drawImage(cache.cave, 0, 0);
        g.fillStyle = '#120c08'; g.fillRect(0, 1000, W, 80);
        const fx = W * 0.5, fy = 1010;
        glow(g, fx, fy - 60, 1000, [255, 120, 40], 0.3 + 0.05 * Math.sin(t * 8));
        const warm = 'rgba(255,150,70,0.8)', dark = '#100a07';
        const ppl = [[fx - 320, 1, sitPose(t, 0), 200], [fx - 520, 1, standPose(t, 0.05), 205], [fx + 300, -1, sitPose(t + 1, 0), 200], [fx + 180, -1, sitPose(t + 3, 0), 125]];
        for (const [x, dir, pose, s] of ppl) { hominin(g, x - dir * 4, fy + 20, s, 'neandertal', pose, { color: warm, dir }); hominin(g, x, fy + 20, s, 'neandertal', pose, { color: dark, dir }); }
        fire(g, fx, fy, 80, t, 1.3); embers(g, fx, fy - 50, 140, 600, t, 40, 5);
      }],
      [lineup, (g, t) => {
        const gr = g.createRadialGradient(W / 2, H * 0.6, 50, W / 2, H * 0.6, W * 0.7); gr.addColorStop(0, '#2a2622'); gr.addColorStop(1, '#0a0908'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 880, W, 3);
        const items = [
          [W * 0.2, 'neandertal', 'Neandertales', 'Europa y Asia occidental'],
          [W * 0.5, 'neandertal', 'Denisovanos', 'Asia · conocidos sobre todo por su ADN'],
          [W * 0.8, 'floresiensis', 'Homo floresiensis', 'Isla de Flores, Indonesia · ~1 m'],
        ];
        items.forEach(([x, sp, name, sub], i) => {
          const a = smooth(0.3 + i * 1.1, 1.3 + i * 1.1, t); if (a <= 0) return;
          g.save(); g.globalAlpha = a;
          glow(g, x, 600, 360, [255, 200, 140], 0.18);
          if (i === 1) { // aspecto poco conocido: silueta difusa y signo de pregunta
            g.globalAlpha = a * 0.55; hominin(g, x, 880, 330, sp, standPose(t, 0), { color: '#5a4a3c' });
            g.globalAlpha = a; g.fillStyle = 'rgba(255,230,190,0.9)'; g.font = '700 120px Cinzel'; g.textAlign = 'center'; g.fillText('?', x, 560);
          } else {
            hominin(g, x + 4, 880, 330, sp, standPose(t + i, 0), { color: 'rgba(255,200,140,0.7)' });
            hominin(g, x, 880, 330, sp, standPose(t + i, 0), { color: '#17110d' });
          }
          g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = '#fff1d8'; g.font = '600 36px Montserrat'; g.fillText(name, x, 950);
          g.font = '400 23px Montserrat'; g.fillStyle = 'rgba(235,220,200,0.85)'; g.fillText(sub, x, 990);
          g.restore();
        });
        g.save(); g.textAlign = 'center'; g.fillStyle = '#fff1d8'; g.font = '600 36px Montserrat'; g.globalAlpha = smooth(0, 1, t);
        g.fillText('Varias especies humanas convivieron', W / 2, 90); g.restore();
      }],
    ]);
  },
};

// ===== HOMO SAPIENS =====
SCENES.sapiens = {
  init() {
    once('sap', () => ({
      far: ridgeLayer({ seed: 91, base: 760, amp: 140, freq: 0.002, top: [120, 80, 90], bot: [110, 72, 84] }),
      ridge: ridgeLayer({ seed: 93, base: 930, amp: 120, freq: 0.0012, top: [30, 18, 20], bot: [16, 10, 12] }),
      wall: (() => { // pared de cueva
        const c = mkCanvas(W, H), g = c.getContext('2d'); const id = g.createImageData(W, H); const n = makeNoise(5), n2 = makeNoise(6);
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
          const v = fbm(n, x * 0.004 + fbm(n2, y * 0.004, 3) * 2.5, 5) * 0.7 + fbm(n2, x * 0.03 + y * 0.002, 3) * 0.3;
          const r = 120 + 80 * v, gg = 88 + 60 * v, b = 62 + 40 * v;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const o = ((y + dy) * W + x + dx) * 4; id.data[o] = r; id.data[o + 1] = gg; id.data[o + 2] = b; id.data[o + 3] = 255; }
        }
        g.putImageData(id, 0, 0); return c;
      })(),
      hands: (() => { // plantillas de manos (negativo con pigmento soplado)
        const c = mkCanvas(W, H), g = c.getContext('2d'); const r = mulberry32(8);
        const spots = [[300, 330, -0.3], [470, 280, 0.2], [1640, 360, 0.4], [1500, 760, -0.2]];
        for (const [x, y] of spots) for (let i = 0; i < 2600; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 150; g.fillStyle = `rgba(140,30,15,${0.2 + 0.25 * r()})`; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 1.1, 4, 4); }
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        for (const [x, y, a] of spots) {
          g.save(); g.translate(x, y + 30); g.rotate(a); ell(g, 0, 0, 48, 58);
          [[-46, -20, -0.7, 70], [-26, -58, -0.2, 95], [0, -64, 0, 105], [24, -58, 0.18, 95], [44, -42, 0.4, 72]].forEach(([fx, fy, fa, fl]) => { g.save(); g.translate(fx, fy); g.rotate(fa); g.fillRect(-11, -fl * 0.7, 22, fl * 0.75); ell(g, 0, -fl * 0.7, 11, 11); g.restore(); });
          g.fillRect(-30, 40, 60, 90); g.restore();
        }
        return c;
      })(),
      field: ridgeLayer({ seed: 95, base: 820, amp: 40, freq: 0.003, top: [120, 70, 60], bot: [100, 60, 50] }),
    }));
  },
  draw(g, lt, sc) {
    const L = sc.L, C = cache.sap;
    const mapT = L[0].s + 5.4, caveT = L[2].s - 0.2, farmT = L[2].s + 4.5;
    shots(g, lt, [
      [0, (g, t) => {
        skyGradient(g, [[0, [40, 40, 80]], [0.45, [200, 110, 90]], [0.75, [255, 180, 110]], [1, [255, 210, 150]]]);
        const sx = W * 0.62, sy = 860 - t * 20; glow(g, sx, sy, 900, [255, 180, 110], 0.6); glow(g, sx, sy, 110, [255, 245, 220], 1);
        for (let i = 0; i < 4; i++) { const cs = cloudSprite(100 + i, 900, 220, [255, 190, 170]); g.drawImage(cs, ((i * 560 - t * 12) % (W + 900) + W + 900) % (W + 900) - 700, 140 + 80 * hash(i, 4)); }
        drawLayer(g, C.far, 200 + t * 6);
        fogBand(g, 640, 880, [255, 190, 150], 0.4);
        drawLayer(g, C.ridge, 400 + t * 15);
        const gy = C.ridge.y(400 + t * 15 + 900) + 10;
        const pose = (k, i) => (i === 1 ? standPose(t + i, -0.05) : walkPose(t * 3.2 + i * 1.8, 0.8));
        const people = [[760, 1, 205], [900, 1, 215], [1010, 1, 130], [1140, 1, 210]];
        people.forEach(([x, dir, s], i) => { const xx = x + t * (i === 1 ? 0 : 14); const yy = C.ridge.y(400 + t * 15 + xx) + 8; hominin(g, xx, yy, s, 'sapiens', pose(t, i), { color: '#120a0a', holdA: i === 0 ? holdSpear(g, 2.0) : null }); });
        lowerThird(g, t, 1.8, mapT - 0.4, 'Homo sapiens', 'África · desde hace ~300 000 años');
      }],
      [mapT, (g, t, lt) => {
        const mv = mapView({ lon0: -172, lon1: 182, lat0: -60, lat1: 75 });
        const zz = 1.02 + 0.03 * Math.sin(t * 0.1);
        g.save(); zoomAt(g, W / 2, H / 2, zz);
        mapBase(g, t, mv);
        // áreas de neandertales y denisovanos
        const rg = smooth(L[1].s - mapT, L[1].s - mapT + 1.2, t);
        if (rg > 0) {
          g.save(); g.globalAlpha = rg;
          const P1 = mv.P(25, 46), P2 = mv.P(95, 45);
          let gr = g.createRadialGradient(P1[0], P1[1], 0, P1[0], P1[1], 230); gr.addColorStop(0, 'rgba(120,200,255,0.45)'); gr.addColorStop(1, 'rgba(120,200,255,0)'); g.fillStyle = gr; ell(g, P1[0], P1[1], 300, 140);
          gr = g.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], 230); gr.addColorStop(0, 'rgba(200,140,255,0.45)'); gr.addColorStop(1, 'rgba(200,140,255,0)'); g.fillStyle = gr; ell(g, P2[0], P2[1], 260, 150);
          g.restore();
          mapLabel(g, P1[0] - 210, P1[1] - 105, 'Neandertales', null, rg, [160, 215, 255]);
          mapLabel(g, P2[0] - 40, P2[1] - 100, 'Denisovanos', null, rg, [215, 175, 255]);
        }
        const col = [120, 230, 210], k = (a, b) => ease(smooth(a, b, t));
        const AF = [30, 0];
        migration(g, mv, [[-8, 31.5], [5, 22], [25, 10], AF], k(0, 1.5), [255, 210, 120], 3);
        migration(g, mv, [AF, [40, 12], [48, 18], [55, 25]], k(1, 2.6), col);
        migration(g, mv, [[55, 25], [70, 22], [85, 22], [100, 12], [110, 0], [125, -10], [135, -22]], k(2.4, 5.2), col);
        migration(g, mv, [[55, 25], [40, 33], [30, 40], [15, 46], [2, 48]], k(3.2, 5.5), col);
        migration(g, mv, [[85, 22], [95, 40], [120, 55], [150, 62], [170, 65], [182, 66]], k(4.6, 7), col);
        migration(g, mv, [[-172, 66], [-160, 64], [-140, 58], [-122, 45], [-102, 24], [-80, 5], [-70, -20], [-68, -45]], k(7, 10), col);
        const jb = mv.P(-8, 31.5);
        mapLabel(g, jb[0] - 30, jb[1] - 30, 'Jebel Irhoud', '~300 000 años', smooth(0.3, 1, t), [255, 220, 150], 'right');
        mapLabel(g, mv.P(135, -22)[0] + 20, mv.P(135, -22)[1] + 10, 'Australia', '~50 000 – 65 000 años', smooth(4.8, 5.6, t));
        mapLabel(g, mv.P(2, 48)[0] - 30, mv.P(2, 48)[1] - 30, 'Europa', '~45 000 años', smooth(5.2, 6, t), undefined, 'right');
        mapLabel(g, mv.P(-100, 25)[0] - 30, mv.P(-100, 25)[1] + 6, 'América', 'hace más de 15 000 años', smooth(8, 8.8, t), undefined, 'right');
        g.restore();
        const ta = smooth(L[1].s - mapT + 4, L[1].s - mapT + 5, t);
        g.save(); g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 12;
        g.fillStyle = '#fff1d8'; g.font = '600 36px Montserrat'; g.fillText('La expansión de Homo sapiens', W / 2, 70);
        if (ta > 0) { g.globalAlpha = ta; g.font = '500 28px Montserrat'; g.fillStyle = '#eaf6ff'; g.fillText('Las personas con ancestros fuera de África llevan ~1–2 % de ADN neandertal', W / 2, H - 60); }
        g.restore();
      }],
      [caveT, (g, t) => {
        g.save(); zoomAt(g, W / 2, H / 2, 1.04 + t * 0.01);
        g.drawImage(C.wall, 0, 0);
        // pinturas que aparecen
        const paint = (i) => smooth(0.4 + i * 0.6, 1.6 + i * 0.6, t);
        const art = [
          (b) => b.drawImage(C.hands, 0, 0),
          (b) => mammoth(b, 760, 600, 95, 0, { color: '#6a1d10', dir: 1, speed: 0, tusk: '#3c140a' }),
          (b) => earlyHorse(b, 1250, 520, 260, 0.3, { color: '#2a120a', speed: 0 }),
          (b) => earlyHorse(b, 1140, 900, 220, 1.1, { color: '#7a2a12', speed: 0, dir: -1 }),
        ];
        art.forEach((fn, i) => {
          const a = paint(i); if (a <= 0) return;
          const c = renderToBuffer(fn);
          g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = (i ? 0.8 : 1) * a; g.drawImage(c, 0, 0); g.restore();
        });
        g.restore();
        // luz de antorcha
        const fl = 0.85 + 0.1 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23);
        const gr = g.createRadialGradient(W * 0.45, H * 0.95, 50, W * 0.45, H * 0.8, W * 0.75);
        gr.addColorStop(0, `rgba(255,170,90,${0.0})`); gr.addColorStop(0.5, `rgba(20,8,4,${0.45 / fl})`); gr.addColorStop(1, 'rgba(0,0,0,0.92)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        glow(g, W * 0.45, H * 1.02, 700 * fl, [255, 130, 50], 0.35);
        fire(g, W * 0.45, H + 30, 60, t, 1);
      }],
      [farmT, (g, t) => {
        skyGradient(g, [[0, [60, 60, 100]], [0.5, [230, 140, 90]], [0.75, [255, 190, 110]], [1, [255, 210, 140]]]);
        const sx = W * 0.3, sy = 700; glow(g, sx, sy, 800, [255, 190, 110], 0.6); glow(g, sx, sy, 90, [255, 245, 220], 1);
        drawLayer(g, C.field, 100 + t * 8);
        // aldea de chozas redondas con humo
        for (let i = 0; i < 6; i++) {
          const x = 1050 + i * 120 - t * 4, y = 800 + (i % 2) * 10, s = 1 - (i % 3) * 0.1;
          g.fillStyle = '#3a2418'; g.fillRect(x - 40 * s, y - 50 * s, 80 * s, 50 * s);
          g.beginPath(); g.moveTo(x - 58 * s, y - 45 * s); g.lineTo(x, y - 110 * s); g.lineTo(x + 58 * s, y - 45 * s); g.fill();
          if (i % 2 === 0) for (let k = 0; k < 6; k++) { const q = (t * 0.15 + k / 6) % 1; const cs = cloudSprite(120, 160, 80, [200, 180, 170]); g.globalAlpha = 0.5 * (1 - q); g.drawImage(cs, x - 40 + q * 120, y - 140 * s - q * 260, 160 * (0.5 + q), 80 * (0.5 + q)); g.globalAlpha = 1; }
        }
        // campo de cereal
        const gg = g.createLinearGradient(0, 820, 0, H); gg.addColorStop(0, '#a87a3a'); gg.addColorStop(1, '#4a3016'); g.fillStyle = gg; g.fillRect(0, 830, W, H);
        g.strokeStyle = 'rgba(230,180,90,0.9)'; g.lineCap = 'round';
        for (let i = 0; i < 520; i++) {
          const x = hash(i, 1) * W, row = hash(i, 2), y = 840 + row * row * 260, h = 30 + row * 140;
          const sw = Math.sin(t * 1.6 + x * 0.006) * (0.15 + row * 0.1);
          g.lineWidth = 1 + row * 3; g.strokeStyle = rgb(mixc([200, 150, 80], [120, 80, 30], row), 0.9);
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + sw * h * 0.3, y - h * 0.6, x + sw * h, y - h); g.stroke();
          g.fillStyle = rgb(mixc([255, 210, 120], [180, 120, 50], row)); ell(g, x + sw * h, y - h, 2 + row * 4, 6 + row * 12, sw);
        }
        hominin(g, 600, 990, 210, 'sapiens', { ...standPose(t), lean: 0.7 + 0.1 * Math.sin(t * 2), arA: 0.6, elA: 0.6, arB: 0.4, elB: 0.5 }, { color: '#1e120a' });
        hominin(g, 380, 1010, 225, 'sapiens', walkPose(t * 3, 0.7), { color: '#1e120a' });
        lowerThird(g, t, 1.2, sc.dur - farmT - 0.4, 'Agricultura', 'Hace ~12 000 años · Creciente Fértil y otras regiones del mundo');
      }],
    ]);
  },
};

// ===== HOY =====
SCENES.hoy = {
  draw(g, lt, sc) {
    const L = sc.L;
    shots(g, lt, [
      [0, (g, t) => {
        g.fillStyle = '#010205'; g.fillRect(0, 0, W, H);
        stars(g, t, 31, 900, 0.9);
        const R = 470 + t * 4;
        drawGlobe(g, W * 0.5, H * 0.52, R, -0.3 + t * 0.03, 0.42, 'night', 0.97);
        lowerThird(g, t, 1.5, L[1].s - 0.5, 'Una sola especie humana', 'Homo sapiens · más de 8 000 millones de personas');
      }],
      [L[1].s - 0.4, (g, t) => { drawLifeTree(g, t, sc.dur - L[1].s + 15); }],
    ], 1.2);
  },
};
function drawLifeTree(g, t, total) {
  const gr = g.createRadialGradient(W / 2, H * 0.9, 50, W / 2, H * 0.6, W * 0.8);
  gr.addColorStop(0, '#1f1a12'); gr.addColorStop(1, '#040302'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  embers(g, W / 2, H + 20, W, H + 60, t * 0.4, 90, 44, [255, 210, 140]);
  const grow = 0.15 + 0.85 * ease(clamp(t / 7));
  g.lineCap = 'round';
  let human = null;
  const rec = (x, y, a, len, depth, id) => {
    if (depth > 9) return;
    const k = clamp(grow * 10 - depth); if (k <= 0) return;
    const sw = 0.03 * Math.sin(t * 0.6 + id);
    const ex = x + Math.sin(a + sw) * len * k, ey = y - Math.cos(a + sw) * len * k;
    g.strokeStyle = `rgba(255,${200 + depth * 4},${120 + depth * 10},${0.9 - depth * 0.06})`; g.lineWidth = Math.max(1, 16 - depth * 1.7);
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    if (k < 1) return;
    const n = depth < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const h = hash(id * 3 + i, 77);
      const na = a + (i - (n - 1) / 2) * (0.5 + 0.3 * h) + (h - 0.5) * 0.2;
      rec(ex, ey, na, len * (0.68 + 0.12 * h), depth + 1, id * 3 + i + 1);
    }
    if (depth === 9 && id % 37 === 5 && !human) human = [ex, ey];
    if (depth >= 8) { g.fillStyle = 'rgba(255,230,170,0.6)'; ell(g, ex, ey, 2.5, 2.5); }
  };
  rec(W / 2, H + 10, 0, 230, 0, 1);
  if (human) { const a = smooth(5, 7, t); glow(g, human[0], human[1], 60, [255, 240, 200], a); }
}

// ===== CIERRE =====
SCENES.outro = {
  draw(g, lt, sc) {
    drawLifeTree(g, lt + 20, 30);
    g.fillStyle = `rgba(0,0,0,${0.68 + 0.32 * smooth(sc.dur - 2.5, sc.dur, lt)})`; g.fillRect(0, 0, W, H);
    const a = fadeInOut(lt, 0.6, sc.dur - 0.8, 1.2, 1.6);
    g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = '#f7ead2'; g.shadowColor = 'rgba(255,190,120,0.45)'; g.shadowBlur = 24;
    g.font = '700 96px Cinzel'; spacedText(g, 'LA RAMA HUMANA', W / 2, 360, 14);
    g.shadowBlur = 0; g.font = '400 27px Montserrat'; g.fillStyle = 'rgba(240,228,205,0.9)';
    const lines = ['Documental animado original · generado íntegramente con herramientas libres',
      'Narración: voz sintética neuronal Piper (es_MX) · Animación, música y sonido: generados por código',
      'Datos cartográficos: Natural Earth (dominio público) · Tipografías: Cinzel y Montserrat (OFL)',
      'Las fechas son aproximadas y reflejan el consenso científico actual; las ilustraciones son interpretativas.'];
    const b = fadeInOut(lt, 2.0, sc.dur - 0.8, 1.2, 1.6); g.globalAlpha = b;
    lines.forEach((l, i) => g.fillText(l, W / 2, 520 + i * 52));
    g.restore();
  },
};
