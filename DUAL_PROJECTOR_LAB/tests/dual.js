/* Prueba de la proyección dual (superpuesta / panorámica / híbrida), mapa de luz, blending y calculadora.
 * Uso: node tests/dual.js <url> [carpetaCapturas]
 * Celular: Pixel 7 emulado (Chrome Android, toques). Mide píxeles renderizados y valores calculados.
 */
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');
const URL = process.argv[2];
const SHOTS = process.argv[3] || path.join(__dirname, 'capturas');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASA ' : 'FALLA') + ' · ' + name + (detail ? ' — ' + detail : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
  const ev = (f, a) => page.evaluate(f, a);
  console.log('Pixel 7 emulado (Chrome Android, táctil), horizontal ' + page.viewportSize().width + '×' + page.viewportSize().height);

  // ---- utilidades de medición sobre la imagen renderizada (vista 2D) ----
  // luminancia media de una franja vertical centrada en x (m, coordenadas de la pared)
  const lumAt = (xs) => ev((xs) => {
    const cy = DPL.centerY(), G = DPL.projGeo(0), h = G.h;
    return xs.map(function (x) {
      const a = DPL.screenToCanvas(x - 0.02, (G.cy - cy) + 0.15 * h), b = DPL.screenToCanvas(x + 0.02, (G.cy - cy) - 0.15 * h);
      const r = DPL.readRect(a[0], a[1], Math.max(b[0] - a[0], 0.002), b[1] - a[1]);
      let s = 0; for (let i = 0; i < r.data.length; i += 4) s += 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2];
      return s / (r.data.length / 4);
    });
  }, xs);
  const xsOf = () => ev(() => { const A = DPL.projGeo(0), B = DPL.projGeo(1), o = DPL.S.overlap;
    return { left: A.cx - A.w * 0.3, mid: (A.cx + A.w / 2 + B.cx - B.w / 2) / 2, right: B.cx + B.w * 0.3 }; });

  // ===== 1. La herramienta Dual se abre desde la barra táctil =====
  await page.tap('#mbar [data-tool="dual"]'); await page.waitForTimeout(300);
  const vis = await ev(() => ({ pane: getComputedStyle(document.querySelector('[data-pane="dual"]')).display, n: document.querySelectorAll('[data-pane="dual"] [data-layout]').length }));
  check('Botón «💡 Dual» abre la demostración dual', vis.pane === 'flex' && vis.n === 3, 'panel visible con ' + vis.n + ' modos');
  await ev(() => DPL.setView('2d'));

  // ===== 2. A y B independientes, cada uno con su porción =====
  await page.tap('[data-layout="pano"]'); await page.waitForTimeout(200);
  await ev(() => DPL.setTool('dual'));
  await ev(() => { const s = document.getElementById('source'); s.value = 'sunset'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(200);
  const port = await ev(() => {
    const cy = DPL.centerY(), pt = (i, u) => { const G = DPL.projGeo(i); return DPL.screenToCanvas(G.cx + (u - 0.5) * G.w, (G.cy - cy) + 0.1 * G.h); };
    const row = (i) => { const p = []; for (let k = 0; k < 30; k++) p.push(pt(i, 0.05 + 0.6 * k / 29)); return p; };
    DPL.S.blend = 0; DPL.S.P[1].on = false; DPL.apply(); const a = DPL.samplePixels(row(0));
    DPL.S.P[1].on = true; DPL.S.P[0].on = false; DPL.apply(); const b = DPL.samplePixels(row(1));
    DPL.S.P[0].on = true; DPL.S.blend = 1; DPL.apply();
    return a.reduce((s, p, i) => s + Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2]), 0) / a.length / 3;
  });
  check('A y B proyectan porciones distintas de la imagen', port > 10, 'diferencia media entre la parte propia de A y la de B: ' + port.toFixed(1));

  // ===== 3. Tres modos: tamaño y brillo medidos =====
  await ev(() => { const s = document.getElementById('source'); s.value = 'white'; s.dispatchEvent(new Event('change')); });
  const modes = {};
  for (const k of ['stack', 'pano', 'hybrid']) {
    await page.tap('[data-layout="' + k + '"]'); await page.waitForTimeout(250);
    const st = await ev(() => ({ o: DPL.S.overlap, s: DPL.layoutStats(DPL.S.overlap), pr: (function () { const d = DPL.profileData(100); return { min: d.min, max: d.max }; })(), info: document.getElementById('dualInfo').textContent }));
    const x = await xsOf();
    const L = await lumAt([x.left, x.mid, x.right]);
    modes[k] = { st, L, x };
    await page.screenshot({ path: path.join(SHOTS, 'dual_' + k + '.png') });
  }
  // brillo de un solo proyector como referencia (B apagado, panorámico, centro de A)
  await page.tap('[data-layout="pano"]'); await page.waitForTimeout(150);
  const one = await ev(() => { DPL.S.P[1].on = false; DPL.apply(); const G = DPL.projGeo(0), cy = DPL.centerY(); const a = DPL.screenToCanvas(G.cx - 0.03, (G.cy - cy) + 0.1), b = DPL.screenToCanvas(G.cx + 0.03, (G.cy - cy) - 0.1);
    const r = DPL.readRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); let s = 0; for (let i = 0; i < r.data.length; i += 4) s += 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2];
    DPL.S.P[1].on = true; DPL.apply(); return s / (r.data.length / 4); });
  const S1 = modes.stack, P = modes.pano, H = modes.hybrid;
  check('Superpuesta: mismo tamaño que un proyector y el doble de luz', near(S1.st.o, 1, 1e-9) && near(S1.st.s.Wc, S1.st.s.W1, 1e-9) && near(S1.st.pr.min, 2 * P.st.pr.min, 0.05) && S1.L[1] > one + 20,
    'ancho ' + S1.st.s.Wc.toFixed(2) + ' m = 1 proyector; luz simulada ' + S1.st.pr.min.toFixed(2) + '×; brillo medido en pantalla ' + S1.L[1].toFixed(0) + ' vs. un solo proyector ' + one.toFixed(0));
  check('Panorámica: 1,85× más ancha con luz pareja de 1×', near(P.st.s.Wc / P.st.s.W1, 1.85, 0.001) && P.st.pr.min / P.st.pr.max > 0.97 && Math.max(...P.L) - Math.min(...P.L) < 8,
    'ancho ' + P.st.s.Wc.toFixed(2) + ' m (' + (P.st.s.Wc / P.st.s.W1).toFixed(2) + '×), uniformidad ' + Math.round(100 * P.st.pr.min / P.st.pr.max) + ' %, brillo medido izq./centro/der. ' + P.L.map(v => v.toFixed(0)).join('/'));
  check('Híbrida: 1,5× más ancha, pareja con blending', near(H.st.s.Wc / H.st.s.W1, 1.5, 0.001) && H.st.pr.min / H.st.pr.max > 0.97 && Math.max(...H.L) - Math.min(...H.L) < 8,
    'ancho ' + H.st.s.Wc.toFixed(2) + ' m, uniformidad ' + Math.round(100 * H.st.pr.min / H.st.pr.max) + ' %, brillo medido ' + H.L.map(v => v.toFixed(0)).join('/'));

  // ===== 4. Edge blending: antes / después (corrección de brillo en la zona compartida) =====
  await page.tap('[data-layout="hybrid"]'); await page.waitForTimeout(150);
  const xh = await xsOf();
  const withB = await lumAt([xh.left, xh.mid]);
  const prW = await ev(() => { const d = DPL.profileData(100); return [d.min, d.max]; });
  await page.tap('#blendBtn'); await page.waitForTimeout(150);
  const noB = await lumAt([xh.left, xh.mid]);
  const prN = await ev(() => { const d = DPL.profileData(100); return [d.min, d.max]; });
  await page.screenshot({ path: path.join(SHOTS, 'dual_hibrida_sin_blending.png') });
  await page.tap('#blendBtn'); await page.waitForTimeout(150);
  const again = await lumAt([xh.left, xh.mid]);
  check('Sin blending la zona compartida brilla de más; con blending se corrige', noB[1] > noB[0] + 15 && Math.abs(withB[1] - withB[0]) < 6 && Math.abs(again[1] - withB[1]) < 2,
    'brillo medido borde/centro — sin blending ' + noB.map(v => v.toFixed(0)).join('/') + ' (luz ' + prN[0].toFixed(2) + '–' + prN[1].toFixed(2) + '×) · con blending ' + withB.map(v => v.toFixed(0)).join('/') + ' (luz ' + prW[0].toFixed(2) + '–' + prW[1].toFixed(2) + '×)');

  // ===== 5. Cambiar el solapamiento con − / + =====
  const o0 = await ev(() => DPL.S.overlap);
  await page.tap('[data-act="ovPlus"]'); await page.tap('[data-act="ovPlus"]');
  const o1 = await ev(() => ({ o: DPL.S.overlap, w: DPL.layoutStats(DPL.S.overlap).Wc, txt: document.getElementById('ovVal').textContent, g: DPL.uniforms.uO.value }));
  await page.tap('[data-act="ovMinus"]'); await page.tap('[data-act="ovMinus"]'); await page.tap('[data-act="ovMinus"]');
  const o2 = await ev(() => ({ o: DPL.S.overlap, w: DPL.layoutStats(DPL.S.overlap).Wc }));
  check('− / + cambian el solapamiento y el tamaño', near(o1.o, o0 + 0.1, 1e-9) && near(o2.o, o0 - 0.05, 1e-9) && o2.w > o1.w && near(o1.g, o1.o, 1e-9),
    'solapamiento ' + Math.round(o0 * 100) + ' → ' + o1.txt + ' (ancho ' + o1.w.toFixed(2) + ' m) → ' + Math.round(o2.o * 100) + ' % (ancho ' + o2.w.toFixed(2) + ' m)');
  await page.tap('[data-layout="hybrid"]');

  // ===== 6. Mapa de luminosidad =====
  const h0 = await ev(() => DPL.readRect(0.3, 0.3, 0.4, 0.3));
  await page.tap('#heatBtn'); await page.waitForTimeout(150);
  const heatColor = async () => {
    const x = await xsOf();
    return ev((x) => { const cy = DPL.centerY(), G = DPL.projGeo(0);
      return [x.left, x.mid].map(function (xx) { return DPL.samplePixels([DPL.screenToCanvas(xx, (G.cy - cy) + 0.05)])[0]; }); }, x);
  };
  const hcB = await heatColor();
  await page.tap('#blendBtn'); await page.waitForTimeout(150);
  const hcN = await heatColor();
  await page.screenshot({ path: path.join(SHOTS, 'dual_mapa_luz_sin_blending.png') });
  await page.tap('#blendBtn'); await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'dual_mapa_luz_con_blending.png') });
  const legend = await ev(() => !document.getElementById('heatLegend').hidden);
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  check('Mapa de luz: mismo color en toda la pantalla con blending; otro color en el centro sin blending', legend && dist(hcB[0], hcB[1]) < 30 && dist(hcN[0], hcN[1]) > 120,
    'con blending borde rgb(' + hcB[0] + ') centro rgb(' + hcB[1] + ') · sin blending borde rgb(' + hcN[0] + ') centro rgb(' + hcN[1] + ') · leyenda visible: ' + legend);
  await page.tap('#heatBtn');

  // ===== 7. Calculadora: distancia, relación de proyección y gabinete =====
  await ev(() => DPL.setTool('ver'));
  await page.tap('#mPanel'); await page.waitForTimeout(300);
  await page.locator('#cDist').fill('4.2');
  await page.locator('#cThrow').fill('1.4');
  const c1 = await ev(() => ({ s: DPL.layoutStats(DPL.S.overlap), txt: document.getElementById('calcOut').textContent, geoW: DPL.projGeo(0).w }));
  await page.locator('#cBodyW').fill('0.6');
  await ev(() => DPL.setOverlap(0.85));
  const c2 = await ev(() => document.getElementById('calcOut').textContent);
  await page.screenshot({ path: path.join(SHOTS, 'dual_calculadora.png') });
  check('Calculadora: 4,2 m ÷ 1,4 = 3,00 m de ancho por proyector (y la escena 3D usa el mismo tamaño)', near(c1.s.W1, 3.0, 1e-9) && near(c1.geoW, 3.0, 1e-6) && /3,00 × 1,69 m/.test(c1.txt),
    'ancho ' + c1.s.W1.toFixed(2) + ' m, alto ' + c1.s.H.toFixed(2) + ' m; híbrida ' + c1.s.Wc.toFixed(2) + ' m de ancho');
  check('Calculadora avisa si los proyectores no entran lado a lado', /no entran lado a lado/.test(c2), 'con gabinete de 60 cm y 85 % compartido: "' + (c2.match(/Lentes separadas[^.]*\.[^.]*\./) || [''])[0] + '"');
  const labels = await ev(() => { const t = document.getElementById('calcOut').textContent; return { calc: /calculado/.test(t), sim: /simulado/.test(t), med: /requiere medición física/.test(t), noctrl: /no controla proyectores físicos/.test(t) }; });
  check('Distingue calculado / simulado / requiere medición, y aclara que no controla proyectores', labels.calc && labels.sim && labels.med && labels.noctrl, JSON.stringify(labels));
  await page.tap('#panelClose'); await page.waitForTimeout(200);
  await ev(() => DPL.setOverlap(0.5));

  // ===== 8. Comparar modos =====
  await page.tap('#mbar [data-tool="dual"]').catch(async () => { await ev(() => DPL.setTool('dual')); });
  await ev(() => DPL.setTool('dual'));
  await page.tap('[data-pane="dual"] [data-act="compareModes"]'); await page.waitForTimeout(300);
  const cards = await ev(() => Array.from(document.querySelectorAll('.mc-card')).map(c => c.querySelector('h4').textContent));
  await page.screenshot({ path: path.join(SHOTS, 'dual_comparar_modos.png') });
  await page.tap('[data-try="stack"]'); await page.waitForTimeout(200);
  const afterTry = await ev(() => ({ o: DPL.S.overlap, open: !document.getElementById('modesCard').hidden }));
  check('«📊 Comparar modos» muestra los 3 modos y «Probar» aplica uno', cards.length === 3 && afterTry.o === 1 && !afterTry.open, cards.join(' | ') + ' → probar Superpuesta: solapamiento ' + Math.round(afterTry.o * 100) + ' %');

  // ===== 9. 3D: en superpuesta los proyectores quedan apilados =====
  await ev(() => DPL.setView('3d'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'dual_superpuesta_3d.png') });
  const px3 = await ev(() => DPL.samplePixels([[0.5, 0.4], [0.4, 0.45]]));
  check('La vista 3D muestra la proyección superpuesta', px3.some(p => p[0] + p[1] + p[2] > 300), 'píxeles ' + JSON.stringify(px3));

  // ===== 10. Prueba de calibración con cuadrícula + antes/después desde Dual =====
  await page.tap('[data-layout="hybrid"]'); await ev(() => DPL.setView('2d'));
  const gA = await ev(() => DPL.readRect(0.3, 0.3, 0.4, 0.3));
  await page.tap('[data-pane="dual"] [data-act="grid"]'); await page.waitForTimeout(100);
  const gB = await ev(() => DPL.readRect(0.3, 0.3, 0.4, 0.3));
  let d = 0; for (let i = 0; i < gA.data.length; i++) d += Math.abs(gA.data[i] - gB.data[i]); d /= gA.data.length;
  await page.screenshot({ path: path.join(SHOTS, 'dual_cuadricula.png') });
  check('«▦ Cuadrícula» (prueba de calibración) cambia la imagen', d > 5, 'diferencia ' + d.toFixed(1));
  await page.tap('[data-pane="dual"] [data-act="grid"]');

  // ===== 11. Los botones no tapan la vista =====
  const ov = await ev(() => { const g = document.getElementById('gl').getBoundingClientRect(), b = document.getElementById('tooldock').getBoundingClientRect(); return { tapa: b.top < g.bottom - 1, over: document.documentElement.scrollWidth - innerWidth }; });
  await page.setViewportSize({ width: pixel.viewport.width, height: pixel.viewport.height }); await page.waitForTimeout(400);
  const ovV = await ev(() => { const g = document.getElementById('gl').getBoundingClientRect(), b = document.getElementById('tooldock').getBoundingClientRect(); return { tapa: b.top < g.bottom - 1, over: document.documentElement.scrollWidth - innerWidth, alto: Math.round(g.height) }; });
  await page.screenshot({ path: path.join(SHOTS, 'dual_vertical.png') });
  check('La barra Dual no tapa la vista (horizontal y vertical)', !ov.tapa && !ovV.tapa && ov.over <= 0 && ovV.over <= 0, 'horizontal ' + JSON.stringify(ov) + ' · vertical ' + JSON.stringify(ovV));

  const real = errors.filter(e => !/favicon/i.test(e));
  check('Consola sin errores', real.length === 0, JSON.stringify(real));
  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  console.log((results.length - fails) + '/' + results.length + ' pruebas pasaron.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
