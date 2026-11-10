/* DUAL PROJECTOR PLAYER — panel de control y ventanas de salida.
 * Un único <video> (en esta ventana) es la fuente. Cada ventana de salida es un popup «about:blank»
 * (mismo origen, funciona aun abriendo index.html con doble clic) que dibuja su parte del MISMO
 * elemento de video en su propio ciclo de refresco. No hay dos reproductores que sincronizar.
 */
(function () {
  'use strict';
  const C = window.DPPCore;
  const $ = function (id) { return document.getElementById(id); };
  const video = $('video');
  const params = new URLSearchParams(location.search);

  const S = {
    o: 0.15, fit: 'contain', blend: 1, gamma: 2.2, curve: 1, grid: false,
    nudge: [{ x: 0, y: 0 }, { x: 0, y: 0 }], bright: [1, 1],
    ver: 1,                                  // cambia con cada ajuste → las salidas redibujan
    test: params.has('test')                 // decodifica el número de fotograma del video de prueba
  };
  const outs = [null, null];
  // Identificador del fotograma presentado: con requestVideoFrameCallback se redibuja solo cuando llega un fotograma
  // nuevo (30 veces/s para un video de 30 fps, no 60). Si la API no está o el panel está oculto, se usa currentTime.
  let vfcId = 0, vfcAt = 0;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = function (now, meta) { vfcId = meta.presentedFrames; vfcAt = performance.now(); video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }
  function frameKey() { return (vfcId && !video.paused && performance.now() - vfcAt < 250) ? 'f' + vfcId : 't' + video.currentTime; }
  let screens = null;

  function bump() { S.ver++; updateUI(); }
  function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 4500); }

  /* ---------------- fuente ---------------- */
  let srcName = '';
  function loadURL(url, name) {
    srcName = name;
    video.src = url; video.loop = $('loop').checked; video.load();
    $('srcInfo').textContent = 'Cargando ' + name + '…';
  }
  $('file').addEventListener('change', function (e) {
    const f = e.target.files[0]; if (!f) return;
    if (video.dataset.obj) URL.revokeObjectURL(video.dataset.obj);
    const u = URL.createObjectURL(f); video.dataset.obj = u;
    loadURL(u, f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)');
    e.target.value = '';
  });
  $('testVid').addEventListener('click', function () { loadURL('tests/video_sincronizacion.webm', 'video de prueba de sincronización'); });
  video.addEventListener('loadedmetadata', function () {
    $('srcInfo').textContent = srcName + ' · ' + video.videoWidth + '×' + video.videoHeight + ' · ' + fmt(video.duration) + ' · proporción ' + (video.videoWidth / video.videoHeight).toFixed(2) + ':1';
    $('play').disabled = false; $('seek').disabled = false; bump();
  });
  video.addEventListener('error', function () {
    const c = video.error ? video.error.code : 0;
    toast(c === 4 ? 'Este navegador no puede reproducir ese formato. Probá MP4 (H.264) o WebM.' : 'No se pudo leer el video.');
    $('srcInfo').textContent = 'Error al abrir el video.';
  });
  ['play', 'pause', 'seeked', 'ended'].forEach(function (ev) { video.addEventListener(ev, function () { S.ver++; updateTransport(); }); });
  video.addEventListener('timeupdate', updateTransport);
  function togglePlay() { if (!video.src) return; if (video.paused) video.play().catch(function (e) { toast('No se pudo reproducir: ' + e.message); }); else video.pause(); }
  $('play').addEventListener('click', togglePlay);
  $('seek').addEventListener('input', function () { if (video.duration) video.currentTime = $('seek').value / 1000 * video.duration; });
  $('mute').addEventListener('click', function () { video.muted = !video.muted; updateTransport(); });
  $('loop').addEventListener('change', function () { video.loop = $('loop').checked; });
  document.addEventListener('keydown', function (e) { if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { e.preventDefault(); togglePlay(); } });
  function fmt(t) { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); }
  function updateTransport() {
    $('play').textContent = video.paused ? '▶' : '❚❚';
    $('mute').textContent = video.muted ? '🔇' : '🔊';
    if (video.duration) { $('seek').value = Math.round(video.currentTime / video.duration * 1000); $('time').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration); }
  }

  /* ---------------- ventanas de salida ---------------- */
  const OUT_HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Proyector</title><style>' +
    'html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{display:block;width:100vw;height:100vh}' +
    '.hud{position:fixed;left:12px;top:12px;display:flex;gap:8px;align-items:center;font:14px Segoe UI,Arial,sans-serif;color:#fff;transition:opacity .4s}' +
    '.hud b{padding:4px 10px;border-radius:8px;background:rgba(0,0,0,.6)}.hud button{font:inherit;color:#fff;background:rgba(30,34,50,.85);border:1px solid #555;border-radius:8px;padding:6px 12px;cursor:pointer}' +
    'body.idle .hud{opacity:0}body.idle{cursor:none}</style></head><body><canvas></canvas><div class="hud"><b class="lbl"></b><span class="info"></span>' +
    '<button class="fs" title="Pantalla completa (F o doble clic)">⛶ Pantalla completa</button></div></body></html>';

  function openOutput(i) {
    if (outs[i] && !outs[i].win.closed) { outs[i].win.focus(); return outs[i]; }
    const scr = screens && screens[+$(i ? 'scrB' : 'scrA').value];
    const R = S.winRects && S.winRects[i];          // posición inicial opcional (por ejemplo, para pruebas)
    const w = R ? R.w : 960, h = R ? R.h : 540;
    const left = R ? R.x : scr ? scr.availLeft + 20 : (window.screenX || 0) + 40 + i * (w + 20);
    const top = R ? R.y : scr ? scr.availTop + 20 : (window.screenY || 0) + 60;
    const win = window.open('', 'dpp_salida_' + i, 'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
    if (!win) {
      const sandboxed = window.top !== window.self;
      toast(sandboxed ? 'Este visor web no deja abrir ventanas nuevas. Para usar dos ventanas/proyectores abrí el reproductor en Windows con INICIAR_REPRODUCTOR.bat (la vista previa de abajo sí funciona aquí).'
        : 'El navegador bloqueó la ventana ' + (i ? 'B' : 'A') + ': permití las ventanas emergentes para esta página (ícono en la barra de direcciones).');
      return null;
    }
    win.document.open(); win.document.write(OUT_HTML); win.document.close();
    // algunos sistemas ignoran la posición pedida al crear la ventana: se refuerza (primero tamaño, después posición)
    try { win.resizeTo(w, h); win.moveTo(left, top); } catch (e) { }
    const d = win.document, canvas = d.querySelector('canvas');
    const o = { i: i, win: win, canvas: canvas, ctx: canvas.getContext('2d', { alpha: false }), lastT: -1, lastVer: 0, draws: 0, fps: 0, fpsN: 0, fpsT: 0, log: [], frame: null };
    d.title = 'Proyector ' + (i ? 'B' : 'A') + ' — Dual Projector Player';
    d.querySelector('.lbl').textContent = 'Proyector ' + (i ? 'B' : 'A');
    d.querySelector('.lbl').style.color = i ? '#7fd4ff' : '#ffb070';
    const fs = function () { if (d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen().catch(function (e) { toast('Pantalla completa no permitida: ' + e.message); }); };
    d.querySelector('.fs').addEventListener('click', fs);
    d.addEventListener('dblclick', fs);
    d.addEventListener('keydown', function (e) { if (e.code === 'KeyF') fs(); if (e.code === 'Space') { e.preventDefault(); togglePlay(); } });
    let idle = 0;
    d.addEventListener('mousemove', function () { d.body.classList.remove('idle'); clearTimeout(idle); idle = win.setTimeout(function () { d.body.classList.add('idle'); }, 2500); });
    idle = win.setTimeout(function () { d.body.classList.add('idle'); }, 4000);
    win.addEventListener('pagehide', function () { outs[i] = null; updateUI(); });
    outs[i] = o;
    const tick = function (now) {
      if (win.closed || outs[i] !== o) return;
      drawAll();    // la primera ventana que refresca dibuja A y B en la MISMA tarea, con el mismo fotograma
      const W = o.canvas.width, H = o.canvas.height;
      if (now - o.fpsT >= 1000) { o.fps = o.fpsN * 1000 / (now - o.fpsT || 1000); o.fpsN = 0; o.fpsT = now; d.querySelector('.info').textContent = W + '×' + H + ' · ' + o.fps.toFixed(0) + ' fps'; }
      win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
    updateUI();
    return o;
  }
  // Instantánea única del fotograma: A y B se dibujan desde el MISMO VideoFrame (sin copiar píxeles), así el
  // decodificador no puede avanzar entre el dibujo de A y el de B. Si el navegador no tiene VideoFrame, se usa el <video>.
  const HAS_VF = typeof window.VideoFrame === 'function';
  function snapshot() {
    if (video.readyState < 2) return null;
    if (HAS_VF) { try { return new VideoFrame(video); } catch (e) { } }
    return video;
  }
  function drawAll() {
    const t = frameKey();
    const need = outs.some(function (o) { return o && !o.win.closed && (t !== o.lastT || o.lastVer !== S.ver || o.canvas.width !== Math.max(1, o.win.innerWidth) || o.canvas.height !== Math.max(1, o.win.innerHeight)); });
    if (!need) return;
    const src = snapshot();
    try { drawWith(src, t); } finally { if (src && src !== video && src.close) src.close(); }
  }
  function drawWith(src, t) {
    for (let k = 0; k < 2; k++) {
      const o = outs[k]; if (!o || o.win.closed) continue;
      const W = Math.max(1, o.win.innerWidth), H = Math.max(1, o.win.innerHeight);   // 1 píxel de lienzo por píxel de pantalla (más liviano)
      if (o.canvas.width !== W || o.canvas.height !== H) { o.canvas.width = W; o.canvas.height = H; o.lastVer = -1; }
      if (t !== o.lastT || o.lastVer !== S.ver) {          // solo dibuja si cambió el fotograma o un ajuste
        C.drawOutput(o.ctx, src, k, S, W, H);
        o.lastT = t; o.lastVer = S.ver; o.draws++; o.fpsN++;
        if (S.test) decodeFrame(o, W, H);
      }
    }
  }
  window.addEventListener('pagehide', function () { });
  $('openA').addEventListener('click', function () { openOutput(0); });
  $('openB').addEventListener('click', function () { openOutput(1); });
  // Los navegadores permiten UNA ventana nueva por clic (bloqueador de ventanas emergentes):
  // este botón abre A y, en el clic siguiente, B.
  function isOpen(i) { return !!(outs[i] && !outs[i].win.closed); }
  $('openBoth').addEventListener('click', function () {
    if (!isOpen(0)) openOutput(0); else if (!isOpen(1)) openOutput(1); else { outs[0].win.focus(); }
    updateOpenBoth();
  });
  function updateOpenBoth() {
    const b = $('openBoth');
    b.textContent = !isOpen(0) ? 'Abrir A y B (2 clics)' : !isOpen(1) ? 'Ahora tocá para abrir B ▸' : 'A y B abiertas ✓';
    b.classList.toggle('pulse', isOpen(0) && !isOpen(1));
  }
  $('closeAll').addEventListener('click', function () { outs.forEach(function (o) { if (o) o.win.close(); }); outs[0] = outs[1] = null; updateUI(); });
  window.addEventListener('beforeunload', function () { outs.forEach(function (o) { if (o) o.win.close(); }); });

  // Pantallas (Window Management API de Chrome/Edge): permite abrir cada ventana en un monitor/proyector
  $('screens').addEventListener('click', async function () {
    if (!('getScreenDetails' in window)) { toast('Este navegador no permite elegir pantallas desde la página. Arrastrá cada ventana a su proyector.'); return; }
    try {
      const det = await window.getScreenDetails();
      screens = det.screens;
      ['scrA', 'scrB'].forEach(function (id, k) {
        $(id).innerHTML = screens.map(function (s, n) { return '<option value="' + n + '">' + (n + 1) + ': ' + (s.label || 'Pantalla') + ' ' + s.width + '×' + s.height + (s.isPrimary ? ' (principal)' : '') + '</option>'; }).join('');
        $(id).value = String(Math.min(k + (screens.length > 2 ? 1 : 0), screens.length - 1));
      });
      toast(screens.length + ' pantalla(s) detectada(s).');
    } catch (e) { toast('No se pudo leer la lista de pantallas: ' + e.message); }
  });

  /* ---------------- medición con el video de prueba ---------------- */
  // Lee el código de barras de 12 bits que el video de prueba lleva en cada mitad y anota el fotograma mostrado
  const BARS = [[0.05, 0.40], [0.60, 0.95]], BAR_Y = 0.08, BITS = 12;
  function decodeFrame(o, W, H) {
    if (video.readyState < 2) return;
    const r = C.movieRect(video.videoWidth, video.videoHeight, W, H, S.o, S.fit), ox = C.outputOffset(o.i, W, S.o), n = S.nudge[o.i];
    for (let k = 0; k < BARS.length; k++) {
      const xs = [];
      for (let b = 0; b < BITS; b++) xs.push(Math.round(r.x - ox + n.x + (BARS[k][0] + (b + 0.5) * (BARS[k][1] - BARS[k][0]) / BITS) * r.w));
      const y = Math.round(r.y + n.y + BAR_Y * r.h);
      if (xs[0] < 0 || xs[BITS - 1] >= W || y < 0 || y >= H) continue;
      // la zona de blending atenúa la señal: se lee solo si el código cae fuera de ella
      const ovA = o.i === 0 ? W * (1 - S.o) : W * S.o;
      if (S.blend > 0 && S.o > 0.001 && S.o < 0.999 && (o.i === 0 ? xs[BITS - 1] >= ovA : xs[0] <= ovA)) continue;
      try {
        const row = o.ctx.getImageData(xs[0], y, xs[BITS - 1] - xs[0] + 1, 1).data;
        let f = 0;
        for (let b = 0; b < BITS; b++) { const p = (xs[b] - xs[0]) * 4; f = (f << 1) | ((row[p] + row[p + 1] + row[p + 2]) / 3 > 128 ? 1 : 0); }
        o.frame = f;
        o.log.push({ t: o.win.performance.timeOrigin + o.win.performance.now(), f: f, ct: video.currentTime });
        if (o.log.length > 4000) o.log.splice(0, 1000);
      } catch (e) { o.frame = null; }   // lienzo «contaminado» (video abierto por file://): no se puede leer
      return;
    }
  }
  // Sincronía medida sobre lo PINTADO: para cada fotograma que dibuja A, qué fotograma tiene B en pantalla en ese instante
  // (su último dibujo anterior). También compara lo pintado con el fotograma actual del decodificador (fuente).
  function syncReport() {
    const A = outs[0] && outs[0].log, B = outs[1] && outs[1].log;
    if (!A || !B || A.length < 5 || B.length < 5) return null;
    const fps = 30;
    let n = 0, same = 0, maxD = 0, sum = 0, j = 0;
    const t0 = Math.max(A[0].t, B[0].t);
    for (let k = 0; k < A.length; k++) {
      if (A[k].t < t0) continue;
      // lo que B tiene en pantalla cuando se muestra el dibujo de A: su último dibujo hasta un refresco después (16 ms)
      while (j + 1 < B.length && B[j + 1].t <= A[k].t + 16) j++;
      if (B[j].t > A[k].t + 16) continue;
      const d = Math.abs(A[k].f - B[j].f); n++; sum += d; if (d === 0) same++; if (d > maxD) maxD = d;
    }
    let src = 0, srcN = 0;
    A.concat(B).forEach(function (e) { srcN++; if (Math.abs(e.f - Math.round(e.ct * fps)) <= 1) src++; });
    // separación temporal entre el dibujo de A y el de B del mismo fotograma (ms)
    const gaps = []; let jj = 0;
    A.forEach(function (a) { while (jj < B.length && B[jj].f < a.f) jj++; if (jj < B.length && B[jj].f === a.f) gaps.push(Math.abs(B[jj].t - a.t)); });
    gaps.sort(function (x, y) { return x - y; });
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, p95 = gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : null;
    return n ? { pares: n, iguales: same, maxDif: maxD, difMedia: sum / n, fuenteOK: src / srcN, msMediana: med, msP95: p95 } : null;
  }

  /* ---------------- panel ---------------- */
  const pv = [$('pvA').getContext('2d', { alpha: false }), $('pvB').getContext('2d', { alpha: false })];
  let pvT = -1, pvVer = 0, pvLast = 0;
  function previewLoop(now) {
    requestAnimationFrame(previewLoop);
    // Con las ventanas abiertas, la vista previa se actualiza solo 4 veces por segundo: el trabajo pesado es de las salidas
    const outsOpen = outs.some(function (o) { return o && !o.win.closed; });
    if (outsOpen && pvVer === S.ver && now - pvLast < 250) return;
    const fk = frameKey();
    if (fk === pvT && pvVer === S.ver) return;
    pvLast = now;
    pvT = fk; pvVer = S.ver;
    [0, 1].forEach(function (i) {
      const o = outs[i], c = pv[i].canvas;
      const asp = o && !o.win.closed ? o.canvas.width / o.canvas.height : 16 / 9;
      const ph = Math.round(c.width / asp); if (c.height !== ph) c.height = ph;
      C.drawOutput(pv[i], video.readyState >= 2 ? video : null, i, S, c.width, c.height);
    });
  }
  requestAnimationFrame(previewLoop);

  function updateUI() {
    $('oV').textContent = Math.round(S.o * 100) + ' %'; $('o').value = S.o;
    $('gV').textContent = S.gamma.toFixed(2); $('gamma').value = S.gamma;
    $('blend').checked = S.blend > 0; $('grid').checked = S.grid; $('fit').value = S.fit;
    $('bAV').textContent = Math.round(S.bright[0] * 100) + ' %'; $('bA').value = S.bright[0];
    $('bBV').textContent = Math.round(S.bright[1] * 100) + ' %'; $('bB').value = S.bright[1];
    $('nA').textContent = S.nudge[0].x + ', ' + S.nudge[0].y + ' px'; $('nB').textContent = S.nudge[1].x + ', ' + S.nudge[1].y + ' px';
    document.querySelectorAll('[data-o]').forEach(function (b) { b.classList.toggle('on', Math.abs(+b.dataset.o - S.o) < 0.005); });
    updateOpenBoth();
    [0, 1].forEach(function (i) {
      const o = outs[i], el = $(i ? 'stB' : 'stA');
      el.textContent = o && !o.win.closed ? 'abierta · ' + o.canvas.width + '×' + o.canvas.height + ' · ' + o.fps.toFixed(0) + ' fps' + (o.frame != null ? ' · fotograma ' + o.frame : '') : 'cerrada';
    });
    const mw = video.videoWidth, mh = video.videoHeight;
    if (mw) {
      const r = C.movieRect(mw, mh, 1920, 1080, S.o, S.fit);
      $('geom').textContent = 'Con dos salidas 1920×1080: lienzo total ' + Math.round(r.V) + '×1080 · película ' + Math.round(r.w) + '×' + Math.round(r.h) +
        ' (' + (r.w / r.h).toFixed(2) + ':1' + (S.fit === 'stretch' ? ', deformada' : ', proporción original') + ')' + (S.fit === 'cover' ? ' · se recorta lo que sobresale' : '');
    }
  }
  setInterval(function () {
    updateUI();
    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB JS' : '';
    const sr = S.test ? syncReport() : null;
    $('stats').textContent = [outs[0] ? 'A ' + outs[0].fps.toFixed(0) + ' fps' : '', outs[1] ? 'B ' + outs[1].fps.toFixed(0) + ' fps' : '', mem,
      sr ? 'sincronía: ' + Math.round(100 * sr.iguales / sr.pares) + ' % mismo fotograma (máx. ' + sr.maxDif + ')' : ''].filter(Boolean).join(' · ') || 'listo';
  }, 1000);

  // controles
  document.querySelectorAll('[data-o]').forEach(function (b) { b.addEventListener('click', function () { S.o = +b.dataset.o; bump(); }); });
  $('o').addEventListener('input', function () { S.o = +$('o').value; bump(); });
  $('gamma').addEventListener('input', function () { S.gamma = +$('gamma').value; bump(); });
  $('blend').addEventListener('change', function () { S.blend = $('blend').checked ? 1 : 0; bump(); });
  $('grid').addEventListener('change', function () { S.grid = $('grid').checked; bump(); });
  $('fit').addEventListener('change', function () { S.fit = $('fit').value; bump(); });
  $('bA').addEventListener('input', function () { S.bright[0] = +$('bA').value; bump(); });
  $('bB').addEventListener('input', function () { S.bright[1] = +$('bB').value; bump(); });
  document.querySelectorAll('[data-n]').forEach(function (b) {
    b.addEventListener('click', function () { const v = b.dataset.n.split(',').map(Number); S.nudge[v[0]].x += v[1] * 2; S.nudge[v[0]].y += v[2] * 2; bump(); });
  });
  $('resetAlign').addEventListener('click', function () { S.nudge = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; S.bright = [1, 1]; bump(); });
  updateUI();

  // API para pruebas automáticas
  window.DPP = { S: S, outs: outs, video: video, openOutput: openOutput, syncReport: syncReport, bump: bump, togglePlay: togglePlay };
})();
