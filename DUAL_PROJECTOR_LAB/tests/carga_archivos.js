/* Prueba específica de "Cargar video local…" y "Cargar imagen…".
 * Uso:  node tests/carga_archivos.js <url> [selector-iframe] [carpetaCapturas]
 * Ejecutar con navegador visible:  xvfb-run -a node tests/carga_archivos.js ...
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2];
const IFR = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
const SHOTS = process.argv[4] || path.join(__dirname, 'capturas');
const TAG = (process.argv[5] || 'carga');
fs.mkdirSync(SHOTS, { recursive: true });
const VIDEO = path.join(__dirname, 'video_prueba.webm');
const IMAGE = path.join(__dirname, 'imagen_prueba.png');

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASA ' : 'FALLA') + ' · ' + name + (detail ? ' — ' + detail : '')); }
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  const root = IFR ? page.frameLocator(IFR) : page;
  await root.locator('body.ready').waitFor();
  const F = () => (IFR ? page.frames()[1] : page.mainFrame());
  console.log('Navegador visible:', browser.version(), '· URL:', URL, IFR ? '(dentro de iframe ' + IFR + ')' : '');

  // ---- 1. Botón "Cargar imagen…": clic real con el mouse ----
  let opened = false, chooser;
  try { [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), root.locator('#btnLoadImage').click()]); opened = true; } catch (e) { }
  check('Clic en "Cargar imagen…" abre el selector de archivos', opened, opened ? 'selector abierto (acepta: ' + (await chooser.element().getAttribute('accept')) + ')' : 'no se abrió');
  if (opened) await chooser.setFiles(IMAGE);
  await F().waitForFunction(() => DPL.S.source === 'image', null, { timeout: 5000 }).catch(() => { });
  // en la vista 2D, medir color en el centro de la parte propia de A y de B
  await F().evaluate(() => { DPL.setView('2d'); });
  await page.waitForTimeout(300);
  const col = await F().evaluate(() => {
    const cy = DPL.centerY();
    const pt = (i, u, v) => { const G = DPL.projGeo(i); return DPL.screenToCanvas(G.cx + (u - 0.5) * G.w, (G.cy - cy) + (v - 0.5) * G.h); };
    const avg = a => [0, 1, 2].map(k => Math.round(a.reduce((s, p) => s + p[k], 0) / a.length));
    const A = DPL.samplePixels([pt(0, 0.3, 0.3), pt(0, 0.4, 0.7), pt(0, 0.2, 0.5)]);
    const B = DPL.samplePixels([pt(1, 0.6, 0.3), pt(1, 0.7, 0.7), pt(1, 0.8, 0.5)]);
    return { A: avg(A), B: avg(B), status: document.getElementById('fileStatus').textContent };
  });
  check('La imagen aparece en la pantalla virtual: A muestra la mitad roja y B la mitad azul', col.A[0] > col.A[2] + 60 && col.B[2] > col.B[0] + 60, 'color medio en A: rgb(' + col.A + ') · en B: rgb(' + col.B + ') · estado: "' + col.status + '"');
  await page.screenshot({ path: path.join(SHOTS, TAG + '_imagen_2d.png') });

  // ---- 2. Botón "Cargar video local…" ----
  opened = false;
  try { [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), root.locator('#btnLoadVideo').click()]); opened = true; } catch (e) { }
  check('Clic en "Cargar video local…" abre el selector de archivos', opened, opened ? 'selector abierto (acepta: ' + (await chooser.element().getAttribute('accept')) + ')' : 'no se abrió');
  if (opened) await chooser.setFiles(VIDEO);
  await F().waitForFunction(() => DPL.S.source === 'video' && !DPL.video.paused && DPL.video.currentTime > 0.3, null, { timeout: 10000 }).catch(() => { });
  // 300 puntos repartidos sobre la imagen proyectada (A + B)
  await F().evaluate(() => { const cy = DPL.centerY(), G0 = DPL.projGeo(0), G1 = DPL.projGeo(1), x0 = G0.cx - G0.w / 2, x1 = G1.cx + G1.w / 2, pts = [];
    for (let j = 0; j < 10; j++) for (let k = 0; k < 30; k++) pts.push(DPL.screenToCanvas(x0 + (x1 - x0) * (k + 0.5) / 30, (G0.cy - cy) + G0.h * ((j + 0.5) / 10 - 0.5)));
    window.__vpts = pts; });
  const v1 = await F().evaluate(() => ({ t: DPL.video.currentTime, px: DPL.samplePixels(window.__vpts) }));
  await page.waitForTimeout(1500);
  const v2 = await F().evaluate(() => ({ t: DPL.video.currentTime, px: DPL.samplePixels(window.__vpts), status: document.getElementById('fileStatus').textContent, w: DPL.video.videoWidth, tex: DPL.uniforms.uSrc.value.isVideoTexture === true }));
  const deltas = v1.px.map((p, i) => Math.abs(p[0] - v2.px[i][0]) + Math.abs(p[1] - v2.px[i][1]) + Math.abs(p[2] - v2.px[i][2]));
  const changed = deltas.filter(d => d > 30).length, pxChange = mean(deltas);
  check('El video se reproduce en la pantalla virtual', v2.t > v1.t + 0.8 && v2.tex && changed >= 3, 'tiempo ' + v1.t.toFixed(2) + ' → ' + v2.t.toFixed(2) + ' s; ancho ' + v2.w + ' px; ' + changed + ' de 300 puntos de la pantalla cambiaron de imagen; estado: "' + v2.status + '"');
  const split = await F().evaluate(() => {
    const o = DPL.S.overlap, cy = DPL.centerY();
    const pt = (i, u, v) => { const G = DPL.projGeo(i); return DPL.screenToCanvas(G.cx + (u - 0.5) * G.w, (G.cy - cy) + (v - 0.5) * G.h); };
    DPL.video.pause();
    const blend = DPL.S.blend; DPL.S.blend = 0; DPL.apply();
    const vs = [0.3, 0.5, 0.7], grid = (i, u0, u1) => { const r = []; vs.forEach(v => { for (let k = 0; k < 8; k++) r.push(pt(i, u0 + (u1 - u0) * k / 7, v)); }); return r; };
    DPL.S.P[1].on = false; DPL.apply(); const aOv = DPL.samplePixels(grid(0, 1 - o + 0.01, 0.99)), aOwn = DPL.samplePixels(grid(0, 0.1, 0.6));
    DPL.S.P[1].on = true; DPL.S.P[0].on = false; DPL.apply(); const bOv = DPL.samplePixels(grid(1, 0.01, o - 0.01)), bOwn = DPL.samplePixels(grid(1, 0.1, 0.6));
    DPL.S.P[0].on = true; DPL.S.blend = blend; DPL.apply(); DPL.video.play();
    const d = (a, b) => a.reduce((s, p, i) => s + (Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2])) / 3, 0) / a.length;
    return { ov: d(aOv, bOv), own: d(aOwn, bOwn) };
  });
  check('El video se reparte entre A y B (partes distintas, franja compartida idéntica)', split.own > 10 && split.ov < 8, 'diferencia en partes propias ' + split.own.toFixed(1) + ' · en la franja compartida ' + split.ov.toFixed(1));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, TAG + '_video_2d.png') });

  // ---- 3. El 3D, la rotación y el Edge Blending siguen funcionando ----
  await F().evaluate(() => DPL.setView('3d'));
  await page.waitForTimeout(300);
  const cam0 = await F().evaluate(() => DPL.S.view);
  const box = await root.locator('#gl').boundingBox();
  const before = await F().evaluate(() => DPL.samplePixels([[0.5, 0.5], [0.3, 0.4], [0.7, 0.6]]));
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.45, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(700);
  await F().evaluate(() => DPL.video.pause());
  const after = await F().evaluate(() => DPL.samplePixels([[0.5, 0.5], [0.3, 0.4], [0.7, 0.6]]));
  const rot = mean(before.map((p, i) => Math.abs(p[0] - after[i][0]) + Math.abs(p[1] - after[i][1]) + Math.abs(p[2] - after[i][2])));
  check('3D activo y la rotación con el mouse cambia la vista', cam0 === '3d' && rot > 5, 'diferencia de imagen tras arrastrar: ' + rot.toFixed(1));
  await page.screenshot({ path: path.join(SHOTS, TAG + '_video_3d_rotado.png') });
  const g0 = await F().evaluate(() => DPL.uniforms.uBlend.value);
  await root.locator('#sBlend').fill('0.3');
  const g1 = await F().evaluate(() => DPL.uniforms.uBlend.value);
  await root.locator('#sOverlap').fill('0.25');
  const o1 = await F().evaluate(() => DPL.uniforms.uO.value);
  check('Controles de Edge Blending siguen funcionando', g0 === 1 && Math.abs(g1 - 0.3) < 1e-6 && Math.abs(o1 - 0.25) < 1e-6, 'intensidad 1 → ' + g1 + ', superposición → ' + o1);

  // ---- 4. Si un visor bloquea el selector: aviso y alternativas que funcionan ----
  await F().evaluate(() => { document.getElementById('fileImage').addEventListener('click', e => e.preventDefault(), { once: true }); });
  await root.locator('#btnLoadImage').click();
  await page.waitForTimeout(2000);
  const warn = await root.locator('#pickBlocked').isVisible();
  check('Si el visor bloquea el selector, aparece un aviso con alternativas', warn, warn ? 'aviso visible' : 'sin aviso');
  await page.screenshot({ path: path.join(SHOTS, TAG + '_aviso_bloqueo.png') });
  const b64 = fs.readFileSync(IMAGE).toString('base64');
  const dropOk = await F().evaluate(async (b64) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'arrastrada.png', { type: 'image/png' }));
    const st = document.getElementById('stage');
    st.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 800));
    return DPL.S.source === 'image' && document.getElementById('fileStatus').textContent.includes('arrastrada.png') && document.getElementById('pickBlocked').hidden;
  }, b64);
  check('Alternativa: arrastrar y soltar la imagen la carga', dropOk, '');
  const pasteOk = await F().evaluate(async (b64) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'pegada.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 800));
    return document.getElementById('fileStatus').textContent.includes('pegada.png');
  }, b64);
  check('Alternativa: pegar el archivo con Ctrl+V lo carga', pasteOk, '');

  const real = errors.filter(e => !/favicon/i.test(e));
  check('Consola sin errores', real.length === 0, JSON.stringify(real));
  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  console.log((results.length - fails) + '/' + results.length + ' pruebas pasaron.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
