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
    { name: 'Baja', dpr: 1, aa: false, terrainSeg: 110, treeCount: 1500, nearR: 24, farR: 58, fog: 0.04, ferns: 1800, grass: 1500, bushes: 300, rocks: 250, logs: 35, mist: 5, rain: 3000, splash: 200, shadows: 0, leaves: 40, shrooms: 30, webs: 10, beam: 6 },
    { name: 'Media', dpr: 1.15, aa: false, terrainSeg: 150, treeCount: 1900, nearR: 32, farR: 74, fog: 0.033, ferns: 3200, grass: 2600, bushes: 550, rocks: 380, logs: 50, mist: 7, rain: 5500, splash: 350, shadows: 0, leaves: 80, shrooms: 55, webs: 18, beam: 8 },
    { name: 'Alta', dpr: 1.75, aa: true, terrainSeg: 230, treeCount: 2500, nearR: 56, farR: 120, fog: 0.025, ferns: 7000, grass: 6000, bushes: 1100, rocks: 600, logs: 80, mist: 18, rain: 13000, splash: 700, shadows: 1024, leaves: 160, shrooms: 100, webs: 30, beam: 14 },
  ];
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  const settings = Object.assign({ q: mobile ? 1 : 2, master: 0.9, rain: 1, thunder: 1, sens: 1, fps: false, invert: false, mini: true }, store.get('settings', {}));
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

  let world, rain, splashes, lightning, storm, player, flashlight, input, map, fauna, camp;
  const audio = new T.StormAudio();
  const state = { fastT: 0, mode: 'menu', time: 0, objective: '', msgT: 0, saveT: 0, creakT: 8, flags: {} };
  window.__ts = { state, get world() { return world; }, get player() { return player; }, get storm() { return storm; }, audio, get flashlight() { return flashlight; }, get lightning() { return lightning; }, renderer, camera };

  function build() {
    world = new T.World(renderer, Q);
    world.scene.add(camera);
    rain = new T.Rain(world.scene, Q.rain);
    splashes = new T.Splashes(world.scene, Q.splash);
    lightning = new T.Lightning(world.scene); lightning.light.visible = false; // el relámpago usa la luz de la luna (una luz menos por píxel)
    storm = new T.Storm();
    flashlight = new T.Flashlight(world.scene, camera, Q);
    player = new T.Player(world, camera, audio, splashes);
    input = new T.Input(canvas, { stick: $('stick'), knob: $('knob'), lookZone: $('look'), runBtn: $('bRun'), useBtn: $('bUse'), lightBtn: $('bLight'), pauseBtn: $('bPause') });
    input.onAction = onAction;
    camp = new T.Camp(world, Q); window.__ts.camp = camp;
    fauna = new T.Fauna(world, audio, splashes, Q); window.__ts.fauna = fauna;
    map = new T.ParkMap(world, 1024);
    map.addPlace({ x: 0, z: 178, label: 'Tu auto', icon: 'car' });
    map.addPlace({ x: world.signPos.x, z: world.signPos.z, label: 'Cartel', icon: 'sign' });
    state.campPlace = { x: T.CAMP.x, z: T.CAMP.z, label: 'Camping Los Alerces', icon: 'tent', known: false };
    map.addPlace(state.campPlace);
    window.__ts.map = map;
    world.wetMats.forEach(m => { m.userData.env = m.envMapIntensity; });
    world.updateLOD(new V3(0, 0, 172), true);
    resize();
    precompile();
  }
  // compila todos los shaders durante la carga (evita tirones al ver un animal o llegar al camping)
  function precompile() {
    const hidden = [];
    world.scene.traverse(o => { if (!o.visible && o !== lightning.light) { hidden.push(o); o.visible = true; } });
    for (const L of camp.lights) L.visible = true;
    renderer.compile(world.scene, camera);
    for (const L of camp.lights) L.visible = false;
    renderer.compile(world.scene, camera);
    hidden.forEach(o => { o.visible = false; });
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
    for (const it of camp.items) {
      if (state.flags.taken && state.flags.taken[it.id]) { camp.take(it); continue; }
      interactables.push({ item: it, pos: it.pos, r: it.r || 2.6, get label() { return labelFor(it); }, use() { useItem(it); } });
    }
  }

  /* ---------- historia: pistas, objetos y objetivos ---------- */
  const NOTES = {
    diario: { title: 'Diario — Día 2', html: '<p>Llegamos con la lluvia. Lucía dice que anoche escuchó pasos alrededor de la carpa, lentos, dando vueltas. Salí con la linterna y no había nadie.</p><p>Esta mañana encontramos huellas en el barro. Terminan en la mitad del claro, como si quien las hizo se hubiera ido volando.</p><p>Si la tormenta sigue, mañana bajamos al auto.</p><p class="hand">— M.</p>' },
    registro: { title: 'Libro de registro — Camping Los Alerces', html: '<p>14/11 · Familia Ortiz, 3 personas, carpa roja.<br>14/11 · Grupo Castro, 2 personas, carpa naranja.<br>15/11 · CAMPING CERRADO POR ALERTA DE TORMENTA. Todos deben retirarse antes del anochecer.</p><p class="hand">— R. Godoy, guardaparques</p><p>Abajo, con otra letra, casi borrado por el agua:</p><p class="hand">«¿Por qué siguen las carpas armadas?»</p>' },
    guantera: { title: 'La guantera', html: '<p>Entre papeles húmedos hay una llave con un llavero de madera tallado: «CABAÑA — GUARDAPARQUES».</p><p>Una nota doblada en cuatro:</p><p class="hand">«Repuesto. No la dejen en el auto. Y no abran la carpa naranja. R.G.»</p>' },
  };
  function labelFor(it) {
    if (it.kind === 'door') return state.flags.key ? 'Abrir la cabaña con la llave' : 'Probar la puerta';
    return it.label;
  }
  function takeFlag(it) { state.flags.taken = state.flags.taken || {}; state.flags.taken[it.id] = 1; }
  function useItem(it) {
    if (it.taken) return;
    if (it.kind === 'note') {
      camp.take(it); takeFlag(it); audio.pickup('paper');
      state.flags.notes = state.flags.notes || []; if (!state.flags.notes.includes(it.id)) state.flags.notes.push(it.id);
      openNote(it.id); refreshStory(); save();
    } else if (it.kind === 'battery') {
      camp.take(it); takeFlag(it); audio.pickup('battery');
      flashlight.battery = Math.min(1, flashlight.battery + 0.5); toast('Pilas nuevas: la linterna recupera carga');
      save();
    } else if (it.kind === 'key') {
      it.taken = true; takeFlag(it); audio.pickup('glovebox');
      state.flags.key = 1; state.flags.notes = state.flags.notes || []; state.flags.notes.push('guantera');
      openNote('guantera'); refreshStory(); save();
    } else if (it.kind === 'door') {
      if (!state.flags.key) { audio.pickup('locked'); showMessage('Está cerrada con llave. Por la rendija no se ve nada.', 4); return; }
      it.taken = true; takeFlag(it); camp.openDoor(); audio.pickup('door'); state.flags.cabin = 1;
      showMessage('La llave gira con esfuerzo. La puerta se abre hacia la oscuridad.', 5); refreshStory(); save();
    }
    interactables.splice(interactables.findIndex(x => x.item === it), 1);
  }
  function refreshStory() {
    const f = state.flags, clues = ['diario', 'registro', 'guantera'].filter(k => (f.notes || []).includes(k)).length;
    if (f.cabinIn) setObjective('Pasá la noche en la cabaña. Afuera, algo sigue caminando.');
    else if (f.cabin) setObjective('Entrá a la cabaña del guardaparques y refugiate.');
    else if (f.key) setObjective('Usá la llave en la cabaña del guardaparques, al fondo del claro.');
    else if (f.camp) setObjective(`Revisá el camping: buscá a los acampantes o algo que explique qué pasó (pistas ${clues}/3).`);
    const inv = []; if (f.key) inv.push('Llave de la cabaña'); if (f.notes && f.notes.length) inv.push(`Notas: ${f.notes.length}`);
    $('inv').innerHTML = inv.map(t => `<span>${t}</span>`).join('');
  }
  function openNote(id) {
    const n = NOTES[id]; if (!n) return;
    $('noteBody').innerHTML = `<h3>${n.title}</h3>${n.html}`;
    $('pNote').hidden = false; state.prevMode = state.mode; state.mode = 'note'; input.enabled = false;
  }
  $('noteClose').addEventListener('click', () => { $('pNote').hidden = true; state.mode = state.prevMode === 'pause' ? 'pause' : 'play'; input.enabled = state.mode === 'play'; });
  $('pNotes').addEventListener('click', () => {
    const list = (state.flags.notes || []);
    $('noteBody').innerHTML = '<h3>Notas encontradas</h3>' + (list.length ? '<div class="note-list">' + list.map(k => `<button data-n="${k}">${NOTES[k].title}</button>`).join('') + '</div>' : '<p>Todavía no encontraste ninguna nota.</p>');
    $('noteBody').querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { $('noteBody').innerHTML = `<h3>${NOTES[b.dataset.n].title}</h3>${NOTES[b.dataset.n].html}`; }));
    $('pNote').hidden = false; state.prevMode = 'pause'; state.mode = 'note';
  });
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, 2600); }

  // lugares que se descubren al acercarse (se agregan al mapa)
  const DISCOVER = () => [
    { id: 'refugio', pos: camp.leanTo.pos, r: 16, label: 'Refugio', icon: 'dot' },
    { id: 'pabellon', pos: camp.pav.g.position, r: 22, label: 'Pabellón', icon: 'dot' },
    { id: 'auto2', pos: camp.car.g.position, r: 20, label: 'Auto abandonado', icon: 'car' },
    { id: 'cabana', pos: camp.cabin.g.position, r: 22, label: 'Cabaña', icon: 'dot' },
  ];
  function discover(force) {
    state.flags.seen = state.flags.seen || {};
    for (const d of DISCOVER()) {
      if (state.flags.seen[d.id] && !force) continue;
      if (force ? state.flags.seen[d.id] : Math.hypot(player.pos.x - d.pos.x, player.pos.z - d.pos.z) < d.r) {
        state.flags.seen[d.id] = 1; if (!map.places.find(p => p.id === d.id)) map.addPlace({ id: d.id, x: d.pos.x, z: d.pos.z, label: d.label, icon: d.icon });
        if (!force) toast('Anotado en el mapa: ' + d.label);
      }
    }
    if (state.flags.camp) state.campPlace.known = true;
  }
  function storyTick(dt) {
    const f = state.flags, dCamp = T.campDist(player.pos.x, player.pos.z);
    if (!f.camp && dCamp < 27) {
      f.camp = 1; state.campPlace.known = true;
      showMessage('El camping está vacío. Las carpas siguen armadas, y en una de ellas hay una luz encendida.', 7);
      refreshStory(); save();
    }
    discover(false);
    // refugios: acústica, lluvia, descanso y guardado
    const sh = camp.shelterAt(player.pos.x, player.pos.z);
    state.shelter = sh; player.crouch = !!(sh && sh.name === 'carpa');
    if (sh) {
      player.stamina = Math.min(1, player.stamina + dt / 4);
      f.sheltered = f.sheltered || {};
      if (!f.sheltered[sh.name]) {
        f.sheltered[sh.name] = 1;
        const msg = { refugio: 'Un refugio de troncos. Al menos acá no llueve. (Partida guardada)', carpa: 'La carpa todavía está tibia. El farol sigue encendido, como si alguien hubiera salido un momento.', 'pabellón': 'Bajo el techo la lluvia suena como piedras sobre la madera.', 'cabaña': 'Cerrás la puerta a tus espaldas. Por primera vez en horas, el viento queda afuera.' }[sh.name];
        if (msg) showMessage(msg, 6);
        if (sh.name === 'cabaña') { f.cabinIn = 1; refreshStory(); chapterEnd(); }
        save();
      }
    }
  }
  function chapterEnd() {
    setTimeout(() => toast('Fin del capítulo 1 · Los eventos de la noche y el final llegan en la próxima versión'), 6500);
  }
  function nearestInteractable() {
    if (!player) return null;
    const f = new V3(); camera.getWorldDirection(f);
    let best = null, bd = 1e9;
    if (state.mode !== 'play') return null;
    for (const it of interactables) {
      const d = it.pos.distanceTo(camera.position); if (d > it.r) continue;
      const to = it.pos.clone().sub(camera.position).normalize();
      if (to.dot(f) < 0.55) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function onAction(a) {
    if (a === 'map') { if (state.mode === 'play') openMap(); else if (state.mode === 'map') closeMap(); return; }
    if (a === 'pause') { if (state.mode === 'map') { closeMap(); return; } if (state.mode === 'play') pause(); else if (state.mode === 'pause') resume(); return; }
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
    store.set('save', { x: player.pos.x, z: player.pos.z, yaw: player.yaw, battery: flashlight.battery, flags: state.flags, objective: state.objective, trail: map.trail.slice(-1500), t: Date.now() });
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
      player.pos.set(s.x, world.groundHeight(s.x, s.z), s.z); player.yaw = s.yaw; flashlight.battery = s.battery == null ? 1 : s.battery; state.flags = s.flags || {}; map.trail = s.trail || [];
      setObjective(s.objective || 'Encontrá el camping.');
    } else {
      player.pos.set(0, T.height(0, 172), 172); player.yaw = 0; player.pitch = -0.05; flashlight.battery = 1; map.trail = [];
      setObjective('Estás perdido. Encontrá el camping Los Alerces antes de que la tormenta empeore. Seguí el sendero.');
      showMessage('El auto quedó atascado en la ruta. Dijeron que el camping estaba cerca…', 6);
    }
    world.updateLOD(player.pos, true);
    setupInteractables();
    if (state.flags.cabin && !camp.cabin.open) camp.openDoor();
    if (state.flags.camp) state.campPlace.known = true;
    discover(true); refreshStory();
    if (state.flags.cabinIn) chapterEnd();
    $('title').hidden = true; $('loading').hidden = true; $('hud').hidden = false;
    $('touch').hidden = !input.touch;
    document.body.classList.add('playing');
    state.mode = 'play'; input.enabled = true;
    if (input.touch && document.documentElement.requestFullscreen) { try { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    // primer trueno para "presentar" la tormenta
    storm.nextStrike = 2.5;
  }
  /* ---------- mapa ---------- */
  const mapCanvas = $('mapCanvas');
  function drawMap() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    mapCanvas.width = Math.round(innerWidth * dpr); mapCanvas.height = Math.round(innerHeight * dpr);
    map.draw(mapCanvas, player, state.mapZoom || 1);
  }
  function openMap() {
    state.mode = 'map'; $('pMap').hidden = false; state.mapZoom = state.mapZoom || (innerHeight < 520 ? 1.8 : 1); drawMap(); state.mapT = 0;
    audio.paper && audio.paper();
    if (!state.flags.mapSeen) { state.flags.mapSeen = 1; }
  }
  function closeMap() { $('pMap').hidden = true; state.mode = 'play'; }
  $('bMap').addEventListener('click', () => onAction('map'));
  $('mapClose').addEventListener('click', closeMap);
  const zoomMap = (f) => { state.mapZoom = Math.max(1, Math.min(4, (state.mapZoom || 1) * f)); drawMap(); };
  $('mapIn').addEventListener('click', () => zoomMap(1.5));
  $('mapOut').addEventListener('click', () => zoomMap(1 / 1.5));
  mapCanvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomMap(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });

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
    $('sFps').checked = settings.fps; $('sMini').checked = settings.mini; $('sInvert').checked = settings.invert; syncOut();
  }
  function syncOut() {
    $('oMaster').textContent = Math.round(settings.master * 100); $('oRain').textContent = Math.round(settings.rain * 100);
    $('oThunder').textContent = Math.round(settings.thunder * 100); $('oSens').textContent = settings.sens.toFixed(2);
  }
  function applySettings() {
    audio.setVolumes({ master: settings.master, rain: settings.rain, thunder: settings.thunder });
    if (input) input.sens = settings.sens;
    $('fps').hidden = !settings.fps; $('mini').hidden = !settings.mini;
    store.set('settings', settings);
  }
  [['sMaster', 'master'], ['sRain', 'rain'], ['sThunder', 'thunder'], ['sSens', 'sens']].forEach(([id, k]) => $(id).addEventListener('input', e => { settings[k] = +e.target.value; syncOut(); applySettings(); }));
  $('sFps').addEventListener('change', e => { settings.fps = e.target.checked; applySettings(); });
  $('sMini').addEventListener('change', e => { settings.mini = e.target.checked; applySettings(); });
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
    if (now - last < 1000 / 62) return;   // tope de 60 FPS: en pantallas de 120 Hz no se dibuja el doble
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    if (state.mode === 'pause' || state.mode === 'note') { renderer.render(world.scene, camera); return; }
    const playing = state.mode === 'play' || state.mode === 'map';
    updateStorm(dt);
    if (state.mode === 'map') { player.update(dt, input, true); state.mapT += dt; if (state.mapT > 0.5) { state.mapT = 0; drawMap(); } }
    if (state.mode === 'play') {
      player.update(dt, input, false);
      map.track(player.pos.x, player.pos.z);
      if (settings.invert) {} // aplicado en la entrada
    } else menuCamera(dt);
    const I = flashlight.update(dt, state.time, camera, playing ? player.moving : 0.3, playing ? player.running : 0);
    const fl = { pos: flashlight.pos, dir: flashlight.dir, cos: flashlight.cos, on: I };
    fauna.update(dt, { player, camera, fl, storm, playing: state.mode === 'play' });
    rain.update(state.time, camera, storm, fl);
    splashes.update(dt, camera, storm, fl, (x, z) => {
      return world.groundHeight(x, z) + 0.02;
    });
    world.update(dt, state.time, camera.position, storm);
    camp.update(dt, state.time);
    // relámpago: la misma luz direccional de la luna se dispara hacia la descarga
    if (lightning.level > 0.03 && lightning.flashDir) {
      world.moon.intensity += Math.min(1.2, lightning.level) * 0.95;
      world.moon.color.setRGB(0.72, 0.78, 1.0);
      world.moon.position.copy(camera.position).addScaledVector(lightning.flashDir, 200);
    } else world.moon.color.setRGB(0.56, 0.65, 0.85);
    // los faroles del camping solo cuentan como luz cuando estás cerca
    const nearCamp = T.campDist(camera.position.x, camera.position.z) < 85;
    for (const L of camp.lights) L.visible = nearCamp;

    if (playing) {
      // audio ambiente según el entorno inmediato
      let near = 0; for (const c of world.collidersNear(camera.position.x, camera.position.z)) if ((c.x - camera.position.x) ** 2 + (c.z - camera.position.z) ** 2 < 100) near++;
      let pd = 1e9; for (const p of world.puddles) pd = Math.min(pd, Math.hypot(p.x - player.pos.x, p.z - player.pos.z) - p.r);
      audio.setListener(camera);
      storyTick(dt);
      const sh = state.shelter, surf = camp.layersAt(player.pos.x, player.pos.z);
      if (sh) surf[sh.layer] = 1;
      if (Math.hypot(player.pos.x - camp.car.g.position.x, player.pos.z - camp.car.g.position.z) < 3.5) surf.metal = Math.max(surf.metal, 0.5);
      rain.u.uHide.value += ((sh ? sh.rain : 0) - rain.u.uHide.value) * (1 - Math.exp(-dt * 4));
      if ((state.audT = (state.audT || 0) + 1) % 2 === 0) audio.update({ rain: storm.rain, wind: storm.wind, gust: storm.gust, leafCover: Math.min(1, near / 8) * (sh ? 0.3 : 1), puddleNear: Math.max(0, 1 - Math.max(0, pd) / 7) * (sh ? 0.2 : 1), exertion: player.exertion, shelter: sh ? sh.level : 0, surf, dt });
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
      if (settings.mini && state.mode === 'play' && (state.miniT = (state.miniT || 0) + dt) > 0.12) { state.miniT = 0; map.drawMini($('mini'), player); }
      const it = nearestInteractable();
      const ptxt = it ? `<kbd>${input.touch ? '✋' : 'E'}</kbd>${it.label}` : '';
      if (ptxt !== state.ptxt) { state.ptxt = ptxt; $('prompt').hidden = !it; if (it) $('prompt').innerHTML = ptxt; }
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
      if (fps < 45 && dprScale > 0.5) { slowT++; if (slowT >= 2) { dprScale = Math.max(0.5, dprScale - 0.1); renderer.setPixelRatio(baseDpr * dprScale); resize(); slowT = 0; } }
      else if (fps >= 58 && dprScale < 1) { if (++state.fastT >= 4) { state.fastT = 0; dprScale = Math.min(1, dprScale + 0.05); renderer.setPixelRatio(baseDpr * dprScale); resize(); } }
      else { slowT = 0; state.fastT = 0; }
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
