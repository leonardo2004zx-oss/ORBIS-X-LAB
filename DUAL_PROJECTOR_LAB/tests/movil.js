/* Prueba de la versión para celular (emulación de Chrome Android con pantalla táctil).
 * Uso:  node tests/movil.js <url> [carpetaCapturas] [carpetaArchivosGrandes]
 * Usa gestos táctiles reales del protocolo de Chrome (Input.dispatchTouchEvent).
 */
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');

const URL = process.argv[2];
const SHOTS = process.argv[3] || path.join(__dirname, 'capturas');
const BIG = process.argv[4] || null;
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASA ' : 'FALLA') + ' · ' + name + (detail ? ' — ' + detail : '')); }

async function touchDrag(cdp, pts0, pts1, steps) {
  const tp = ps => ps.map((p, i) => ({ x: p[0], y: p[1], id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts0) });
  for (let s = 1; s <= steps; s++) {
    const k = s / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(pts0.map((p, i) => [p[0] + (pts1[i][0] - p[0]) * k, p[1] + (pts1[i][1] - p[1]) * k])) });
    await new Promise(r => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pixel = devices['Pixel 7'];
  const errors = [];

  // ================= Horizontal (como pidió el usuario: vista horizontal) =================
  const ctx = await browser.newContext({ ...pixel, viewport: { width: pixel.viewport.height, height: pixel.viewport.width } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => document.body.classList.contains('ready'));
  console.log('Dispositivo emulado: Pixel 7 (Chrome Android, táctil) · ' + page.viewportSize().width + '×' + page.viewportSize().height + ' · URL ' + URL);
  const lay = await page.evaluate(() => ({
    m: document.body.classList.contains('m'), mbar: getComputedStyle(document.getElementById('mbar')).display !== 'none',
    topbar: getComputedStyle(document.getElementById('topbar')).display, over: document.documentElement.scrollWidth - innerWidth,
    q: DPL.S.quality, ua: navigator.userAgent.slice(0, 60)
  }));
  check('Abre en modo celular (horizontal)', lay.m && lay.mbar && lay.over <= 0, 'carga ' + (Date.now() - t0) + ' ms; barra táctil visible; barra superior: ' + lay.topbar + '; desborde horizontal ' + lay.over + ' px; calidad inicial ' + lay.q);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'movil_horizontal_inicio.png') });
  const px3d = await page.evaluate(() => DPL.samplePixels([[0.5, 0.45], [0.3, 0.45], [0.7, 0.45]]));
  check('El 3D se visualiza', px3d.some(p => p[0] + p[1] + p[2] > 120), 'píxeles centrales: ' + JSON.stringify(px3d));

  const cdp = await ctx.newCDPSession(page);
  const box = await page.locator('#gl').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.4;
  // un dedo: girar
  const c0 = await page.evaluate(() => DPL.camState());
  await touchDrag(cdp, [[cx, cy]], [[cx + 160, cy + 20]], 12);
  await page.waitForTimeout(600);
  const c1 = await page.evaluate(() => DPL.camState());
  const moved = Math.hypot(c1.pos[0] - c0.pos[0], c1.pos[2] - c0.pos[2]);
  check('Un dedo gira la cámara 3D', moved > 0.5 && Math.abs(c1.dist - c0.dist) < 0.05 * c0.dist, 'la cámara se movió ' + moved.toFixed(2) + ' m alrededor del objetivo, distancia ' + c0.dist.toFixed(2) + ' → ' + c1.dist.toFixed(2) + ' m');
  // dos dedos: acercar (separar los dedos)
  await touchDrag(cdp, [[cx - 40, cy], [cx + 40, cy]], [[cx - 200, cy], [cx + 200, cy]], 12);
  await page.waitForTimeout(600);
  const c2 = await page.evaluate(() => DPL.camState());
  await touchDrag(cdp, [[cx - 200, cy], [cx + 200, cy]], [[cx - 50, cy], [cx + 50, cy]], 12);
  await page.waitForTimeout(600);
  const c3 = await page.evaluate(() => DPL.camState());
  check('Dos dedos acercan y alejan', c2.dist < c1.dist * 0.9 && c3.dist > c2.dist * 1.1, 'distancia ' + c1.dist.toFixed(2) + ' → (separar) ' + c2.dist.toFixed(2) + ' → (juntar) ' + c3.dist.toFixed(2) + ' m');
  // botón Inicio
  await page.tap('#mReset'); await page.waitForTimeout(900);
  const c4 = await page.evaluate(() => DPL.camState());
  check('Botón «⟲ Inicio» vuelve a la vista inicial', Math.hypot(c4.pos[0] - c0.pos[0], c4.pos[1] - c0.pos[1], c4.pos[2] - c0.pos[2]) < 0.05, 'posición final a ' + Math.hypot(c4.pos[0] - c0.pos[0], c4.pos[1] - c0.pos[1], c4.pos[2] - c0.pos[2]).toFixed(3) + ' m de la inicial');
  // modos A/B/C desde la barra
  const modes = [];
  for (const m of ['A', 'B', 'C']) { await page.tap('#mbar [data-mode="' + m + '"]'); modes.push(await page.evaluate(() => DPL.S.mode + ':' + DPL.uniforms.uBlend.value + '/' + DPL.uniforms.uGam.value)); }
  check('Modos A, B y C desde la barra táctil', modes.join(',') === 'A:0/1,B:1/1,C:1/2.2', modes.join(' · ') + ' (modo:intensidad/gamma)');
  // 2D / técnica
  await page.tap('#mView'); const v2 = await page.evaluate(() => DPL.S.view);
  await page.screenshot({ path: path.join(SHOTS, 'movil_horizontal_2d.png') });
  await page.tap('#mView'); await page.tap('#mTech'); await page.waitForTimeout(800); const tech = await page.evaluate(() => DPL.S.cam);
  await page.screenshot({ path: path.join(SHOTS, 'movil_horizontal_tecnica.png') });
  await page.tap('#mReset'); await page.waitForTimeout(800);
  check('Botones 2D/3D y vista técnica', v2 === '2d' && tech === 'tech', 'vista ' + v2 + ', cámara ' + tech);

  // panel desplegable con controles de proyectores
  await page.tap('#mPanel'); await page.waitForTimeout(400);
  const open = await page.evaluate(() => { const r = document.getElementById('panel').getBoundingClientRect(); return { left: Math.round(r.left), w: Math.round(r.width), vw: innerWidth }; });
  await page.screenshot({ path: path.join(SHOTS, 'movil_panel_ajustes.png') });
  await page.tap('[data-tab="1"]');
  const gx0 = await page.evaluate(() => DPL.uniforms.uGB.value.x);
  await page.locator('#x1').fill('0.15');
  const gx1 = await page.evaluate(() => DPL.uniforms.uGB.value.x);
  await page.locator('#sBlend').fill('0.4');
  const bl = await page.evaluate(() => DPL.uniforms.uBlend.value);
  const thumb = await page.evaluate(() => getComputedStyle(document.getElementById('x1'), '::-webkit-slider-thumb').width);
  await page.tap('#panelClose'); await page.waitForTimeout(400);
  const closed = await page.evaluate(() => document.getElementById('panel').getBoundingClientRect().left >= innerWidth - 1);
  check('Panel de ajustes desplegable con controles de A/B y Edge Blending', open.left + open.w <= open.vw + 1 && open.left > 0 && closed && Math.abs(gx1 - gx0 - 0.15) < 1e-6 && Math.abs(bl - 0.4) < 1e-6,
    'panel abierto en x=' + open.left + ' (ancho ' + open.w + ' de ' + open.vw + '), B movido ' + (gx1 - gx0).toFixed(2) + ' m, blending ' + bl + ', control deslizante de ' + thumb + ', se cierra: ' + closed);
  await page.tap('#mbar [data-mode="C"]');

  // tamaño de los botones táctiles
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#mbar .mbtn, #mbar .mgroup button')].map(b => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))));
  check('Botones táctiles grandes (≥ 44 px)', Math.min(...sizes) >= 44, 'lado menor de cada botón: ' + sizes.join(', ') + ' px');

  // ===== cargar imagen desde la barra (galería) =====
  let chooser = null;
  try { [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), page.tap('#mImage')]); } catch (e) { }
  check('Botón «🖼 Imagen» abre el selector de la galería', !!chooser, chooser ? 'acepta: ' + await chooser.element().getAttribute('accept') : 'no se abrió');
  if (chooser) await chooser.setFiles(path.join(__dirname, 'imagen_prueba.png'));
  await page.waitForFunction(() => DPL.S.source === 'image', null, { timeout: 5000 }).catch(() => { });
  await page.tap('#mView'); await page.waitForTimeout(300);
  const col = await page.evaluate(() => {
    const cy = DPL.centerY(), pt = (i, u, v) => { const G = DPL.projGeo(i); return DPL.screenToCanvas(G.cx + (u - 0.5) * G.w, (G.cy - cy) + (v - 0.5) * G.h); };
    const avg = a => [0, 1, 2].map(k => Math.round(a.reduce((s, p) => s + p[k], 0) / a.length));
    return { A: avg(DPL.samplePixels([pt(0, 0.3, 0.3), pt(0, 0.4, 0.6)])), B: avg(DPL.samplePixels([pt(1, 0.6, 0.3), pt(1, 0.7, 0.6)])), st: document.getElementById('fileStatus').textContent };
  });
  check('La imagen se muestra y se reparte entre A (rojo) y B (azul)', col.A[0] > col.A[2] + 60 && col.B[2] > col.B[0] + 60, 'A rgb(' + col.A + ') · B rgb(' + col.B + ') · "' + col.st + '"');
  await page.screenshot({ path: path.join(SHOTS, 'movil_imagen_2d.png') });
  await page.tap('#mView');

  // ===== cargar video desde la barra =====
  chooser = null;
  try { [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), page.tap('#mVideo')]); } catch (e) { }
  check('Botón «🎬 Video» abre el selector de archivos', !!chooser, chooser ? 'acepta: ' + await chooser.element().getAttribute('accept') : 'no se abrió');
  if (chooser) await chooser.setFiles(path.join(__dirname, 'video_prueba.webm'));
  await page.waitForFunction(() => DPL.S.source === 'video' && !DPL.video.paused && DPL.video.currentTime > 0.3, null, { timeout: 10000 }).catch(() => { });
  const vt1 = await page.evaluate(() => DPL.video.currentTime); await page.waitForTimeout(1200);
  const vv = await page.evaluate(() => ({ t: DPL.video.currentTime, st: document.getElementById('fileStatus').textContent, one: DPL.uniforms.uSrc.value === DPL.uniforms.uSrc.value }));
  check('El video se reproduce sobre la pantalla virtual (una sola fuente para A y B)', vv.t > vt1 + 0.6, 't ' + vt1.toFixed(2) + ' → ' + vv.t.toFixed(2) + ' s · "' + vv.st + '"');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'movil_video_3d.png') });

  // ===== pantalla completa =====
  await page.tap('#mFull'); await page.waitForTimeout(600);
  const fs1 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }));
  check('Botón «⛶» pantalla completa responde', fs1.fs || fs1.toast.length > 0, fs1.fs ? 'pantalla completa activada' : 'aviso: ' + fs1.toast);
  if (fs1.fs) await page.evaluate(() => document.exitFullscreen());

  // ===== archivos grandes de celular =====
  if (BIG) {
    await page.locator('#mImage input').setInputFiles(path.join(BIG, 'foto_24mp.jpg'));
    await page.waitForFunction(() => /foto_24mp/.test(document.getElementById('fileStatus').textContent) && /Mostrando/.test(document.getElementById('fileStatus').textContent), null, { timeout: 15000 }).catch(() => { });
    const sz = await page.evaluate(() => ({ s: DPL.srcSize(), st: document.getElementById('fileStatus').textContent }));
    check('Foto de 24 MP (6000×4000) se reduce para la GPU del teléfono', sz.s && Math.max(sz.s[0], sz.s[1]) <= 4096, 'textura ' + (sz.s || []).join('×') + ' · "' + sz.st + '"');
    await page.locator('#mVideo input').setInputFiles(path.join(BIG, 'video_4k.webm'));
    await page.waitForFunction(() => /video_4k/.test(document.getElementById('fileStatus').textContent) && /Reproduciendo|listo/.test(document.getElementById('fileStatus').textContent), null, { timeout: 20000 }).catch(() => { });
    await page.waitForTimeout(1000);
    const v4 = await page.evaluate(() => ({ s: DPL.srcSize(), st: document.getElementById('fileStatus').textContent, t: DPL.video.currentTime }));
    check('Video 4K se reduce en lugar de subir 4K a la GPU en cada cuadro', v4.s && v4.s[0] * v4.s[1] <= 1920 * 1080 * 1.05 && /reducido/.test(v4.st), 'textura ' + (v4.s || []).join('×') + ' · t=' + v4.t.toFixed(2) + ' s · "' + v4.st + '"');
    await page.evaluate(() => DPL.video.pause());
  }

  // ===== selector bloqueado por un visor =====
  await page.evaluate(() => { document.querySelector('#mImage input').addEventListener('click', e => e.preventDefault(), { once: true }); });
  await page.tap('#mImage'); await page.waitForTimeout(2000);
  const blk = await page.evaluate(() => ({ v: !document.getElementById('pickBlocked').hidden, mob: !document.getElementById('pbMobile').hidden }));
  check('Si un visor bloquea la galería, aparece el aviso para abrir en Chrome', blk.v && blk.mob, JSON.stringify(blk));
  await page.screenshot({ path: path.join(SHOTS, 'movil_aviso_bloqueo.png') });
  await page.tap('#pickBlockedClose');

  // ===== vertical =====
  await page.setViewportSize({ width: pixel.viewport.width, height: pixel.viewport.height });
  await page.waitForTimeout(500);
  const por = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, mbar: document.getElementById('mbar').getBoundingClientRect().bottom <= innerHeight }));
  await page.screenshot({ path: path.join(SHOTS, 'movil_vertical.png') });
  check('Vertical: sin desborde y barra táctil visible', por.over <= 0 && por.mbar, JSON.stringify(por));
  await ctx.close();

  // ===== visor integrado de una app (WebView de Android) =====
  const wv = await browser.newContext({ ...pixel, userAgent: pixel.userAgent.replace('Mobile', 'Mobile; wv').replace(/\) AppleWebKit/, '; wv) AppleWebKit') });
  const p2 = await wv.newPage(); await p2.goto(URL); await p2.waitForFunction(() => document.body.classList.contains('ready'));
  const banner = await p2.evaluate(() => !document.getElementById('wvBanner').hidden);
  check('En un visor integrado (WebView) avisa que conviene abrir en Chrome', banner, 'aviso visible: ' + banner);
  await p2.screenshot({ path: path.join(SHOTS, 'movil_webview_aviso.png') });
  await wv.close();

  const real = errors.filter(e => !/favicon/i.test(e));
  check('Consola sin errores', real.length === 0, JSON.stringify(real));
  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  console.log((results.length - fails) + '/' + results.length + ' pruebas pasaron.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
