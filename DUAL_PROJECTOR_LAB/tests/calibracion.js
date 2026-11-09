/* Prueba de encuadre, enfoque y calibración en celular (Pixel 7 emulado, toques reales del protocolo de Chrome).
 * Uso: node tests/calibracion.js <url> [carpetaCapturas]
 * Todas las comprobaciones miden la IMAGEN renderizada (píxeles leídos de WebGL), no solo que el botón exista.
 */
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');
const URL = process.argv[2];
const SHOTS = process.argv[3] || path.join(__dirname, 'capturas');
fs.mkdirSync(SHOTS, { recursive: true });
const FOTO = path.join(__dirname, 'foto_real_cafe.jpg');
const BARRAS = path.join(__dirname, 'barras_prueba.png');   // barras verticales blanco/negro de período fijo: permite medir la escala
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASA ' : 'FALLA') + ' · ' + name + (detail ? ' — ' + detail : '')); }

// ---- medidas sobre una franja de píxeles ----
function lumRow(r) { // luminancia media por columna
  const out = [];
  for (let x = 0; x < r.w; x++) { let s = 0; for (let y = 0; y < r.h; y++) { const i = ((y * r.w) + x) * 4; s += 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2]; } out.push(s / r.h); }
  return out;
}
function sharpness(r) { // energía de gradiente (horizontal + vertical): baja cuando la imagen se desenfoca
  let e = 0;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const i = (y * r.w + x) * 4, L = r.data[i] + r.data[i + 1] + r.data[i + 2];
    if (x + 1 < r.w) { const j = i + 4; e += Math.abs(L - (r.data[j] + r.data[j + 1] + r.data[j + 2])); }
    if (y + 1 < r.h) { const j = i + r.w * 4; e += Math.abs(L - (r.data[j] + r.data[j + 1] + r.data[j + 2])); }
  }
  return e / (r.w * r.h);
}
function meanAbsDiff(a, b) { let s = 0; for (let i = 0; i < a.data.length; i += 4) s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); return s / (a.data.length / 4) / 3; }
function countPeaks(row, thr) { let n = 0, up = false; for (const v of row) { if (!up && v > thr) { n++; up = true; } else if (up && v < thr - 20) up = false; } return n; }
function period(row) { // período de las barras (píxeles): primer mínimo profundo de la autodiferencia
  const E = [];
  for (let s = 0; s < row.length / 2; s++) { let e = 0, n = 0; for (let i = 0; i + s < row.length; i++) { e += Math.abs(row[i] - row[i + s]); n++; } E.push(e / n); }
  const max = Math.max(...E.slice(4));
  for (let s = 4; s < E.length - 1; s++) if (E[s] < max * 0.25 && E[s] <= E[s - 1] && E[s] <= E[s + 1]) return s;
  return 0;
}
function bestShift(a, b, maxS) { // desplazamiento de b respecto de a (píxeles) que mejor los superpone
  maxS = Math.min(maxS, Math.floor(a.length / 3));
  let best = 0, bestE = Infinity;
  for (let s = -maxS; s <= maxS; s++) { let e = 0, n = 0; for (let i = maxS; i < a.length - maxS; i++) { e += Math.abs(a[i] - b[i + s]); n++; } e /= n; if (e < bestE) { bestE = e; best = s; } }
  return best;
}
async function touchDrag(cdp, pts0, pts1, steps) {
  const tp = ps => ps.map((p, i) => ({ x: p[0], y: p[1], id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts0) });
  for (let s = 1; s <= steps; s++) { const k = s / steps; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(pts0.map((p, i) => [p[0] + (pts1[i][0] - p[0]) * k, p[1] + (pts1[i][1] - p[1]) * k])) }); await new Promise(r => setTimeout(r, 16)); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pixel = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...pixel, viewport: { width: pixel.viewport.height, height: pixel.viewport.width } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => document.body.classList.contains('ready'));
  const cdp = await ctx.newCDPSession(page);
  console.log('Pixel 7 emulado (Chrome Android, táctil), horizontal ' + page.viewportSize().width + '×' + page.viewportSize().height);
  const ev = (f, a) => page.evaluate(f, a);
  // franja de la imagen del proyector i en (u0..u1, v0..v1) → fracciones del lienzo, en la vista actual (2D)
  const rectOf = (i, u0, u1, v0, v1) => ev(([i, u0, u1, v0, v1]) => {
    const cy = DPL.centerY(), G = DPL.projGeo(i);
    const a = DPL.screenToCanvas(G.cx + (u0 - 0.5) * G.w, (G.cy - cy) + (v1 - 0.5) * G.h), b = DPL.screenToCanvas(G.cx + (u1 - 0.5) * G.w, (G.cy - cy) + (v0 - 0.5) * G.h);
    return [a[0], a[1], b[0] - a[0], b[1] - a[1]];
  }, [i, u0, u1, v0, v1]);
  const read = (r) => ev((r) => DPL.readRect(r[0], r[1], r[2], r[3]), r);

  // ===== 1. Cargar una foto real con el botón 🖼 Imagen =====
  let ch = null;
  try { [ch] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), page.tap('#mImage')]); } catch (e) { }
  if (ch) await ch.setFiles(FOTO);
  await page.waitForFunction(() => DPL.S.source === 'image' && /foto_real_cafe/.test(document.getElementById('fileStatus').textContent), null, { timeout: 8000 }).catch(() => { });
  const st1 = await ev(() => ({ st: document.getElementById('fileStatus').textContent, sz: DPL.srcSize() }));
  check('Foto real cargada desde el botón «🖼 Imagen»', !!ch && st1.sz && st1.sz[0] === 600, '"' + st1.st + '" · textura ' + (st1.sz || []).join('×'));
  await page.tap('#mView'); await page.waitForTimeout(300);     // vista 2D para medir
  await page.screenshot({ path: path.join(SHOTS, 'cal_01_foto_real_2d.png') });

  // ===== 2. Enfoque óptico simulado: desenfocar y volver a enfocar =====
  await page.tap('#mbar [data-tool="foto"]'); await page.waitForTimeout(200);
  const rA = await rectOf(0, 0.25, 0.6, 0.3, 0.7);
  const s0 = sharpness(await read(rA));
  const geo0 = await ev(() => ({ g: DPL.uniforms.uGA.value.toArray(), ph: DPL.uniforms.uPhoto.value.toArray() }));
  for (let k = 0; k < 4; k++) await page.tap('#tooldock [data-pane="foto"] [data-act="blurBoth"]');
  await page.waitForTimeout(150);
  const s1 = sharpness(await read(rA));
  const geo1 = await ev(() => ({ g: DPL.uniforms.uGA.value.toArray(), ph: DPL.uniforms.uPhoto.value.toArray(), f: DPL.uniforms.uFocus.value.toArray(), info: document.getElementById('fotoInfo').textContent }));
  await page.screenshot({ path: path.join(SHOTS, 'cal_02_desenfocada.png') });
  for (let k = 0; k < 4; k++) await page.tap('#tooldock [data-pane="foto"] [data-act="focusBoth"]');
  await page.waitForTimeout(150);
  const s2 = sharpness(await read(rA));
  check('«◌ Desenfocar» realmente desenfoca la imagen', s1 < s0 * 0.7, 'nitidez medida ' + s0.toFixed(1) + ' → ' + s1.toFixed(1) + ' (' + Math.round(100 * s1 / s0) + ' %), foco A/B = ' + geo1.f.map(v => v.toFixed(1)).join('/'));
  check('«◉ Enfocar» devuelve la nitidez original', Math.abs(s2 - s0) / s0 < 0.02, 'nitidez ' + s1.toFixed(1) + ' → ' + s2.toFixed(1) + ' (original ' + s0.toFixed(1) + ')');
  check('El enfoque es independiente del zoom y de la geometría', JSON.stringify(geo0.g) === JSON.stringify(geo1.g) && JSON.stringify(geo0.ph) === JSON.stringify(geo1.ph), 'posición/tamaño de A y zoom de la foto sin cambios al desenfocar');
  // nitidez digital
  await page.tap('#tooldock [data-pane="foto"] [data-act="sharpPlus"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="sharpPlus"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="sharpPlus"]');
  const s3 = sharpness(await read(rA));
  await page.screenshot({ path: path.join(SHOTS, 'cal_03_nitidez_digital.png') });
  await page.tap('#tooldock [data-pane="foto"] [data-act="sharpMinus"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="sharpMinus"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="sharpMinus"]');
  check('«Nitidez digital +» realza los bordes (procesado, distinto del foco)', s3 > s0 * 1.15, 'nitidez ' + s0.toFixed(1) + ' → ' + s3.toFixed(1) + ' (' + Math.round(100 * s3 / s0) + ' %)');
  // el foco también se ve en 3D
  await page.tap('#mbar [data-tool]') .catch(() => {});
  await ev(() => DPL.setView('3d')); await page.waitForTimeout(200);
  const r3d = [0.35, 0.25, 0.3, 0.3];
  const t0 = sharpness(await read(r3d));
  await ev(() => DPL.act('blurBoth')); await ev(() => DPL.act('blurBoth')); await ev(() => DPL.act('blurBoth'));
  const t1 = sharpness(await read(r3d));
  await ev(() => DPL.act('autoFocus'));
  const t2 = sharpness(await read(r3d));
  check('El enfoque se ve también en la vista 3D', t1 < t0 * 0.85 && Math.abs(t2 - t0) / t0 < 0.03, 'nitidez en 3D ' + t0.toFixed(1) + ' → ' + t1.toFixed(1) + ' → (auto-enfocar) ' + t2.toFixed(1));
  await ev(() => DPL.setView('2d')); await page.waitForTimeout(200);

  // ===== 3. Zoom, desplazamiento y centrado de la foto =====
  await page.locator('#mImage input').setInputFiles(BARRAS);
  await page.waitForFunction(() => /barras_prueba/.test(document.getElementById('fileStatus').textContent) && /Mostrando/.test(document.getElementById('fileStatus').textContent));
  await ev(() => DPL.setTool('foto')); await page.waitForTimeout(150);
  const rowR = await rectOf(0, 0.05, 0.95, 0.48, 0.52);
  const n0 = period(lumRow(await read(rowR)));
  await page.tap('#tooldock [data-pane="foto"] [data-act="phZoomIn"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="phZoomIn"]');
  const n1 = period(lumRow(await read(rowR)));
  const z1 = await ev(() => DPL.S.photo.zoom);
  await page.screenshot({ path: path.join(SHOTS, 'cal_04_zoom_foto.png') });
  await page.tap('#tooldock [data-pane="foto"] [data-act="phZoomOut"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="phZoomOut"]'); await page.tap('#tooldock [data-pane="foto"] [data-act="phZoomOut"]');
  const n2 = period(lumRow(await read(rowR)));
  const z2 = await ev(() => DPL.S.photo.zoom);
  check('«+» amplía y «−» reduce la foto (cambia la escala real)', Math.abs(n1 / n0 - z1) < 0.12 * z1 && Math.abs(n2 / n0 - z2) < 0.12 * z2,
    'separación entre líneas en A: ' + n0 + ' px → (+ +, zoom ' + Math.round(z1 * 100) + ' %) ' + n1 + ' px → (− − −, zoom ' + Math.round(z2 * 100) + ' %) ' + n2 + ' px (proporcional al zoom)');
  await page.tap('#tooldock [data-pane="foto"] [data-act="phFit"]');
  // arrastre con un dedo = mover la foto (medido sobre la foto real, que no es periódica)
  await page.locator('#mImage input').setInputFiles(FOTO);
  await page.waitForFunction(() => /foto_real_cafe/.test(document.getElementById('fileStatus').textContent) && /Mostrando/.test(document.getElementById('fileStatus').textContent));
  const before = lumRow(await read(rowR));
  const box = await page.locator('#gl').boundingBox();
  const y = box.y + box.height * 0.5, x = box.x + box.width * 0.45;
  await touchDrag(cdp, [[x, y]], [[x + 60, y]], 10); await page.waitForTimeout(200);
  const after = lumRow(await read(rowR));
  const dpr = await ev(() => DPL.readRect(0, 0, 0.01, 0.01).cw / document.getElementById('gl').clientWidth);
  const sh = bestShift(before, after, 160);
  const pan = await ev(() => DPL.S.photo.px);
  check('Arrastrar con un dedo mueve la foto lo mismo que el dedo', Math.abs(sh - 60 * dpr) <= 6, 'dedo +60 px → la imagen se movió ' + sh + ' px del lienzo (esperado ' + Math.round(60 * dpr) + '), desplazamiento ' + Math.round(pan * 100) + ' %');
  // pellizco = zoom de la foto
  const zp0 = await ev(() => DPL.S.photo.zoom);
  await touchDrag(cdp, [[x - 40, y], [x + 40, y]], [[x - 120, y], [x + 120, y]], 10); await page.waitForTimeout(200);
  const zp1 = await ev(() => DPL.S.photo.zoom);
  const pinchRow = lumRow(await read(rowR));
  const dPinch = pinchRow.reduce((a, v, i) => a + Math.abs(v - after[i]), 0) / pinchRow.length;
  check('Pellizcar amplía la foto', zp1 > zp0 * 2 && dPinch > 10, 'zoom ' + Math.round(zp0 * 100) + ' % → ' + Math.round(zp1 * 100) + ' %; la imagen cambió (dif ' + dPinch.toFixed(1) + ')');
  await page.tap('#tooldock [data-pane="foto"] [data-act="phCenter"]');
  const ctr = await ev(() => [DPL.S.photo.px, DPL.S.photo.py, DPL.S.photo.zoom]);
  await page.tap('#tooldock [data-pane="foto"] [data-act="phFit"]');
  const fitRow = lumRow(await read(rowR));
  const dFit = fitRow.reduce((a, v, i) => a + Math.abs(v - before[i]), 0) / fitRow.length;
  check('«⌖ Centrar» y «⤢ Ajustar» restauran el encuadre', ctr[0] === 0 && ctr[1] === 0 && dFit < 0.5, 'tras centrar: desplazamiento 0/0 (zoom ' + Math.round(ctr[2] * 100) + ' %); tras ajustar la imagen es idéntica a la original (dif ' + dFit.toFixed(2) + ')');

  // ===== 4. Desalinear A y B y volver a alinearlos =====
  await page.locator('#mImage input').setInputFiles(FOTO);
  await page.waitForFunction(() => /foto_real_cafe/.test(document.getElementById('fileStatus').textContent) && /Mostrando/.test(document.getElementById('fileStatus').textContent));
  await ev(() => DPL.setTool('cal')); await page.waitForTimeout(150);
  const ovB = async () => { // misma franja compartida vista por A solo y por B solo
    return ev(() => {
      const o = DPL.S.overlap, cy = DPL.centerY(), G = DPL.projGeo(0);
      const xs = G.cx + (1 - o / 2 - 0.5) * G.w; const a = DPL.screenToCanvas(xs - o * G.w * 0.35, (G.cy - cy) + 0.25 * G.h), b = DPL.screenToCanvas(xs + o * G.w * 0.35, (G.cy - cy) - 0.25 * G.h);
      const r = [a[0], a[1], b[0] - a[0], b[1] - a[1]];
      const calib = DPL.S.calib, bl = DPL.S.blend; DPL.S.calib = false; DPL.S.blend = 0;
      DPL.S.P[1].on = false; DPL.apply(); const A = DPL.readRect(r[0], r[1], r[2], r[3]);
      DPL.S.P[1].on = true; DPL.S.P[0].on = false; DPL.apply(); const B = DPL.readRect(r[0], r[1], r[2], r[3]);
      DPL.S.P[0].on = true; DPL.S.calib = calib; DPL.S.blend = bl; DPL.apply();
      return [A, B];
    });
  };
  const d0 = await ovB(), e0 = await ev(() => DPL.alignError());
  await page.tap('#tooldock [data-pane="cal"] [data-act="markBefore"]');
  const before3d = await ev(() => { DPL.setView('3d'); return DPL.readRect(0.3, 0.25, 0.4, 0.3); });
  await ev(() => DPL.setView('2d'));
  await page.tap('#tooldock [data-pane="cal"] [data-act="misalign"]'); await page.waitForTimeout(200);
  const d1 = await ovB(), e1 = await ev(() => DPL.alignError());
  await page.screenshot({ path: path.join(SHOTS, 'cal_05_desalineado_cuadricula.png') });
  const mis3d = await ev(() => { DPL.setView('3d'); return DPL.readRect(0.3, 0.25, 0.4, 0.3); });
  await page.screenshot({ path: path.join(SHOTS, 'cal_06_desalineado_3d.png') });
  await ev(() => DPL.setView('2d'));
  check('«↯ Desalinear» produce imagen doble visible', e1 > 0.03 && meanAbsDiff(d1[0], d1[1]) > meanAbsDiff(d0[0], d0[1]) + 8, 'error ' + (e0 * 1000).toFixed(0) + ' → ' + (e1 * 1000).toFixed(0) + ' mm; diferencia A/B en la franja compartida ' + meanAbsDiff(d0[0], d0[1]).toFixed(1) + ' → ' + meanAbsDiff(d1[0], d1[1]).toFixed(1));
  check('El desalineado se ve también en 3D', meanAbsDiff(before3d, mis3d) > 3, 'cambio de la imagen 3D: ' + meanAbsDiff(before3d, mis3d).toFixed(1));
  // Antes / después
  const cur = await read([0.3, 0.3, 0.4, 0.3]);
  await page.tap('#tooldock [data-pane="cal"] [data-act="compare"]');
  const cmpA = await read([0.3, 0.3, 0.4, 0.3]); const eCmp = await ev(() => DPL.alignError()); const badge = await ev(() => !document.getElementById('compareBadge').hidden);
  await page.screenshot({ path: path.join(SHOTS, 'cal_07_comparar_antes.png') });
  await page.tap('#tooldock [data-pane="cal"] [data-act="compare"]');
  const cmpB = await read([0.3, 0.3, 0.4, 0.3]); const eBack = await ev(() => DPL.alignError());
  check('«⇄ Antes/Después» alterna entre el estado guardado y el actual', badge && eCmp < 0.001 && Math.abs(eBack - e1) < 1e-9 && meanAbsDiff(cmpA, cur) > 3 && meanAbsDiff(cmpB, cur) < 0.5,
    'ANTES: error ' + (eCmp * 1000).toFixed(0) + ' mm (cartel visible); DESPUÉS: ' + (eBack * 1000).toFixed(0) + ' mm; imagen después = actual (dif ' + meanAbsDiff(cmpB, cur).toFixed(2) + ')');

  // Realinear A MANO con los controles táctiles (como haría una persona leyendo el error en la barra)
  const glb = await page.locator('#gl').boundingBox();
  const mPerPx = await ev(() => (DPL.screenToCanvas(1, 0)[0] - DPL.screenToCanvas(0, 0)[0]));    // fracción de lienzo por metro
  const p1 = await ev(() => Object.assign({}, DPL.S.P[1]));
  const pxPerM = mPerPx * glb.width;
  const gx = glb.x + glb.width * 0.6, gy = glb.y + glb.height * 0.45;
  await touchDrag(cdp, [[gx, gy]], [[gx - p1.dx * pxPerM, gy + p1.dy * pxPerM]], 12); await page.waitForTimeout(200);   // arrastre: corrige X e Y a ojo
  const afterDrag = await ev(() => ({ dx: DPL.S.P[1].dx, dy: DPL.S.P[1].dy, e: DPL.alignError() }));
  for (let k = 0; k < 6; k++) await page.tap('#tooldock [data-pane="cal"] [data-act="rotR"]');       // 6 × 0,1° = corrige la rotación
  for (let k = 0; k < 5; k++) await page.tap('#tooldock [data-pane="cal"] [data-act="sizeMinus"]');  // tamaño
  for (let k = 0; k < 3; k++) await page.tap('#tooldock [data-pane="cal"] [data-act="focPlus"]');    // foco
  await page.tap('#tooldock [data-pane="cal"] [data-act="step"]'); await page.tap('#tooldock [data-pane="cal"] [data-act="step"]');   // paso 2 mm
  for (let it = 0; it < 30; it++) {   // ajuste fino con las flechas, leyendo X/Y en la barra
    const q = await ev(() => DPL.S.P[1]);
    if (Math.abs(q.dx) < 0.0015 && Math.abs(q.dy) < 0.0015) break;
    if (Math.abs(q.dx) >= 0.0015) await page.tap(q.dx > 0 ? '#tooldock [data-nudge="-1,0"]' : '#tooldock [data-nudge="1,0"]');
    if (Math.abs(q.dy) >= 0.0015) await page.tap(q.dy > 0 ? '#tooldock [data-nudge="0,-1"]' : '#tooldock [data-nudge="0,1"]');
  }
  const e2 = await ev(() => DPL.alignError());
  const d2 = await ovB();
  const info2 = await ev(() => document.getElementById('calInfo').textContent);
  await page.screenshot({ path: path.join(SHOTS, 'cal_08_realineado_a_mano.png') });
  check('Realinear a mano con toques (arrastre + flechas + ⟳ + tamaño + foco)', e2 < 0.004 && meanAbsDiff(d2[0], d2[1]) < meanAbsDiff(d1[0], d1[1]) * 0.5,
    'tras arrastrar: X ' + (afterDrag.dx * 100).toFixed(1) + ' cm, Y ' + (afterDrag.dy * 100).toFixed(1) + ' cm; final: error ' + (e2 * 1000).toFixed(1) + ' mm · diferencia A/B ' + meanAbsDiff(d1[0], d1[1]).toFixed(1) + ' → ' + meanAbsDiff(d2[0], d2[1]).toFixed(1) + ' · barra: "' + info2 + '"');
  // pellizco en Calibrar = tamaño del proyector
  const zb0 = await ev(() => DPL.S.P[1].zoom);
  await touchDrag(cdp, [[gx - 40, gy], [gx + 40, gy]], [[gx - 90, gy], [gx + 90, gy]], 10); await page.waitForTimeout(150);
  const zb1 = await ev(() => DPL.S.P[1].zoom);
  check('Pellizcar en Calibrar cambia el tamaño de la proyección seleccionada', zb1 > zb0 + 0.01, 'zoom de B ' + (zb0 * 100).toFixed(1) + ' % → ' + (zb1 * 100).toFixed(1) + ' %');
  // Autoalinear
  await page.tap('#tooldock [data-pane="cal"] [data-act="misalign"]');
  await page.tap('#tooldock [data-pane="cal"] [data-act="autoAlign"]'); await page.waitForTimeout(150);
  const e3 = await ev(() => DPL.alignError()), d3 = await ovB();
  check('«⌖ Autoalinear» vuelve a superponer A y B', e3 < 1e-6 && meanAbsDiff(d3[0], d3[1]) <= meanAbsDiff(d0[0], d0[1]) + 3, 'error ' + (e3 * 1000).toFixed(1) + ' mm; diferencia A/B ' + meanAbsDiff(d3[0], d3[1]).toFixed(1) + ' (alineado original ' + meanAbsDiff(d0[0], d0[1]).toFixed(1) + ')');
  await page.screenshot({ path: path.join(SHOTS, 'cal_09_autoalineado.png') });
  // Restablecer
  await ev(() => { DPL.act('misalign'); DPL.act('blurBoth'); DPL.act('phZoomIn'); DPL.act('sharpPlus'); });
  await page.tap('#tooldock [data-pane="cal"] [data-act="reset"]');
  const rs = await ev(() => ({ e: DPL.alignError(), f: DPL.uniforms.uFocus.value.toArray(), ph: DPL.uniforms.uPhoto.value.toArray(), sh: DPL.uniforms.uSharp.value, mode: DPL.S.mode }));
  check('«↺ Restablecer» vuelve todo a los valores iniciales', rs.e < 1e-6 && rs.f.every(v => v === 0) && rs.ph.join() === '1,0,0' && rs.sh === 0 && rs.mode === 'C', JSON.stringify(rs));

  // ===== 5. Cuadrícula de calibración: se ve y cambia la imagen =====
  const g0 = await read([0.3, 0.3, 0.4, 0.3]);
  await page.tap('#gridBtn'); const gOff = await read([0.3, 0.3, 0.4, 0.3]);
  await page.tap('#gridBtn');
  check('«▦ Cuadrícula» muestra y oculta la cuadrícula con puntos de referencia', meanAbsDiff(g0, gOff) > 5, 'cambio de imagen al ocultarla: ' + meanAbsDiff(g0, gOff).toFixed(1));

  // ===== 6. Los botones no tapan la vista (horizontal y vertical) =====
  const noOverlap = () => ev(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const g = r('gl'), out = {};
    ['tooldock', 'mbar'].forEach(function (id) { const b = r(id); out[id] = (b.height > 0 && b.top < g.bottom - 1 && b.bottom > g.top + 1) ? 'TAPA' : 'ok'; });
    out.vista = Math.round(g.width) + '×' + Math.round(g.height); out.frac = +(g.height / innerHeight).toFixed(2); out.over = document.documentElement.scrollWidth - innerWidth;
    return out;
  });
  const L1 = await noOverlap();
  await page.tap('#tooldock .done'); await page.waitForTimeout(200);
  const L2 = await noOverlap();
  await page.setViewportSize({ width: pixel.viewport.width, height: pixel.viewport.height }); await page.waitForTimeout(400);
  const L3 = await noOverlap();
  await page.screenshot({ path: path.join(SHOTS, 'cal_10_vertical_ver.png') });
  await page.tap('#mbar [data-tool="cal"]'); await page.waitForTimeout(400);
  const L4 = await noOverlap();
  await page.screenshot({ path: path.join(SHOTS, 'cal_11_vertical_calibrar.png') });
  const okL = [L1, L2, L3, L4].every(l => l.tooldock === 'ok' && l.mbar === 'ok' && l.over <= 0);
  check('Los botones no tapan la vista (horizontal y vertical)', okL, 'horiz. calibrar ' + JSON.stringify(L1) + ' · horiz. ver ' + JSON.stringify(L2) + ' · vert. ver ' + JSON.stringify(L3) + ' · vert. calibrar ' + JSON.stringify(L4));
  // en vertical también funcionan las flechas
  const vx0 = await ev(() => DPL.S.P[1].dx); await page.tap('#tooldock [data-nudge="1,0"]'); const vx1 = await ev(() => DPL.S.P[1].dx);
  check('En vertical, las flechas mueven la proyección', vx1 > vx0, 'X de B ' + (vx0 * 100).toFixed(1) + ' → ' + (vx1 * 100).toFixed(1) + ' cm');

  const real = errors.filter(e => !/favicon/i.test(e));
  check('Consola sin errores', real.length === 0, JSON.stringify(real));
  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  console.log((results.length - fails) + '/' + results.length + ' pruebas pasaron.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
