/* TORMENTA SALVAJE — arranque, menús, configuración, guardado y bucle principal */
(function () {
  'use strict';
  const T = window.TS, V3 = THREE.Vector3, rnd = T.rnd;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ts-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ts-' + k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---------- calidad ---------- */
  const QUALITY = [
    { name: 'Baja', dpr: 1, aa: false, terrainSeg: 120, treeCount: 1500, nearR: 32, farR: 78, fog: 0.034, ferns: 2600, grass: 2400, bushes: 450, rocks: 300, logs: 40, mist: 10, rain: 3800, splash: 260, shadows: 0 },
    { name: 'Media', dpr: 1.35, aa: false, terrainSeg: 170, treeCount: 2000, nearR: 42, farR: 96, fog: 0.029, ferns: 4500, grass: 4000, bushes: 750, rocks: 450, logs: 60, mist: 14, rain: 7500, splash: 450, shadows: 512 },
    { name: 'Alta', dpr: 1.75, aa: true, terrainSeg: 230, treeCount: 2500, nearR: 56, farR: 120, fog: 0.025, ferns: 7000, grass: 6000, bushes: 1100, rocks: 600, logs: 80, mist: 18, rain: 13000, splash: 700, shadows: 1024 },
  ];
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  const settings = Object.assign({ q: mobile ? 1 : 2, master: 0.9, rain: 1, thunder: 1, sens: 1, fps: false, invert: false }, store.get('settings', {}));
  const Q = QUALITY[settings.q];

  /* ---------- motor ---------- */
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  const baseDpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  let dprScale = 1;
  renderer.setPixelRatio(baseDpr);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !!Q.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);

  let world, rain, splashes, lightning, storm, player, flashlight, input;
  const audio = new T.StormAudio();
  const state = { mode: 'menu', time: 0, objective: '', msgT: 0, saveT: 0, creakT: 8, flags: {} };
  window.__ts = { state, get world() { return world; }, get player() { return player; }, get storm() { return storm; }, audio, get flashlight() { return flashlight; }, get lightning() { return lightning; }, renderer, camera };

  function build() {
    world = new T.World(renderer, Q);
    world.scene.add(camera);
    rain = new T.Rain(world.scene, Q.rain);
    splashes = new T.Splashes(world.scene, Q.splash);
    lightning = new T.Lightning(world.scene);
    storm = new T.Storm();
    flashlight = new T.Flashlight(world.scene, camera, Q);
    player = new T.Player(world, camera, audio, splashes);
    input = new T.Input(canvas, { stick: $('stick'), knob: $('knob'), lookZone: $('look'), runBtn: $('bRun'), useBtn: $('bUse'), lightBtn: $('bLight'), pauseBtn: $('bPause') });
    input.onAction = onAction;
    world.wetMats.forEach(m => { m.userData.env = m.envMapIntensity; });
    world.updateLOD(new V3(0, 0, 172), true);
    resize();
  }

  /* ---------- interacción ---------- */
  const interactables = [];
  function setupInteractables() {
    interactables.length = 0;
    interactables.push({
      pos: world.signPos, r: 3.2, label: 'Leer el cartel',
      use() {
        showMessage('«CAMPING ← 500 m». La flecha señala el sendero hacia el norte. La madera está rayada, como si alguien la hubiera arañado.', 6);
        if (!state.flags.sign) { state.flags.sign = 1; setObjective('Seguí el sendero hacia el camping.'); }
      },
    });
  }
  function nearestInteractable() {
    if (!player) return null;
    const f = new V3(); camera.getWorldDirection(f);
    let best = null, bd = 1e9;
    for (const it of interactables) {
      const d = it.pos.distanceTo(camera.position); if (d > it.r) continue;
      const to = it.pos.clone().sub(camera.position).normalize();
      if (to.dot(f) < 0.55) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function onAction(a) {
    if (a === 'pause') { if (state.mode === 'play') pause(); else if (state.mode === 'pause') resume(); return; }
    if (state.mode !== 'play') return;
    if (a === 'flashlight') { flashlight.toggle(); audio.click(); }
    if (a === 'interact') { const it = nearestInteractable(); if (it) it.use(); }
  }

  /* ---------- HUD ---------- */
  function setObjective(t) { state.objective = t; $('objText').textContent = t; $('objective').style.opacity = 1; state.objT = 8; }
  function showMessage(t, sec) { const m = $('message'); m.textContent = t; m.style.opacity = 1; state.msgT = sec || 4; }
  const tape = $('tape');
  (function buildTape() {
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    let html = '';
    for (let rep = -1; rep <= 1; rep++) for (let d = 0; d < 360; d += 15) {
      const x = (d + rep * 360) * 2.2, lab = labels[d];
      html += `<span style="left:${x}px" class="${d === 0 ? 'n' : ''}">${lab || '·'}</span>`;
    }
    tape.innerHTML = html;
  })();

  /* ---------- guardado ---------- */
  function save() {
    if (!player) return;
    store.set('save', { x: player.pos.x, z: player.pos.z, yaw: player.yaw, battery: flashlight.battery, flags: state.flags, objective: state.objective, t: Date.now() });
  }
  function refreshContinue() {
    const s = store.get('save', null);
    $('mCont').disabled = !s;
    $('contInfo').textContent = s ? 'Guardada ' + new Date(s.t).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No hay partida guardada';
  }

  /* ---------- flujo de juego ---------- */
  async function start(cont) {
    $('loading').hidden = false; $('loading').textContent = 'Preparando la tormenta…';
    await new Promise(r => setTimeout(r, 30));
    try { await audio.init(); } catch (e) { console.error(e); }
    applySettings();
    const s = cont ? store.get('save', null) : null;
    state.flags = {};
    if (s) {
      player.pos.set(s.x, world.groundHeight(s.x, s.z), s.z); player.yaw = s.yaw; flashlight.battery = s.battery || 1; state.flags = s.flags || {};
      setObjective(s.objective || 'Encontrá el camping.');
    } else {
      player.pos.set(0, T.height(0, 172), 172); player.yaw = 0; player.pitch = -0.05; flashlight.battery = 1;
      setObjective('Estás perdido. Encontrá el camping Los Alerces antes de que la tormenta empeore. Seguí el sendero.');
      showMessage('El auto quedó atascado en la ruta. Dijeron que el camping estaba cerca…', 6);
    }
    world.updateLOD(player.pos, true);
    setupInteractables();
    $('title').hidden = true; $('loading').hidden = true; $('hud').hidden = false;
    $('touch').hidden = !input.touch;
    document.body.classList.add('playing');
    state.mode = 'play'; input.enabled = true;
    if (input.touch && document.documentElement.requestFullscreen) { try { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    // primer trueno para "presentar" la tormenta
    storm.nextStrike = 2.5;
  }
  function pause() { state.mode = 'pause'; $('pPause').hidden = false; input.enabled = false; save(); if (document.exitPointerLock) document.exitPointerLock(); }
  function resume() { $('pPause').hidden = true; state.mode = 'play'; input.enabled = true; }
  function quitToMenu() { save(); $('pPause').hidden = true; $('hud').hidden = true; $('title').hidden = false; state.mode = 'menu'; input.enabled = false; document.body.classList.remove('playing'); refreshContinue(); }

  $('mNew').addEventListener('click', () => start(false));
  $('mCont').addEventListener('click', () => start(true));
  $('mSet').addEventListener('click', () => openSettings());
  $('mCred').addEventListener('click', () => { $('pCredits').hidden = false; });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { b.closest('.panel').hidden = true; }));
  $('pResume').addEventListener('click', resume);
  $('pSet').addEventListener('click', () => openSettings());
  $('pQuit').addEventListener('click', quitToMenu);
  $('rotOk').addEventListener('click', () => { document.body.classList.remove('playing'); document.body.classList.add('playing-portrait'); });

  /* ---------- configuración ---------- */
  function openSettings() {
    $('pSettings').hidden = false;
    document.querySelectorAll('#qSeg button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.q === settings.q ? 'true' : 'false'));
    $('sMaster').value = settings.master; $('sRain').value = settings.rain; $('sThunder').value = settings.thunder; $('sSens').value = settings.sens;
    $('sFps').checked = settings.fps; $('sInvert').checked = settings.invert; syncOut();
  }
  function syncOut() {
    $('oMaster').textContent = Math.round(settings.master * 100); $('oRain').textContent = Math.round(settings.rain * 100);
    $('oThunder').textContent = Math.round(settings.thunder * 100); $('oSens').textContent = settings.sens.toFixed(2);
  }
  function applySettings() {
    audio.setVolumes({ master: settings.master, rain: settings.rain, thunder: settings.thunder });
    if (input) input.sens = settings.sens;
    $('fps').hidden = !settings.fps;
    store.set('settings', settings);
  }
  [['sMaster', 'master'], ['sRain', 'rain'], ['sThunder', 'thunder'], ['sSens', 'sens']].forEach(([id, k]) => $(id).addEventListener('input', e => { settings[k] = +e.target.value; syncOut(); applySettings(); }));
  $('sFps').addEventListener('change', e => { settings.fps = e.target.checked; applySettings(); });
  $('sInvert').addEventListener('change', e => { settings.invert = e.target.checked; applySettings(); });
  $('qSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const q = +b.dataset.q; if (q === settings.q) return;
    settings.q = q; store.set('settings', settings); if (state.mode !== 'menu') save();
    store.set('resume', state.mode !== 'menu'); location.reload();
  });
  $('sClose').addEventListener('click', () => { $('pSettings').hidden = true; });

  /* ---------- tormenta: relámpagos y truenos ---------- */
  function updateStorm(dt) {
    storm.update(dt, state.time);
    storm.nextStrike -= dt;
    if (storm.nextStrike <= 0) {
      const near = Math.random() < 0.18 + storm.rain * 0.25;
      const dist = near ? rnd(250, 850) : rnd(1200, 4000);
      const f = new V3(); camera.getWorldDirection(f);
      const inView = Math.random() < 0.6 ? f : null;
      lightning.strike(near, camera.position, inView);
      const right = new V3().crossVectors(f, camera.up).normalize();
      const dirX = lightning.flashDir ? lightning.flashDir.dot(right) : 0;
      audio.thunder(dist, dirX);
      storm.nextStrike = rnd(7, 26) / (0.5 + storm.rain);
    }
    const lv = lightning.update();
    storm.flash = Math.min(1.5, lv);
    world.skyMat.uniforms.uFlash.value = lv;
    if (lightning.flashDir) world.skyMat.uniforms.uFlashDir.value.copy(lightning.flashDir);
    world.wetMats.forEach(m => { m.envMapIntensity = m.userData.env * (1 + Math.min(1, lv) * (m === world.puddleMat ? 1.0 : 1.6)); });
    world.hemi.intensity = 0.2 + Math.min(1, lv) * 0.3;
  }

  /* ---------- cámara de la portada ---------- */
  let menuT = 0.18;
  function menuCamera(dt) {
    menuT += dt * 0.004; if (menuT > 0.8) menuT = 0.18;
    const p = T.pathCurve.getPointAt(1 - menuT), q = T.pathCurve.getPointAt(Math.max(0, 1 - menuT - 0.02));
    camera.position.set(p.x + 0.6, world.groundHeight(p.x + 0.6, p.z) + 1.7, p.z);
    camera.lookAt(q.x, T.height(q.x, q.z) + 1.5 + Math.sin(state.time * 0.3) * 0.2, q.z);
    flashlight.on = true;
  }

  /* ---------- bucle ---------- */
  let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, slowT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    if (state.mode === 'pause') { renderer.render(world.scene, camera); return; }
    updateStorm(dt);
    if (state.mode === 'play') {
      player.update(dt, input, false);
      if (settings.invert) {} // aplicado en la entrada
    } else menuCamera(dt);
    const I = flashlight.update(dt, state.time, camera, state.mode === 'play' ? player.moving : 0.3, state.mode === 'play' ? player.running : 0);
    const fl = { pos: flashlight.pos, dir: flashlight.dir, cos: flashlight.cos, on: I };
    rain.update(state.time, camera, storm, fl);
    splashes.update(dt, camera, storm, fl, (x, z) => {
      return world.groundHeight(x, z) + 0.02;
    });
    world.update(dt, state.time, camera.position, storm);

    if (state.mode === 'play') {
      // audio ambiente según el entorno inmediato
      let near = 0; for (const c of world.collidersNear(camera.position.x, camera.position.z)) if ((c.x - camera.position.x) ** 2 + (c.z - camera.position.z) ** 2 < 100) near++;
      let pd = 1e9; for (const p of world.puddles) pd = Math.min(pd, Math.hypot(p.x - player.pos.x, p.z - player.pos.z) - p.r);
      audio.setListener(camera);
      audio.update({ rain: storm.rain, wind: storm.wind, gust: storm.gust, leafCover: Math.min(1, near / 8), puddleNear: Math.max(0, 1 - Math.max(0, pd) / 7), exertion: player.exertion, shelter: 0, dt });
      // crujidos de árboles con el viento
      state.creakT -= dt * (0.4 + storm.wind);
      if (state.creakT <= 0) {
        state.creakT = rnd(7, 18);
        const a = Math.random() * 6.283, d = rnd(10, 35);
        audio.creak(new V3(camera.position.x + Math.cos(a) * d, camera.position.y + rnd(4, 12), camera.position.z + Math.sin(a) * d), 0.35 + storm.gust * 0.5);
      }
      // HUD
      $('stam').firstElementChild.style.transform = `scaleX(${player.stamina})`;
      $('stam').classList.toggle('low', player.stamina < 0.25);
      $('batt').firstElementChild.style.transform = `scaleX(${flashlight.battery})`;
      $('batt').classList.toggle('low', flashlight.battery < 0.2);
      const deg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
      tape.style.transform = `translateX(${-deg * 2.2}px)`;
      const it = nearestInteractable();
      $('prompt').hidden = !it;
      if (it) $('prompt').innerHTML = `<kbd>${input.touch ? '✋' : 'E'}</kbd>${it.label}`;
      if (state.msgT > 0) { state.msgT -= dt; if (state.msgT <= 0) $('message').style.opacity = 0; }
      if (state.objT > 0) { state.objT -= dt; if (state.objT <= 0) $('objective').style.opacity = 0.45; }
      state.saveT += dt; if (state.saveT > 10) { state.saveT = 0; save(); }
    }
    renderer.render(world.scene, camera);

    // FPS y resolución dinámica (mantiene la fluidez en celulares)
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) {
      fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
      if (settings.fps) $('fps').textContent = fps + ' FPS · ' + Math.round(baseDpr * dprScale * 100) / 100 + 'x';
      if (fps < 26 && dprScale > 0.6) { slowT++; if (slowT >= 2) { dprScale = Math.max(0.6, dprScale - 0.1); renderer.setPixelRatio(baseDpr * dprScale); resize(); slowT = 0; } }
      else if (fps > 50 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.05); renderer.setPixelRatio(baseDpr * dprScale); resize(); }
      else slowT = 0;
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < h ? 80 : 70; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // invertir eje Y de la mirada
  const _take = T.Input.prototype.takeLook;
  T.Input.prototype.takeLook = function () { const l = _take.call(this); if (settings.invert) l.y = -l.y; return l; };

  setTimeout(() => {
    build();
    $('loading').hidden = true;
    refreshContinue();
    applySettings();
    requestAnimationFrame(frame);
    if (store.get('resume', false)) { store.set('resume', false); }
  }, 30);
})();
