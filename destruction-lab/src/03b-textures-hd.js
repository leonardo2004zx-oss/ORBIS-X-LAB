/* ------------------------------------------------------------------ HD procedural textures (enhanced graphics) */
// Every facade is painted on several layers at once: color, height (→ normal map), roughness/metalness
// (packed in one texture: G = roughness, B = metalness, as three.js reads them) and window glow.
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function noiseCanvas(w, h, oct = 4, seed = 1) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let o = 0; o < oct; o++) {
    const n = 4 << o, t = mkCanvas(n, n), tg = t.getContext('2d'), img = tg.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = r() * 255; img.data.set([v, v, v, 255], i * 4); }
    tg.putImageData(img, 0, 0);
    g.globalAlpha = 0.55 / (o + 1); g.imageSmoothingEnabled = true; g.drawImage(t, 0, 0, w, h);
  }
  g.globalAlpha = 1;
  return c;
}
function heightToNormal(hc, strength = 2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h), og = out.getContext('2d'), img = og.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    img.data.set([(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * w + x) * 4);
  }
  og.putImageData(img, 0, 0);
  return out;
}
class Painter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.col = mkCanvas(w, h); this.hei = mkCanvas(w, h); this.rou = mkCanvas(w, h); this.met = mkCanvas(w, h); this.glo = mkCanvas(w, h);
    this.c = this.col.getContext('2d'); this.he = this.hei.getContext('2d'); this.ro = this.rou.getContext('2d'); this.me = this.met.getContext('2d'); this.gl = this.glo.getContext('2d');
    this.he.fillStyle = '#808080'; this.he.fillRect(0, 0, w, h);
    this.gl.fillStyle = '#000'; this.gl.fillRect(0, 0, w, h);
  }
  // p: { c: color | gradient fn, h: 0..1 height, r: roughness 0..1, m: metalness 0..1, g: glow css }
  rect(x, y, w, h, p) {
    if (p.c) { this.c.fillStyle = typeof p.c === 'function' ? p.c(this.c, x, y, w, h) : p.c; this.c.fillRect(x, y, w, h); }
    if (p.h !== undefined) { const v = Math.round(p.h * 255); this.he.fillStyle = `rgb(${v},${v},${v})`; this.he.fillRect(x, y, w, h); }
    if (p.r !== undefined) { const v = Math.round(p.r * 255); this.ro.fillStyle = `rgb(${v},${v},${v})`; this.ro.fillRect(x, y, w, h); }
    if (p.m !== undefined) { const v = Math.round(p.m * 255); this.me.fillStyle = `rgb(${v},${v},${v})`; this.me.fillRect(x, y, w, h); }
    if (p.g) { this.gl.fillStyle = typeof p.g === 'function' ? p.g(this.gl, x, y, w, h) : p.g; this.gl.fillRect(x, y, w, h); }
  }
  grime(alpha = 0.18, seed = 3) { // stains and rain streaks multiply the color
    const n = noiseCanvas(this.w, this.h, 4, seed);
    this.c.globalCompositeOperation = 'multiply'; this.c.globalAlpha = alpha; this.c.drawImage(n, 0, 0); this.c.globalAlpha = 1; this.c.globalCompositeOperation = 'source-over';
    const hn = noiseCanvas(this.w, this.h, 3, seed + 7);
    this.he.globalAlpha = 0.12; this.he.drawImage(hn, 0, 0); this.he.globalAlpha = 1;
  }
  streaks(x0, x1, y0, alpha = 0.12) {
    this.c.fillStyle = `rgba(40,35,30,${alpha})`;
    for (let x = x0; x < x1; x += 3 + Math.random() * 5) this.c.fillRect(x, y0, 1 + Math.random() * 2, 10 + Math.random() * 30);
  }
  textures(normalStrength = 2.5) {
    const orm = mkCanvas(this.w, this.h), og = orm.getContext('2d'), img = og.createImageData(this.w, this.h);
    const r = this.ro.getImageData(0, 0, this.w, this.h).data, m = this.me.getImageData(0, 0, this.w, this.h).data;
    for (let i = 0; i < this.w * this.h; i++) img.data.set([255, r[i * 4], m[i * 4], 255], i * 4);
    og.putImageData(img, 0, 0);
    const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    return { map: T(this.col, true), normalMap: T(heightToNormal(this.hei, normalStrength)), orm: T(orm), glow: T(this.glo, true) };
  }
}
const glassGrad = (top, bot) => (g, x, y, w, h) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, top); gr.addColorStop(1, bot); return gr; };
const roomGlow = (g, x, y, w, h) => { const gr = g.createRadialGradient(x + w * 0.5, y + h * 0.25, 2, x + w * 0.5, y + h * 0.5, Math.max(w, h)); gr.addColorStop(0, '#fff2cf'); gr.addColorStop(0.6, '#e8b56a'); gr.addColorStop(1, '#6a4320'); return gr; };
// cell = one block face: 2 m wide × 3 m tall
const FW = 128, FH = 192;
function facadeConcrete() {
  const p = new Painter(FW, FH);
  p.rect(0, 0, FW, FH, { c: '#d9d4cb', h: 0.55, r: 0.88, m: 0 });
  p.rect(0, FH - 22, FW, 22, { c: '#c8c1b6', h: 0.7 });            // floor slab band
  p.rect(0, FH - 22, FW, 2, { c: '#a59d91', h: 0.4 });
  p.rect(14, 30, FW - 28, 124, { c: '#7d776e', h: 0.2, r: 0.5, m: 0.6 }); // aluminium frame
  p.rect(18, 34, FW - 36, 116, { c: glassGrad('#4f6d88', '#1d2c3a'), h: 0.15, r: 0.05, m: 0.35, g: roomGlow });
  p.rect(FW / 2 - 2, 34, 4, 116, { c: '#7d776e', h: 0.25, r: 0.5, m: 0.6, g: '#000' });
  p.rect(18, 92, FW - 36, 3, { c: '#7d776e', h: 0.25, r: 0.5, m: 0.6, g: '#000' });
  p.rect(10, 154, FW - 20, 6, { c: '#e6e1d8', h: 0.85, r: 0.8 });   // sill
  p.grime(0.22, 11); p.streaks(14, FW - 14, 160, 0.1);
  return p.textures(3);
}
function facadeGlass() {
  const p = new Painter(FW, FH);
  p.rect(0, 0, FW, FH, { c: glassGrad('#7e9db2', '#3b5468'), h: 0.3, r: 0.05, m: 0.45, g: roomGlow });
  p.rect(0, FH - 34, FW, 34, { c: '#38424c', h: 0.35, r: 0.35, m: 0.8, g: '#000' });   // spandrel panel
  for (const x of [0, FW / 2 - 2, FW - 4]) p.rect(x, 0, 4, FH, { c: '#9aa3ab', h: 0.75, r: 0.3, m: 0.9, g: '#000' }); // mullions
  p.rect(0, FH - 36, FW, 3, { c: '#9aa3ab', h: 0.75, r: 0.3, m: 0.9, g: '#000' });
  p.rect(0, 0, FW, 3, { c: '#9aa3ab', h: 0.75, r: 0.3, m: 0.9, g: '#000' });
  return p.textures(2);
}
function facadeBrick() {
  const p = new Painter(FW, FH);
  p.rect(0, 0, FW, FH, { c: '#8a8077', h: 0.35, r: 0.95, m: 0 });           // mortar
  for (let y = 0, row = 0; y < FH; y += 8, row++) for (let x = row % 2 ? -10 : 0; x < FW; x += 20) {
    const v = 0.8 + Math.random() * 0.35;
    p.rect(x + 1, y + 1, 18, 6, { c: `rgb(${150 * v | 0},${68 * v | 0},${48 * v | 0})`, h: 0.62 + Math.random() * 0.06, r: 0.85 });
  }
  p.rect(30, 34, 68, 8, { c: '#c9bfae', h: 0.8, r: 0.7 });          // lintel
  p.rect(32, 42, 64, 104, { c: '#efeae0', h: 0.55, r: 0.5 });        // white frame
  p.rect(37, 47, 54, 94, { c: glassGrad('#3e5466', '#17222c'), h: 0.2, r: 0.06, m: 0.3, g: roomGlow });
  p.rect(62, 47, 4, 94, { c: '#efeae0', h: 0.55, r: 0.5, g: '#000' });
  p.rect(37, 92, 54, 3, { c: '#efeae0', h: 0.55, r: 0.5, g: '#000' });
  p.rect(28, 146, 72, 7, { c: '#cfc6b6', h: 0.85, r: 0.75 });         // sill
  p.grime(0.16, 21);
  return p.textures(4);
}
function facadeMetal() {
  const p = new Painter(FW, FH);
  for (let x = 0; x < FW; x += 8) {
    p.rect(x, 0, 4, FH, { c: '#8d969d', h: 0.7, r: 0.35, m: 0.85 });
    p.rect(x + 4, 0, 4, FH, { c: '#7a838a', h: 0.4, r: 0.4, m: 0.85 });
  }
  p.rect(0, 64, FW, 64, { c: '#5b636a', h: 0.5, r: 0.3, m: 0.9 });                     // ribbon window frame
  p.rect(0, 70, FW, 52, { c: glassGrad('#55748c', '#1f2f3c'), h: 0.25, r: 0.04, m: 0.6, g: roomGlow });
  for (const x of [0, 42, 85, FW - 3]) p.rect(x, 70, 3, 52, { c: '#5b636a', h: 0.55, r: 0.3, m: 0.9, g: '#000' });
  p.grime(0.12, 31);
  return p.textures(3);
}
function facadeStone() {
  const p = new Painter(FW, FH);
  p.rect(0, 0, FW, FH, { c: '#cdbf9f', h: 0.5, r: 0.8, m: 0 });
  for (let y = 0; y < FH; y += 24) p.rect(0, y, FW, 2, { c: '#a8997a', h: 0.3 });
  p.rect(0, 0, 14, FH, { c: '#d8cbac', h: 0.8 }); p.rect(FW - 14, 0, 14, FH, { c: '#d8cbac', h: 0.8 });   // pilasters
  for (const x of [26, 70]) {
    p.rect(x - 3, 26, 38, 136, { c: '#5f5a50', h: 0.3, r: 0.5, m: 0.5 });
    p.rect(x, 30, 32, 128, { c: glassGrad('#4a5d6c', '#1a242e'), h: 0.15, r: 0.06, m: 0.3, g: roomGlow });
    p.rect(x, 90, 32, 3, { c: '#5f5a50', h: 0.3, r: 0.5, m: 0.5, g: '#000' });
  }
  p.grime(0.2, 41); p.streaks(20, FW - 20, 162, 0.08);
  return p.textures(3);
}
function roofHD() {
  const p = new Painter(128, 128);
  p.rect(0, 0, 128, 128, { c: '#8d8a84', h: 0.5, r: 0.95, m: 0 });
  const n = noiseCanvas(128, 128, 5, 51);
  p.c.globalCompositeOperation = 'multiply'; p.c.globalAlpha = 0.35; p.c.drawImage(n, 0, 0); p.c.globalAlpha = 1; p.c.globalCompositeOperation = 'source-over';
  p.he.globalAlpha = 0.5; p.he.drawImage(n, 0, 0); p.he.globalAlpha = 1;
  p.rect(0, 0, 128, 6, { c: '#b9b4ab', h: 0.9 }); p.rect(0, 122, 128, 6, { c: '#b9b4ab', h: 0.9 });
  p.rect(0, 0, 6, 128, { c: '#b9b4ab', h: 0.9 }); p.rect(122, 0, 6, 128, { c: '#b9b4ab', h: 0.9 });
  return p.textures(5);
}
function debrisHD() {
  const p = new Painter(64, 64);
  p.rect(0, 0, 64, 64, { c: '#cfc9bf', h: 0.5, r: 0.95, m: 0 });
  const n = noiseCanvas(64, 64, 4, 61);
  p.c.globalCompositeOperation = 'multiply'; p.c.globalAlpha = 0.6; p.c.drawImage(n, 0, 0); p.c.globalAlpha = 1; p.c.globalCompositeOperation = 'source-over';
  p.he.drawImage(n, 0, 0);
  for (let i = 0; i < 4; i++) p.rect(Math.random() * 60, Math.random() * 60, 3, 3, { c: '#6e4a3a', h: 0.3 });
  return p.textures(5);
}
function asphaltHD() {
  const p = new Painter(256, 128);
  p.rect(0, 0, 256, 128, { c: '#3d3f43', h: 0.5, r: 0.88, m: 0 });
  const n = noiseCanvas(256, 128, 6, 71);
  p.c.globalCompositeOperation = 'multiply'; p.c.globalAlpha = 0.45; p.c.drawImage(n, 0, 0); p.c.globalAlpha = 1; p.c.globalCompositeOperation = 'source-over';
  p.he.globalAlpha = 0.7; p.he.drawImage(noiseCanvas(256, 128, 6, 72), 0, 0); p.he.globalAlpha = 1;
  for (let i = 0; i < 3; i++) p.rect(Math.random() * 230, 20 + Math.random() * 80, 20 + Math.random() * 30, 10 + Math.random() * 14, { c: 'rgba(30,31,34,0.55)', h: 0.48, r: 0.8 }); // patches
  p.c.strokeStyle = 'rgba(20,20,22,0.7)'; p.he.strokeStyle = '#3a3a3a'; p.c.lineWidth = p.he.lineWidth = 1;
  for (let i = 0; i < 6; i++) { let x = Math.random() * 256, y = Math.random() * 128; p.c.beginPath(); p.he.beginPath(); p.c.moveTo(x, y); p.he.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.random() * 24 - 12; y += Math.random() * 12 - 6; p.c.lineTo(x, y); p.he.lineTo(x, y); } p.c.stroke(); p.he.stroke(); }
  p.rect(0, 6, 256, 4, { c: '#e2ded2', h: 0.6, r: 0.6 }); p.rect(0, 118, 256, 4, { c: '#e2ded2', h: 0.6, r: 0.6 });
  for (let x = 0; x < 256; x += 64) p.rect(x + 8, 62, 36, 4, { c: '#e3b43b', h: 0.6, r: 0.6 });
  const t = p.textures(3);
  for (const k of ['map', 'normalMap', 'orm']) { t[k].wrapS = t[k].wrapT = THREE.RepeatWrapping; }
  return t;
}
function pavingHD() {
  const p = new Painter(128, 128);
  p.rect(0, 0, 128, 128, { c: '#8f8a82', h: 0.3, r: 0.9 });
  for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { const v = 0.95 + Math.random() * 0.07; p.rect(x + 1, y + 1, 30, 30, { c: `rgb(${190 * v | 0},${184 * v | 0},${174 * v | 0})`, h: 0.6, r: 0.82 }); }
  p.grime(0.25, 81);
  const t = p.textures(3);
  for (const k of ['map', 'normalMap', 'orm']) { t[k].wrapS = t[k].wrapT = THREE.RepeatWrapping; }
  return t;
}
function grassHD() {
  const p = new Painter(256, 256);
  p.rect(0, 0, 256, 256, { c: '#5f7f41', h: 0.5, r: 0.95 });
  const n = noiseCanvas(256, 256, 6, 91);
  p.c.globalCompositeOperation = 'overlay'; p.c.globalAlpha = 0.12; p.c.drawImage(n, 0, 0); p.c.globalAlpha = 1; p.c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 2500; i++) { const v = Math.random(); p.c.fillStyle = v < 0.5 ? 'rgba(40,70,25,0.35)' : 'rgba(150,170,90,0.25)'; p.c.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 2); }
  p.he.globalAlpha = 0.4; p.he.drawImage(noiseCanvas(256, 256, 6, 92), 0, 0); p.he.globalAlpha = 1;
  const t = p.textures(1.2);
  for (const k of ['map', 'normalMap', 'orm']) { t[k].wrapS = t[k].wrapT = THREE.RepeatWrapping; }
  return t;
}
