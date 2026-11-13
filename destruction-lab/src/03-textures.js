/* ------------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function speckle(g, w, h, n, a, light) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${Math.random() * a})` : `rgba(0,0,0,${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
const windowTex = canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = '#ece7de'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 260, 0.06, false);
  g.fillStyle = '#d2cbc0'; g.fillRect(0, 0, w, 7);
  g.fillStyle = '#8f897f'; g.fillRect(9, 20, 46, 60);
  const gr = g.createLinearGradient(0, 23, 0, 77);
  gr.addColorStop(0, '#355172'); gr.addColorStop(1, '#14212f');
  g.fillStyle = gr; g.fillRect(12, 23, 40, 54);
  g.fillStyle = 'rgba(190,220,250,0.22)';
  g.beginPath(); g.moveTo(12, 50); g.lineTo(34, 23); g.lineTo(44, 23); g.lineTo(12, 62); g.fill();
  g.fillStyle = '#8f897f'; g.fillRect(31, 23, 2, 54);
  g.fillStyle = '#c3bcb1'; g.fillRect(7, 80, 50, 4);
});
const roofTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#b9b3a9'; g.fillRect(0, 0, w, h); speckle(g, w, h, 400, 0.12, false); });
const debrisTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#d8d2c8'; g.fillRect(0, 0, w, h); speckle(g, w, h, 700, 0.25, false); speckle(g, w, h, 200, 0.2, true); });
const grassTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6d8a4c'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1600, 0.12, false); speckle(g, w, h, 600, 0.08, true); }, true);
grassTex.repeat.set(40, 40);
const plazaTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b7b1a6'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, 0.1, false);
  g.strokeStyle = 'rgba(60,55,50,0.25)'; g.lineWidth = 2;
  for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
}, true);
const streetTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#3c3f44'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.18, false); speckle(g, w, h, 700, 0.06, true);
  g.fillStyle = '#e9e5da'; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
  g.fillStyle = '#e8b93a'; for (let x = 0; x < w; x += 64) g.fillRect(x + 8, h / 2 - 2, 36, 4);
}, true);
const craterTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(20,14,10,0.95)'); r.addColorStop(0.45, 'rgba(38,28,20,0.85)'); r.addColorStop(0.7, 'rgba(60,45,32,0.45)'); r.addColorStop(1, 'rgba(60,45,32,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
craterTex.colorSpace = THREE.SRGBColorSpace;
const glowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.25, 'rgba(255,170,80,0.8)'); r.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

// window glow maps used at night (white = lit glass)
const windowGlow = canvasTex(64, 96, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 96);
  g.fillStyle = '#ffd9a0'; g.fillRect(12, 23, 19, 54); g.fillRect(33, 23, 19, 54);
});
const glassTex = canvasTex(64, 96, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#6f8fa8'); gr.addColorStop(0.5, '#3d5a73'); gr.addColorStop(1, '#5d7e96');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(220,235,250,0.18)'; g.beginPath(); g.moveTo(0, 60); g.lineTo(40, 0); g.lineTo(58, 0); g.lineTo(0, 84); g.fill();
  g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, w, 4); g.fillRect(0, 46, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(31, 0, 2, h);
});
const glassGlow = canvasTex(64, 96, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 96);
  g.fillStyle = '#8a9cb4'; g.fillRect(4, 6, 26, 38); g.fillStyle = '#c9a878'; g.fillRect(34, 50, 28, 42);
});
const brickTex = canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = '#9a4d36'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? -8 : 0; x < w; x += 16) { g.fillStyle = `rgb(${130 + Math.random() * 40 | 0},${60 + Math.random() * 20 | 0},${44 + Math.random() * 14 | 0})`; g.fillRect(x + 1, y + 1, 14, 4); }
  g.fillStyle = '#e8e0d0'; g.fillRect(16, 26, 32, 44);
  g.fillStyle = '#22303c'; g.fillRect(19, 29, 26, 38);
  g.fillStyle = '#e8e0d0'; g.fillRect(31, 29, 2, 38); g.fillRect(19, 47, 26, 2); g.fillRect(14, 70, 36, 4);
});
const brickGlow = canvasTex(64, 96, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 96); g.fillStyle = '#ffcf8a'; g.fillRect(19, 29, 12, 18); g.fillRect(33, 49, 12, 18); });
const plainTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#e4e1dc'; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, 0.12, false); });
const mudTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#4c4232'; g.fillRect(0, 0, w, h); speckle(g, w, h, 600, 0.25, false); }, true);
const wallTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#9b968c'; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, 0.15, false); g.fillStyle = 'rgba(0,0,0,0.15)'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h); }, true);
