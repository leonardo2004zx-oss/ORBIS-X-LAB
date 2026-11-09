/* Pruebas automáticas de DUAL PROJECTOR LAB (opcional, para desarrollo).
 * Requiere Node.js + Playwright:  node tests/verify.js [url] [carpetaCapturas]
 * Abre la app en Chromium, mueve los controles reales de la interfaz y mide
 * píxeles de la proyección para comprobar que el resultado cambia.
 */
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = process.argv[2] || 'file://' + ROOT.replace(/\\/g, '/') + '/index.html';
const SHOTS = process.argv[3] || path.join(__dirname, 'capturas');
require('fs').mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASA ' : 'FALLA') + ' · ' + name + (detail ? ' — ' + detail : ''));
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const lum = p => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
const diff = (a, b) => mean(a.map((p, i) => (Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2])) / 3));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ---------- 1. Carga ----------
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => document.body.classList.contains('ready') && window.DPL);
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(600);
  check('La aplicación carga sin errores', errors.length === 0, 'tiempo hasta lista: ' + loadMs + ' ms; errores: ' + JSON.stringify(errors));
  await page.screenshot({ path: path.join(SHOTS, '01_inicio_3d_frontal.png') });

  // Utilidades dentro de la página: muestrear proyector i en coordenadas (u,v) de su imagen
  await page.evaluate(() => {
    window.T = {
      pt(i, u, v) {
        const G = DPL.projGeo(i), cy = DPL.centerY();
        return DPL.screenToCanvas(G.cx + (u - 0.5) * G.w, (G.cy - cy) + (v - 0.5) * G.h);
      },
      row(i, u0, u1, n, v) { const out = []; for (let k = 0; k < n; k++) out.push(T.pt(i, u0 + (u1 - u0) * k / (n - 1), v)); return out; },
      grid(i, u0, u1, nu, vs) { let o = []; vs.forEach(v => { o = o.concat(T.row(i, u0, u1, nu, v)); }); return o; },
      sample(pts) { return DPL.samplePixels(pts); }
    };
  });

  // ---------- 2. Cambio 2D / 3D con los botones reales ----------
  await page.click('#btn2d');
  await page.waitForTimeout(300);
  const v2 = await page.evaluate(() => DPL.S.view);
  await page.screenshot({ path: path.join(SHOTS, '02_vista_2d.png') });
  await page.click('#btn2d'); await page.waitForTimeout(300);
  const v3 = await page.evaluate(() => DPL.S.view);
  await page.click('#btnFT'); await page.waitForTimeout(900);
  const camTech = await page.evaluate(() => DPL.S.cam);
  await page.screenshot({ path: path.join(SHOTS, '03_vista_tecnica.png') });
  await page.click('#btnSeat'); await page.waitForTimeout(900);
  const camSeat = await page.evaluate(() => DPL.S.cam);
  await page.screenshot({ path: path.join(SHOTS, '04_vista_sillon.png') });
  await page.click('#btnFT'); await page.waitForTimeout(300); // sillón → técnica
  await page.click('#btnFT'); await page.waitForTimeout(900); // técnica → frontal
  const camFront = await page.evaluate(() => DPL.S.cam);
  check('Cambio 2D ⇄ 3D y vistas frontal / técnica / sillón', v2 === '2d' && v3 === '3d' && camTech === 'tech' && camSeat === 'seat' && camFront === 'front', [v2, v3, camTech, camSeat, camFront].join(' → '));

  // Pasar a 2D para medir
  await page.click('#btn2d'); await page.waitForTimeout(200);

  // ---------- 3. A y B muestran partes DIFERENTES de la misma escena ----------
  await page.click('[data-mode="C"]');
  await page.evaluate(() => { DPL.S.blend = 0; DPL.apply(); }); // sin rampa para comparar contenido puro
  const o = await page.evaluate(() => DPL.S.overlap);
  const partDiffs = [];
  for (const src of ['sunset', 'city', 'grid']) {
  await page.selectOption('#source', src); await page.click('[data-mode="C"]');
  await page.evaluate(() => { DPL.S.blend = 0; DPL.apply(); });
  const r = await page.evaluate((o) => {
    const vs = [0.2, 0.35, 0.5, 0.65, 0.8];
    DPL.S.P[1].on = false; DPL.apply();
    const aBody = T.sample(T.grid(0, 0.05, 1 - o - 0.02, 24, vs));
    const aOv = T.sample(T.grid(0, 1 - o + 0.01, 0.99, 12, vs));
    DPL.S.P[1].on = true; DPL.S.P[0].on = false; DPL.apply();
    const bBody = T.sample(T.grid(1, 0.05, 1 - o - 0.02, 24, vs)); // mismas coordenadas locales que A
    const bOv = T.sample(T.grid(1, 0.01, o - 0.01, 12, vs));
    DPL.S.P[0].on = true; DPL.apply();
    return { aBody, bBody, aOv, bOv };
  }, o);
  partDiffs.push({ src, body: diff(r.aBody, r.bBody), ov: diff(r.aOv, r.bOv) });
  }
  check('A y B proyectan partes diferentes (no es la misma imagen duplicada)', partDiffs.every(d => d.body > 10), partDiffs.map(d => d.src + ': ' + d.body.toFixed(1)).join(', ') + ' niveles de diferencia media en el mismo punto local');
  check('La zona de superposición muestra el mismo contenido en A y B (panorama continuo)', partDiffs.every(d => d.ov < 8), partDiffs.map(d => d.src + ': ' + d.ov.toFixed(1)).join(', ') + ' niveles en la franja compartida');

  // ---------- 4. Superposición y fusión cambian visualmente (gris 50 %) ----------
  await page.selectOption('#source', 'gray50');
  await page.waitForTimeout(200);
  async function seamProfile() {
    return page.evaluate(() => {
      const G0 = DPL.projGeo(0), G1 = DPL.projGeo(1), cy = DPL.centerY();
      const x0 = G0.cx - G0.w * 0.3, x1 = G1.cx + G1.w * 0.3, pts = [], xs = [];
      for (let k = 0; k < 121; k++) { const x = x0 + (x1 - x0) * k / 120; xs.push(x); pts.push(DPL.screenToCanvas(x, 0)); }
      return { xs, px: T.sample(pts) };
    });
  }
  function bandStats(p) {
    const L = p.px.map(lum), base = mean(L.slice(0, 15).concat(L.slice(-15)));
    const max = Math.max(...L), min = Math.min(...L);
    const bright = L.filter(v => v > base + 12).length;
    return { base: +base.toFixed(1), max: +max.toFixed(1), min: +min.toFixed(1), brightPts: bright };
  }
  await page.click('[data-mode="A"]'); await page.waitForTimeout(150);
  const sA = bandStats(await seamProfile());
  await page.screenshot({ path: path.join(SHOTS, '05_modoA_gris_union_visible.png') });
  await page.click('[data-mode="B"]'); await page.waitForTimeout(150);
  const sB = bandStats(await seamProfile());
  await page.screenshot({ path: path.join(SHOTS, '06_modoB_rampa_lineal.png') });
  await page.click('[data-mode="C"]'); await page.waitForTimeout(150);
  const sC = bandStats(await seamProfile());
  await page.screenshot({ path: path.join(SHOTS, '07_modoC_gris_fusion.png') });
  check('Modo A: la unión se ve más brillante', sA.max - sA.base > 25, JSON.stringify(sA));
  check('Modo B (rampa lineal, gamma 1): aparece una banda oscura', sB.base - sB.min > 15, JSON.stringify(sB));
  check('Modo C: transición casi invisible (variación < 6 niveles)', sC.max - sC.min < 6, JSON.stringify(sC));

  // Slider de superposición (control real): en modo A, la franja brillante se ensancha
  await page.click('[data-mode="A"]');
  await page.fill('#sOverlap', '0.05'); await page.waitForTimeout(150);
  const narrow = bandStats(await seamProfile());
  await page.fill('#sOverlap', '0.3'); await page.waitForTimeout(150);
  const wide = bandStats(await seamProfile());
  check('El control de superposición cambia el ancho de la franja', wide.brightPts > narrow.brightPts * 2, 'puntos brillantes con 5 %: ' + narrow.brightPts + ', con 30 %: ' + wide.brightPts);
  // Slider de intensidad de blending
  await page.fill('#sOverlap', '0.15');
  await page.click('[data-mode="C"]');
  await page.fill('#sBlend', '0'); await page.waitForTimeout(150);
  const b0 = bandStats(await seamProfile());
  await page.fill('#sBlend', '1'); await page.waitForTimeout(150);
  const b1 = bandStats(await seamProfile());
  check('El control de intensidad del Edge Blending elimina la franja', (b0.max - b0.base) > 20 && (b1.max - b1.min) < 6, 'sin blending: pico +' + (b0.max - b0.base).toFixed(1) + '; con blending: variación ' + (b1.max - b1.min).toFixed(1));
  const modeAfter = await page.evaluate(() => DPL.S.mode);
  check('Mover un control de calibración pasa a Modo B (manual)', modeAfter === 'B', 'modo actual: ' + modeAfter);

  // ---------- 5. Controles de cada proyector ----------
  await page.click('[data-mode="C"]');
  await page.selectOption('#source', 'grid'); await page.waitForTimeout(150);
  await page.click('[data-tab="1"]');
  const probe = await page.evaluate(() => { const p = []; for (let k = 0; k < 40; k++) p.push(T.pt(1, 0.3 + k * 0.01, 0.5)); return p; });
  const before = await page.evaluate(p => T.sample(p), probe);
  const gBefore = await page.evaluate(() => DPL.uniforms.uGB.value.toArray());
  await page.fill('#x1', '0.2'); await page.waitForTimeout(100);
  const after = await page.evaluate(p => T.sample(p), probe);
  const gAfter = await page.evaluate(() => DPL.uniforms.uGB.value.toArray());
  await page.screenshot({ path: path.join(SHOTS, '08_B_desplazado_20cm.png') });
  check('Posición horizontal de B mueve su imagen', Math.abs(gAfter[0] - gBefore[0] - 0.2) < 1e-6 && diff(before, after) > 5, 'centro X: ' + gBefore[0].toFixed(3) + ' → ' + gAfter[0].toFixed(3) + ' m; cambio de píxeles ' + diff(before, after).toFixed(1));
  const ctlTests = [['#y1', '0.1', 1, 'Posición vertical'], ['#d1', '6', 2, 'Distancia (cambia el tamaño)'], ['#z1', '1.1', 2, 'Tamaño / zoom'], ['#r1', '2', 3, 'Rotación']];
  for (const [sel, val, idx, name] of ctlTests) {
    const a = await page.evaluate(() => DPL.uniforms.uGB.value.toArray());
    await page.fill(sel, val); await page.waitForTimeout(60);
    const b = await page.evaluate(() => DPL.uniforms.uGB.value.toArray());
    check('Control "' + name + '" modifica la proyección', Math.abs(a[idx] - b[idx]) > 1e-4, a[idx].toFixed(3) + ' → ' + b[idx].toFixed(3));
  }
  const lumB = async () => mean((await page.evaluate(() => T.sample(T.grid(1, 0.6, 0.8, 6, [0.3, 0.7])))).map(lum));
  await page.click('#btnAuto');
  await page.selectOption('#source', 'white');
  const l1 = await lumB();
  await page.fill('#b1', '0.5'); const l2 = await lumB();
  await page.fill('#bg1', '0.6'); const px3 = await page.evaluate(() => T.sample([T.pt(1, 0.7, 0.5)])[0]);
  await page.click('#on1 + span'); const l4 = await lumB();
  check('Brillo de B lo oscurece', l2 < l1 - 10, l1.toFixed(1) + ' → ' + l2.toFixed(1));
  check('Corrección de color (azul de B) cambia el tono', px3[2] < px3[0] - 8, 'RGB ' + px3.join(','));
  check('Apagar B deja su zona sin imagen', l4 < 30, 'luminancia ' + l4.toFixed(1));
  await page.click('#on1 + span');
  await page.click('[data-tab="0"]');
  await page.click('[data-mode="C"]');

  // ---------- 6. Tamaños de pantalla ----------
  await page.click('[data-size="300"]'); await page.waitForTimeout(200);
  const info300 = await page.textContent('#info');
  await page.click('[data-size="100"]'); await page.waitForTimeout(200);
  const ref100 = await page.evaluate(() => DPL.ref());
  check('Tamaños 100″–300″ calculan 16:9 correctamente', /664 × 374 cm/.test(info300) && Math.abs(ref100.w - 2.2139) < 0.001 && Math.abs(ref100.h - 1.2453) < 0.001, '300″ → 664×374 cm; 100″ → ' + (ref100.w * 100).toFixed(1) + '×' + (ref100.h * 100).toFixed(1) + ' cm');
  await page.click('[data-size="150"]');

  // ---------- 7. Video local ----------
  await page.selectOption('#source', 'sunset');
  await page.setInputFiles('#fileVideo', path.join(__dirname, 'video_prueba.webm'));
  await page.waitForFunction(() => DPL.S.source === 'video' && DPL.video.readyState >= 2 && DPL.video.currentTime > 0.5, null, { timeout: 15000 });
  const vt1 = await page.evaluate(() => DPL.video.currentTime);
  const f1 = await page.evaluate(() => T.sample(T.grid(0, 0.1, 0.8, 12, [0.3, 0.5, 0.7])));
  await page.waitForTimeout(1200);
  const vt2 = await page.evaluate(() => DPL.video.currentTime);
  const f2 = await page.evaluate(() => T.sample(T.grid(0, 0.1, 0.8, 12, [0.3, 0.5, 0.7])));
  await page.screenshot({ path: path.join(SHOTS, '09_video_2d.png') });
  check('Video local: se carga, se reproduce y la imagen cambia', vt2 > vt1 && diff(f1, f2) > 1, 't ' + vt1.toFixed(2) + ' → ' + vt2.toFixed(2) + ' s; cambio de píxeles ' + diff(f1, f2).toFixed(1));
  // sincronía: una única textura de video alimenta a A y B. Pausado, la franja compartida coincide.
  const vs = await page.evaluate(async (o) => {
    DPL.video.pause(); await new Promise(r => setTimeout(r, 200));
    DPL.S.blend = 0; DPL.apply();
    const vv = [0.25, 0.5, 0.75];
    DPL.S.P[1].on = false; DPL.apply(); const a = T.sample(T.grid(0, 1 - o + 0.01, 0.99, 10, vv));
    DPL.S.P[1].on = true; DPL.S.P[0].on = false; DPL.apply(); const b = T.sample(T.grid(1, 0.01, o - 0.01, 10, vv));
    const aBody = (DPL.S.P[0].on = true, DPL.S.P[1].on = false, DPL.apply(), T.sample(T.grid(0, 0.1, 0.6, 10, vv)));
    DPL.S.P[1].on = true; DPL.S.P[0].on = false; DPL.apply(); const bBody = T.sample(T.grid(1, 0.1, 0.6, 10, vv));
    DPL.S.P[0].on = true; DPL.S.blend = 1; DPL.apply();
    return { a, b, aBody, bBody, sameTex: DPL.uniforms.uSrc.value.isVideoTexture === true };
  }, o);
  check('Video sincronizado: una sola fuente; la franja compartida es idéntica en A y B', vs.sameTex && diff(vs.a, vs.b) < 8 && diff(vs.aBody, vs.bBody) > 10, 'textura única de video: ' + vs.sameTex + '; dif. franja ' + diff(vs.a, vs.b).toFixed(1) + '; dif. partes propias ' + diff(vs.aBody, vs.bBody).toFixed(1));
  await page.click('#btn2d'); await page.evaluate(() => DPL.video.play()); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '10_video_3d.png') });
  await page.evaluate(() => DPL.video.pause());

  // ---------- 8. Rendimiento (CPU 4× más lenta y calidad baja) ----------
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const tl = Date.now();
  await page.goto(URL.split('?')[0] + '?q=low');
  await page.waitForFunction(() => document.body.classList.contains('ready'));
  const lowLoad = Date.now() - tl;
  await page.waitForTimeout(1500);
  const idle1 = await page.evaluate(() => DPL.stats().info.frame);
  await page.waitForTimeout(1500);
  const idle2 = await page.evaluate(() => DPL.stats().info.frame);
  const perf = await page.evaluate(() => {
    const t = []; for (let i = 0; i < 10; i++) { const s = performance.now(); DPL.renderNow(); t.push(performance.now() - s); }
    t.sort((a, b) => a - b);
    return { medianRenderMs: t[5], heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null };
  });
  // Respuesta de la interfaz: mover un control y medir cuánto tarda
  const tIn = Date.now(); await page.fill('#sBlend', '0.5'); const inputMs = Date.now() - tIn;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check('Interfaz liviana con CPU 4× más lenta', lowLoad < 8000 && perf.heapMB < 60, 'carga ' + lowLoad + ' ms; memoria JS ' + (perf.heapMB || 0).toFixed(1) + ' MB; render mediano ' + perf.medianRenderMs.toFixed(1) + ' ms (GPU por software); respuesta a un control ' + inputMs + ' ms');
  check('En reposo no se redibuja (no consume GPU)', idle2 === idle1, 'cuadros dibujados en 1,5 s quieta: ' + (idle2 - idle1));
  const cursor = await page.evaluate(() => document.pointerLockElement === null);
  check('No usa bloqueo del puntero', cursor, 'pointerLockElement = null');

  // ---------- 9. Teléfono (diseño adaptable, sin scroll horizontal) ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: path.join(SHOTS, '11_movil.png') });
  check('Pantalla angosta sin desplazamiento horizontal', overflow <= 0, 'exceso: ' + overflow + ' px');

  check('Sin errores de JavaScript durante toda la prueba', errors.length === 0, JSON.stringify(errors));
  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  require('fs').writeFileSync(path.join(SHOTS, 'resultados.json'), JSON.stringify(results, null, 2));
  console.log('\n' + (results.length - fails) + '/' + results.length + ' pruebas pasaron.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
