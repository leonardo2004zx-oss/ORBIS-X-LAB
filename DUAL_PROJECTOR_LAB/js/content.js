/* DUAL PROJECTOR LAB — generación de contenido (imágenes panorámicas y patrones)
 * Todo se dibuja con Canvas 2D: no se descargan imágenes externas.
 * El lienzo fuente representa la imagen COMPLETA de la pantalla gigante:
 * ancho = (2 - superposición) × ancho de un proyector.
 */
(function () {
  'use strict';

  // Generador pseudoaleatorio con semilla (para que la escena sea siempre igual)
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Ruido 1D suave basado en senos (continuo en todo el panorama)
  function ridge(x, seed, amp) {
    return amp * (
      0.50 * Math.sin(x * 1.3 + seed) +
      0.25 * Math.sin(x * 2.9 + seed * 1.7) +
      0.15 * Math.sin(x * 6.1 + seed * 2.3) +
      0.07 * Math.sin(x * 13.7 + seed * 3.1) +
      0.03 * Math.sin(x * 29.3 + seed * 0.7)
    );
  }

  /* ---------- Panorama 1: atardecer en la montaña ---------- */
  function drawSunset(ctx, W, H) {
    const U = H; // unidad = alto
    // cielo
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#0d1b4c');
    sky.addColorStop(0.35, '#4b2a7a');
    sky.addColorStop(0.65, '#d4566b');
    sky.addColorStop(0.88, '#f7a35c');
    sky.addColorStop(1, '#ffd98a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // sol (ubicado a la derecha: así la imagen no es simétrica)
    const sx = W * 0.68, sy = H * 0.53;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, U * 0.55);
    glow.addColorStop(0, 'rgba(255,240,190,1)');
    glow.addColorStop(0.12, 'rgba(255,214,140,0.9)');
    glow.addColorStop(0.4, 'rgba(255,150,90,0.25)');
    glow.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff4d2';
    ctx.beginPath(); ctx.arc(sx, sy, U * 0.06, 0, Math.PI * 2); ctx.fill();

    // estrellas en la parte alta
    const r = rng(7);
    for (let i = 0; i < W / 6; i++) {
      const x = r() * W, y = r() * H * 0.25;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) * (1 - y / (H * 0.25)) + ')';
      ctx.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    // nubes
    for (let i = 0; i < 14; i++) {
      const cx = r() * W, cy = H * (0.15 + r() * 0.25), cw = U * (0.3 + r() * 0.6);
      ctx.fillStyle = 'rgba(255,170,150,' + (0.08 + r() * 0.12) + ')';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + (k - 2) * cw * 0.2, cy + Math.sin(k) * U * 0.01, cw * 0.25, U * 0.025, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // capas de montañas
    const layers = [
      { base: 0.50, amp: 0.10, freq: 2.2, seed: 1, color: '#6b3f6e' },
      { base: 0.56, amp: 0.09, freq: 3.4, seed: 4, color: '#4a2a55' },
      { base: 0.62, amp: 0.06, freq: 5.0, seed: 9, color: '#2b1838' }
    ];
    layers.forEach(function (L) {
      ctx.fillStyle = L.color;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) {
        const y = H * L.base - U * Math.abs(ridge(x / U * L.freq, L.seed, L.amp * 1.6));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    });

    // lago
    const lakeTop = H * 0.66;
    const lake = ctx.createLinearGradient(0, lakeTop, 0, H);
    lake.addColorStop(0, '#e98a6a'); lake.addColorStop(0.3, '#7a3f62'); lake.addColorStop(1, '#140c24');
    ctx.fillStyle = lake; ctx.fillRect(0, lakeTop, W, H - lakeTop);
    // reflejo del sol
    for (let i = 0; i < 26; i++) {
      const y = lakeTop + i * (H - lakeTop) / 26;
      const w = U * (0.02 + i * 0.006) * (0.6 + r() * 0.8);
      ctx.fillStyle = 'rgba(255,220,160,' + (0.5 - i * 0.017) + ')';
      ctx.fillRect(sx - w / 2 + (r() - 0.5) * U * 0.02, y, w, Math.max(1, U * 0.004));
    }
    // orilla con pinos
    ctx.fillStyle = '#0b0714';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, H * 0.86 - U * Math.abs(ridge(x / U * 3, 21, 0.03)));
    ctx.lineTo(W, H); ctx.fill();
    for (let x = 0; x < W; x += U * 0.03 * (0.5 + r())) {
      const base = H * 0.86 - U * Math.abs(ridge(x / U * 3, 21, 0.03));
      const h = U * (0.05 + r() * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, base - h); ctx.lineTo(x - h * 0.22, base + 2); ctx.lineTo(x + h * 0.22, base + 2);
      ctx.fill();
    }
  }

  /* ---------- Panorama 2: ciudad nocturna ---------- */
  function drawCity(ctx, W, H) {
    const U = H;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#020615'); sky.addColorStop(0.55, '#0c2148'); sky.addColorStop(0.75, '#28406e'); sky.addColorStop(1, '#05070d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const r = rng(42);
    for (let i = 0; i < W / 4; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + r() * 0.7 + ')';
      ctx.fillRect(r() * W, r() * H * 0.5, 1.2, 1.2);
    }
    // luna a la izquierda
    const mx = W * 0.18, my = H * 0.2;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, U * 0.25);
    g.addColorStop(0, 'rgba(220,230,255,0.5)'); g.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eef2ff'; ctx.beginPath(); ctx.arc(mx, my, U * 0.045, 0, Math.PI * 2); ctx.fill();

    // edificios en 2 capas
    [[0.55, '#0d1630', 0.6], [0.72, '#060a18', 1]].forEach(function (lay, li) {
      let x = 0;
      while (x < W) {
        const bw = U * (0.04 + r() * 0.1);
        const bh = U * (0.12 + r() * (li ? 0.45 : 0.3)) * (0.6 + 0.4 * Math.abs(Math.sin(x / W * 5 + li)));
        const top = H * lay[0] + (li ? U * 0.18 : 0) - bh;
        ctx.fillStyle = lay[1];
        ctx.fillRect(x, top, bw, H - top);
        // ventanas
        const cols = Math.max(2, Math.floor(bw / (U * 0.012)));
        const rows = Math.floor(bh / (U * 0.018));
        for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
          if (r() < 0.35 * lay[2]) {
            const warm = r() < 0.7;
            ctx.fillStyle = warm ? 'rgba(255,200,110,' + (0.5 + r() * 0.5) + ')' : 'rgba(140,200,255,' + (0.5 + r() * 0.5) + ')';
            ctx.fillRect(x + 3 + cx * (bw - 6) / cols, top + 4 + cy * U * 0.018, (bw - 6) / cols * 0.55, U * 0.008);
          }
        }
        if (r() < 0.15) { // antena con luz roja
          ctx.fillStyle = '#ff3355'; ctx.fillRect(x + bw / 2, top - U * 0.03, 2, U * 0.03);
        }
        x += bw + U * 0.004;
      }
    });
    // autopista con estelas de luz
    const roadY = H * 0.9;
    ctx.fillStyle = '#04050a'; ctx.fillRect(0, roadY - U * 0.02, W, H);
    for (let i = 0; i < 6; i++) {
      const y = roadY - U * 0.012 + i * U * 0.01;
      const grd = ctx.createLinearGradient(0, 0, W, 0);
      const c = i < 3 ? '255,60,60' : '255,240,200';
      for (let k = 0; k <= 10; k++) grd.addColorStop(k / 10, 'rgba(' + c + ',' + (0.2 + 0.6 * Math.abs(Math.sin(k * 1.7 + i))) + ')');
      ctx.fillStyle = grd; ctx.fillRect(0, y, W, Math.max(1, U * 0.003));
    }
  }

  /* ---------- Patrones de prueba ----------
   * Se dibujan en coordenadas de "píxeles de proyector" (1920 por proyector)
   * para que la grilla coincida con la resolución nominal de cada equipo. */
  function drawGrid(ctx, W, H, ov) {
    const T = 2 - ov;
    const pxPerProj = W / T;           // píxeles de lienzo por ancho de proyector
    const s = pxPerProj / 1920;        // escala píxel nominal -> lienzo
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
    // líneas cada 60 px nominales, gruesas cada 240
    for (let i = 0; i * 60 * s <= W + 1; i++) {
      const x = i * 60 * s, major = i % 4 === 0;
      ctx.fillStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
      ctx.fillRect(Math.round(x) - (major ? 1 : 0), 0, major ? 2 : 1, H);
    }
    for (let j = 0; j * 60 * s <= H + 1; j++) {
      const y = j * 60 * s, major = j % 4 === 0;
      ctx.fillStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, Math.round(y) - (major ? 1 : 0), W, major ? 2 : 1);
    }
    // diagonales a lo largo de TODO el panorama: si la unión está desalineada se "quiebran"
    ctx.lineWidth = Math.max(2, 3 * s);
    ctx.strokeStyle = '#ffd400';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, H); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
    ctx.strokeStyle = '#00e5ff';
    ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5); ctx.stroke();
    // círculos
    ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = Math.max(2, 4 * s);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, H * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, 2 * s);
    [0.5, 1.5 - ov].forEach(function (c) { // centro de cada proyector
      const x = c * pxPerProj;
      ctx.beginPath(); ctx.arc(x, H / 2, H * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 40 * s, H / 2); ctx.lineTo(x + 40 * s, H / 2); ctx.moveTo(x, H / 2 - 40 * s); ctx.lineTo(x, H / 2 + 40 * s); ctx.stroke();
    });
    // zona de superposición sombreada
    if (ov > 0.001) {
      const x0 = (1 - ov) * pxPerProj, x1 = pxPerProj;
      ctx.fillStyle = 'rgba(120,255,160,0.10)'; ctx.fillRect(x0, 0, x1 - x0, H);
      ctx.fillStyle = 'rgba(120,255,160,0.9)';
      ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    }
    // etiquetas
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(70 * s) + 'px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A ◀ IZQUIERDA', 0.45 * pxPerProj, H * 0.16);
    ctx.fillText('DERECHA ▶ B', (1.55 - ov) * pxPerProj, H * 0.16);
    ctx.font = Math.round(36 * s) + 'px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = 'rgba(160,255,190,1)';
    if (ov > 0.001) ctx.fillText('superposición ' + Math.round(ov * 1920) + ' px', (1 - ov / 2) * pxPerProj, H * 0.93);
    // números de columna (cada 240 px nominales)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = Math.round(26 * s) + 'px Consolas, monospace';
    for (let i = 0; i * 240 * s < W; i++) ctx.fillText(String(i + 1), i * 240 * s + 120 * s, H * 0.06 + (i % 2) * 30 * s);
  }

  function drawBars(ctx, W, H) {
    const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    const bw = W / cols.length;
    cols.forEach(function (c, i) { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, H * 0.55); });
    // rampa de grises continua de izquierda a derecha (cruza la unión)
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.2);
    // escalones de gris
    for (let i = 0; i < 11; i++) {
      const v = Math.round(i * 25.5);
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      ctx.fillRect(i * W / 11, H * 0.75, W / 11 + 1, H * 0.13);
    }
    // gradiente de color (arcoíris) continuo
    const h = ctx.createLinearGradient(0, 0, W, 0);
    for (let k = 0; k <= 12; k++) h.addColorStop(k / 12, 'hsl(' + k * 30 + ',90%,50%)');
    ctx.fillStyle = h; ctx.fillRect(0, H * 0.88, W, H * 0.12);
  }

  function drawFlat(ctx, W, H, v) {
    ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    ctx.fillRect(0, 0, W, H);
  }

  const SOURCES = {
    sunset: { label: 'Panorama: atardecer en la montaña', kind: 'image', draw: drawSunset },
    city: { label: 'Panorama: ciudad nocturna', kind: 'image', draw: drawCity },
    grid: { label: 'Patrón: cuadrícula de alineación', kind: 'pattern', draw: drawGrid },
    bars: { label: 'Patrón: barras de color y rampas', kind: 'pattern', draw: drawBars },
    gray50: { label: 'Patrón: gris uniforme 50 %', kind: 'pattern', draw: function (c, W, H) { drawFlat(c, W, H, 128); } },
    white: { label: 'Patrón: blanco (brillo)', kind: 'pattern', draw: function (c, W, H) { drawFlat(c, W, H, 255); } },
    black: { label: 'Patrón: negro (nivel de negro)', kind: 'pattern', draw: function (c, W, H) { drawFlat(c, W, H, 0); } }
  };

  // Dibuja la fuente elegida en el lienzo, con la relación de aspecto de la imagen combinada
  function render(canvas, key, overlap, maxW) {
    const T = 2 - overlap;
    const W = Math.min(maxW, 4096);
    const H = Math.round(W / (T * 16 / 9));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx.save();
    SOURCES[key].draw(ctx, W, H, overlap);
    ctx.restore();
    return canvas;
  }

  window.DPLContent = { SOURCES: SOURCES, render: render };
})();
