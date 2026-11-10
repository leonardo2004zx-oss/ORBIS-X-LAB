/* Prueba real con DOS VENTANAS en un solo monitor (navegador visible).
 * Uso:  xvfb-run -a -s "-screen 0 1920x1080x24" node tests/dos_ventanas.js <url-de-index.html?test=1> [carpetaSalida] [grabar=1]
 * Mide: que cada ventana muestre una parte distinta del mismo video, la sincronía (número de fotograma
 * leído del código de barras PINTADO en cada ventana), FPS, CPU y memoria, y que los controles cambien la imagen.
 */
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');
const URL = process.argv[2];
const OUT = process.argv[3] || path.join(__dirname, 'resultados');
const REC = process.argv[4] === '1';
fs.mkdirSync(OUT, { recursive: true });
const VIDEO = path.join(__dirname, 'video_sincronizacion.webm');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASA ' : 'FALLA') + ' · ' + name + (detail ? ' — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// CPU y memoria de todos los procesos del navegador (Linux /proc)
function chromePids() { try { return execSync("pgrep -f 'chrom'").toString().trim().split('\n').map(Number).filter(Boolean); } catch (e) { return []; } }
function cpuTicks(pids) { let t = 0; pids.forEach(p => { try { const f = fs.readFileSync('/proc/' + p + '/stat', 'utf8').split(') ')[1].split(' '); t += +f[11] + +f[12]; } catch (e) { } }); return t; }
function rssMB(pids) { let k = 0; pids.forEach(p => { try { const m = fs.readFileSync('/proc/' + p + '/status', 'utf8').match(/VmRSS:\s+(\d+)/); if (m) k += +m[1]; } catch (e) { } }); return k / 1024; }
// PSS: memoria proporcional (no cuenta dos veces lo compartido entre procesos) — medida más justa que sumar RSS
function pssMB(pids) { let k = 0; pids.forEach(p => { try { const m = fs.readFileSync('/proc/' + p + '/smaps_rollup', 'utf8').match(/Pss:\s+(\d+)/); if (m) k += +m[1]; } catch (e) { } }); return k / 1024; }

(async () => {
  let rec = null, recT0 = 0;
  if (REC) {   // graba la pantalla virtual para mostrar la demostración
    rec = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1920x1080', '-framerate', '25', '-i', process.env.DISPLAY,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', path.join(OUT, 'demo_dos_ventanas.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    recT0 = Date.now();
    await sleep(800);
  }
  const EXTRA = (process.env.CHROME_ARGS || '--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader').split(' ').filter(Boolean);
  // bloqueador de ventanas emergentes ACTIVO, como en un Edge/Chrome normal (Playwright lo desactiva por defecto)
  const browser = await chromium.launch({ headless: false, ignoreDefaultArgs: ['--disable-popup-blocking'], args: ['--window-position=0,0', '--window-size=1920,530', '--autoplay-policy=no-user-gesture-required'].concat(EXTRA) });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  watch(page);
  await page.goto(URL);
  console.log('Navegador visible ' + browser.version() + ' en pantalla virtual 1920×1080 · ' + URL);

  // 1. abrir el video local con el botón
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('label.file')]);
  await fc.setFiles(VIDEO);
  await page.waitForFunction(() => DPP.video.readyState >= 2);
  const meta = await page.evaluate(() => ({ w: DPP.video.videoWidth, h: DPP.video.videoHeight, d: DPP.video.duration }));
  check('Abre un video local', meta.w === 1280 && meta.h === 720, meta.w + '×' + meta.h + ', ' + meta.d.toFixed(1) + ' s');

  await sleep(500);
  const pssPanel = pssMB(chromePids());
  // 2. abrir dos ventanas independientes
  const pops = [];
  ctx.on('page', p => { watch(p); pops.push(p); });
  await page.evaluate(() => { DPP.S.winRects = [{ x: 0, y: 545, w: 955, h: 535 }, { x: 965, y: 545, w: 955, h: 535 }]; });   // panel arriba, ventanas abajo
  await page.click('#openBoth'); await sleep(500);
  const label2 = await page.textContent('#openBoth');
  await page.click('#openBoth'); await sleep(800);
  const label3 = await page.textContent('#openBoth');
  const wins = await page.evaluate(() => DPP.outs.map(o => o && !o.win.closed ? { title: o.win.document.title } : null));
  check('Se abren dos ventanas independientes (A y B) con el bloqueador de ventanas activo', wins[0] && wins[1] && pops.length === 2, wins.map(w => w && w.title).join(' | ') + ' · botón: «' + label2 + '» → «' + label3 + '»');
  // acomodarlas una al lado de la otra en el monitor (como dos proyectores)
  const wpos = await page.evaluate(() => DPP.outs.map(o => [o.win.screenX, o.win.screenY, o.win.outerWidth, o.win.outerHeight]));
  console.log('posición de las ventanas (x, y, ancho, alto): A ' + wpos[0].join(', ') + ' · B ' + wpos[1].join(', '));
  await sleep(600);

  await sleep(4500);   // espera a que se oculten las etiquetas de las ventanas (tapan el código de barras en la grabación)
  // 3. reproducir y medir
  const pids = chromePids();
  const segIni = (Date.now() - recT0) / 1000;
  const cpu0 = cpuTicks(pids), tm0 = Date.now();
  await page.click('#play');
  await sleep(6000);
  const cpu1 = cpuTicks(pids), tm1 = Date.now();
  const segFin = (Date.now() - recT0) / 1000;
  if (REC) { fs.writeFileSync(path.join(OUT, 'segmento_medicion.txt'), (segIni + 0.5).toFixed(1) + ' ' + (segFin - 0.3).toFixed(1)); console.log('Tramo de reproducción continua en la grabación: ' + (segIni + 0.5).toFixed(1) + '–' + (segFin - 0.3).toFixed(1) + ' s'); }
  const st = await page.evaluate(() => ({ sync: DPP.syncReport(), fps: DPP.outs.map(o => o.fps), draws: DPP.outs.map(o => o.draws), size: DPP.outs.map(o => [o.canvas.width, o.canvas.height]),
    logs: DPP.outs.map(o => o.log.slice(-400)), heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, t: DPP.video.currentTime }));
  const cpuPct = (cpu1 - cpu0) / 100 / ((tm1 - tm0) / 1000) * 100;   // ticks de 10 ms
  const rss = rssMB(chromePids()), pss = pssMB(chromePids());
  await page.screenshot({ path: path.join(OUT, 'panel_reproduciendo.png') });
  for (let i = 0; i < 2; i++) await pops[i].screenshot({ path: path.join(OUT, 'ventana_' + (i ? 'B' : 'A') + '.png') });
  fs.writeFileSync(path.join(OUT, 'registro_fotogramas.json'), JSON.stringify(st.logs));
  const sr = st.sync;
  check('Cada ventana pinta exactamente el fotograma actual del único decodificador', sr && sr.fuenteOK >= 0.98, sr ? (sr.fuenteOK * 100).toFixed(1) + ' % de los dibujos coinciden (±1) con el fotograma de la fuente' : 'sin datos');
  check('Sincronía en pantalla entre A y B', sr && sr.pares > 50 && sr.maxDif <= 1 && sr.iguales / sr.pares >= 0.95 && sr.msP95 <= 17,
    sr ? sr.pares + ' instantes comparados: mismo fotograma en ' + (100 * sr.iguales / sr.pares).toFixed(1) + ' %, diferencia media ' + sr.difMedia.toFixed(2) + ', máxima ' + sr.maxDif + ' fotograma(s) (1 fotograma = 33 ms); un mismo fotograma aparece en A y en B con ' + (sr.msMediana || 0).toFixed(1) + ' ms de diferencia (mediana), ' + (sr.msP95 || 0).toFixed(1) + ' ms (p95)' : 'sin datos');
  const fA = st.logs[0].map(x => x.f), fB = st.logs[1].map(x => x.f);
  const adv = fA.length > 2 && fA[fA.length - 1] > fA[0];
  check('Los fotogramas avanzan al reproducir', adv, 'A: ' + fA[0] + ' → ' + fA[fA.length - 1] + ', B: ' + fB[0] + ' → ' + fB[fB.length - 1]);
  check('Rendimiento (FPS, CPU, memoria)', st.fps[0] >= 20 && st.fps[1] >= 20,
    'FPS dibujados A ' + st.fps[0].toFixed(0) + ' / B ' + st.fps[1].toFixed(0) + ' (video de 30 fps) · ventanas ' + st.size.map(s => s.join('×')).join(' y ') +
    ' · CPU del navegador ' + cpuPct.toFixed(0) + ' % de un núcleo · memoria del navegador (PSS) ' + pss.toFixed(0) + ' MB con las dos ventanas reproduciendo, ' + pssPanel.toFixed(0) + ' MB solo con el panel (RSS sumado ' + rss.toFixed(0) + ' MB) · JS ' + (st.heap || 0).toFixed(1) + ' MB');

  // 4. cada ventana muestra una parte DIFERENTE: colores de las letras A (naranja) y B (celeste) del video
  const look = async () => Promise.all([0, 1].map(i => page.evaluate((i) => {
    const o = DPP.outs[i], d = o.ctx.getImageData(0, 0, o.canvas.width, o.canvas.height).data;
    let orange = 0, blue = 0, n = 0;
    for (let k = 0; k < d.length; k += 4 * 37) { n++; const r = d[k], g = d[k + 1], b = d[k + 2]; if (r > 230 && g > 130 && g < 190 && b < 110) orange++; if (b > 230 && g > 160 && g < 220 && r < 110) blue++; }
    return { orange: orange / n, blue: blue / n, frame: o.frame };
  }, i)));
  const lk = await look();
  check('Cada ventana muestra una parte diferente del mismo video', lk[0].orange > 0.002 && lk[0].blue < 0.0005 && lk[1].blue > 0.002 && lk[1].orange < 0.0005,
    'A: letra «A» naranja ' + (lk[0].orange * 100).toFixed(1) + ' %, «B» celeste ' + (lk[0].blue * 100).toFixed(2) + ' % · B: «A» ' + (lk[1].orange * 100).toFixed(2) + ' %, «B» ' + (lk[1].blue * 100).toFixed(1) + ' %');

  // 5. pausa: las dos ventanas se detienen en el mismo fotograma
  await page.click('#play'); await sleep(500);
  const p1 = await page.evaluate(() => DPP.outs.map(o => o.frame)); await sleep(1200);
  const p2 = await page.evaluate(() => DPP.outs.map(o => o.frame));
  check('Pausa: ambas ventanas quedan quietas en el mismo fotograma', p1[0] === p2[0] && p1[1] === p2[1] && p2[0] === p2[1], 'A ' + p1[0] + '→' + p2[0] + ' · B ' + p1[1] + '→' + p2[1]);
  // búsqueda: ir a 10 s
  await page.evaluate(() => { DPP.video.currentTime = 10; }); await sleep(800);
  const sk = await page.evaluate(() => DPP.outs.map(o => o.frame));
  check('Saltar a 10 s cambia el fotograma en ambas ventanas', sk[0] === sk[1] && Math.abs(sk[0] - 300) <= 1, 'fotograma A ' + sk[0] + ', B ' + sk[1] + ' (esperado 300)');

  // 6. los controles cambian realmente los fotogramas de las ventanas
  const grab = (i, fx, fw) => page.evaluate(([i, fx, fw]) => { const o = DPP.outs[i]; const W = o.canvas.width, H = o.canvas.height;
    const d = o.ctx.getImageData(Math.floor(fx * W), Math.floor(H * 0.3), Math.max(1, Math.floor(fw * W)), Math.floor(H * 0.4)).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += (d[k] + d[k + 1] + d[k + 2]) / 3; return s / (d.length / 4); }, [i, fx, fw]);
  // blending: el borde derecho de A se oscurece con blending y no sin él
  const eOn = await grab(0, 0.97, 0.02), mOn = await grab(0, 0.6, 0.02);
  await page.click('#blend'); await sleep(300);
  const eOff = await grab(0, 0.97, 0.02);
  await page.click('#blend'); await sleep(300);
  check('Edge blending atenúa realmente el borde compartido de A', eOn < eOff * 0.5, 'brillo del borde derecho de A: con blending ' + eOn.toFixed(0) + ', sin blending ' + eOff.toFixed(0) + ' (centro ' + mOn.toFixed(0) + ')');
  // solapamiento: Superpuesta → A y B muestran lo mismo
  const diffAB = () => page.evaluate(() => { const a = DPP.outs[0], b = DPP.outs[1]; const W = Math.min(a.canvas.width, b.canvas.width), H = Math.min(a.canvas.height, b.canvas.height);
    const da = a.ctx.getImageData(0, 0, W, H).data, db = b.ctx.getImageData(0, 0, W, H).data; let s = 0, n = 0; for (let k = 0; k < da.length; k += 4 * 23) { s += Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]); n++; } return s / n / 3; });
  const dPano = await diffAB();
  await page.click('[data-o="1"]'); await sleep(400);
  const dStack = await diffAB();
  await page.screenshot({ path: path.join(OUT, 'panel_superpuesta.png') });
  check('Solapamiento: en Superpuesta A y B muestran la misma imagen completa', dPano > 20 && dStack < 3, 'diferencia A/B: panorámica ' + dPano.toFixed(1) + ' → superpuesta ' + dStack.toFixed(1));
  await page.click('[data-o="0.5"]'); await sleep(300);
  const dHyb = await diffAB();
  check('Híbrida (50 %): A y B comparten la mitad', dHyb > 5 && dHyb < dPano, 'diferencia A/B ' + dHyb.toFixed(1));
  await page.click('[data-o="0.15"]'); await sleep(300);
  // proporción: «Encajar» conserva la proporción 16:9 de la película
  const asp = await page.evaluate(() => { const o = DPP.outs[0]; const r = DPPCore.movieRect(DPP.video.videoWidth, DPP.video.videoHeight, o.canvas.width, o.canvas.height, DPP.S.o, DPP.S.fit); return r.w / r.h; });
  await page.selectOption('#fit', 'stretch'); await sleep(200);
  const aspS = await page.evaluate(() => { const o = DPP.outs[0]; const r = DPPCore.movieRect(DPP.video.videoWidth, DPP.video.videoHeight, o.canvas.width, o.canvas.height, DPP.S.o, DPP.S.fit); return r.w / r.h; });
  const bandsS = await grab(0, 0.02, 0.02);
  await page.selectOption('#fit', 'contain'); await sleep(200);
  const bandsC = await grab(0, 0.02, 0.02);
  check('«Encajar» mantiene la proporción original (16:9); «Estirar» la deforma', Math.abs(asp - 16 / 9) < 0.01 && aspS > 2.5 && bandsC < 5 && bandsS > 20,
    'proporción con Encajar ' + asp.toFixed(3) + ' (16:9 = 1,778), con Estirar ' + aspS.toFixed(2) + '; borde izquierdo de A: negro ' + bandsC.toFixed(0) + ' (barra lateral) vs. imagen ' + bandsS.toFixed(0));
  // alineación fina: ▶ en B mueve la imagen 2 px
  const fB0 = await page.evaluate(() => { const o = DPP.outs[1]; return Array.from(o.ctx.getImageData(0, Math.floor(o.canvas.height / 2) + 20, o.canvas.width, 1).data); });
  await page.click('[data-n="1,1,0"]'); await sleep(300);
  const fB1 = await page.evaluate(() => { const o = DPP.outs[1]; return Array.from(o.ctx.getImageData(0, Math.floor(o.canvas.height / 2) + 20, o.canvas.width, 1).data); });
  let best = 0, bestE = 1e9; for (let s = -6; s <= 6; s++) { let e = 0, n = 0; for (let x = 20; x < fB0.length / 4 - 20; x++) { const a = x * 4, b = (x + s) * 4; e += Math.abs(fB0[a] - fB1[b]); n++; } if (e / n < bestE) { bestE = e / n; best = s; } }
  check('Alineación fina: ▶ mueve la imagen de B 2 píxeles', best === 2, 'desplazamiento medido ' + best + ' px');
  await page.click('#resetAlign');
  // cuadrícula de calibración
  const g0 = await grab(1, 0.3, 0.4); await page.click('#grid'); await sleep(300); const g1 = await grab(1, 0.3, 0.4); await page.click('#grid');
  check('Cuadrícula de calibración se dibuja en las ventanas', Math.abs(g1 - g0) > 2, 'brillo medio ' + g0.toFixed(1) + ' → ' + g1.toFixed(1));

  // 7. pantalla completa desde la ventana (botón ⛶)
  const fsOk = await pops[0].evaluate(async () => { try { await document.documentElement.requestFullscreen(); return !!document.fullscreenElement; } catch (e) { return 'error: ' + e.message; } });
  await sleep(700);
  await pops[0].screenshot({ path: path.join(OUT, 'ventana_A_pantalla_completa.png') });
  const fsSize = await page.evaluate(() => [DPP.outs[0].canvas.width, DPP.outs[0].canvas.height]);
  await pops[0].evaluate(() => document.exitFullscreen().catch(() => { }));
  check('Pantalla completa en la ventana A (pedido aceptado por el navegador)', fsOk === true, 'requestFullscreen → ' + fsOk + '; tamaño del lienzo ' + fsSize.join('×') + (fsSize[0] < 1900 ? ' (esta pantalla virtual no tiene gestor de ventanas, por eso no cambió el tamaño: NO verificado visualmente)' : ''));

  // reproducir unos segundos más para la grabación
  await page.evaluate(() => { DPP.video.currentTime = 0; DPP.S.grid = false; DPP.bump(); }); await page.click('#play'); await sleep(REC ? 5000 : 500);
  const real = errors.filter(e => !/favicon/i.test(e));
  check('Sin errores de JavaScript', real.length === 0, JSON.stringify(real));
  await browser.close();
  if (rec) { rec.stdin.write('q'); await new Promise(r => rec.on('close', r)); }
  const fails = results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(results, null, 2));
  console.log((results.length - fails) + '/' + results.length + ' pruebas pasaron.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
