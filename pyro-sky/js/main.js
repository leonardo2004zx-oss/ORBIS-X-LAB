/* PYRO SKY SIMULATOR — bucle principal, interfaz, espectáculos y gran final */
(function () {
  'use strict';
  const { World } = window.PyroWorld;
  const { Sparks, Smoke, rnd } = window.PyroFX;
  const { CATALOG, Rocket } = window.PyroRockets;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---------- calidad según dispositivo ---------- */
  const QUALITY = [
    { name: 'Baja', dpr: 1, aa: false, sparks: 5000, smokeMax: 260, lights: 2, density: 0.55, trail: 0.5, smoke: 0.5, stars: 900, terrainSeg: 70, trees: 140 },
    { name: 'Media', dpr: 1.5, aa: false, sparks: 10000, smokeMax: 480, lights: 3, density: 0.8, trail: 0.75, smoke: 0.8, stars: 1400, terrainSeg: 100, trees: 260 },
    { name: 'Alta', dpr: 2, aa: true, sparks: 20000, smokeMax: 900, lights: 4, density: 1, trail: 1, smoke: 1, stars: 2200, terrainSeg: 150, trees: 420 },
  ];
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  let qLevel = store.get('pyro-quality', mobile ? 1 : 2);
  const quality = QUALITY[qLevel];

  /* ---------- núcleo ---------- */
  const world = new World($('sky'), quality);
  const fx = new Sparks(world.scene, quality.sparks, store.get('pyro-reflect', true));
  const smoke = new Smoke(world.scene, quality.smokeMax);
  const audio = new window.PyroAudio();
  const listeners = {};
  const g = {
    world, fx, smoke, audio, quality, rockets: [], timeScale: 1, timeTarget: 1, simTime: 0, queue: [],
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, a) { (listeners[ev] || []).forEach(f => f(a)); },
    timeScaleNow() { return this.timeScale; },
    after(sec, fn) { this.queue.push({ at: this.simTime + sec, fn }); },
    smokeCloud(pos, radius, n) {
      n = Math.round(n * quality.smoke);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = radius * Math.sqrt(Math.random()) * 0.5;
        smoke.spawn(pos.x + Math.cos(a) * r, pos.y + rnd(-radius, radius) * 0.25, pos.z + Math.sin(a) * r, rnd(-1, 1), rnd(-1, 0.5), rnd(-1, 1), rnd(6, 11), radius * 0.25, radius * 0.6, 0.12);
      }
    },
  };
  window.__pyro = g; // gancho para pruebas automáticas

  // crepitado visual ↔ micro-estallidos sonoros sincronizados (con tope por segundo)
  let popBudget = 0;
  fx.onCrackle = (x, y, z) => { if (popBudget >= 1) { popBudget -= 1; audio.pop({ x, y, z }, rnd(0.25, 0.6), 2600); } };
  fx.onSplit = (x, y, z) => { if (popBudget >= 1) { popBudget -= 1; audio.pop({ x, y, z }, 0.9, 1500); } };

  /* ---------- lanzamientos ---------- */
  let padIdx = 0;
  function nextPad() {
    const order = [2, 1, 3, 0, 4];
    return world.pads[order[(padIdx++) % order.length]];
  }
  function launch(id, pad, scale) {
    const type = CATALOG.find(c => c.id === id) || CATALOG[0];
    if (g.rockets.length > 40) return null;
    // las figuras y la carcasa de tres etapas se lanzan desde el centro para que entren en pantalla vertical
    if (!pad && type.centered) pad = world.pads[1 + ((padIdx++) % 3)];
    const r = new Rocket(g, type, pad || nextPad(), scale);
    g.rockets.push(r);
    return r;
  }
  g.launch = launch;

  /* ---------- cámara ---------- */
  const CAMS = [['publico', 'Público'], ['orilla', 'Orilla'], ['lateral', 'Lateral'], ['aerea', 'Aérea'], ['seguir', 'Seguir cohete']];
  let camIdx = 0;
  world.cam.preset('publico');
  g.on('liftoff', r => { if (world.cam.mode === 'seguir') world.cam.follow = r; });

  /* ---------- interfaz ---------- */
  let selected = store.get('pyro-selected', CATALOG[0].id);
  if (!CATALOG.find(c => c.id === selected)) selected = CATALOG[0].id;

  function drawIcon(cv, t) {
    const dpr = 2; cv.width = 26 * dpr; cv.height = 64 * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const L = t.look, w = 6 + L.r * 22, h = 18 + L.len * 9, x = 13 - w / 2, y = 62 - h;
    // destellos del estallido arriba
    t.swatch.forEach((s, k) => { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + k; c.fillStyle = s; c.beginPath(); c.arc(13 + Math.cos(a) * (5 + k * 3), 9 + Math.sin(a) * (4 + k * 2.5), 1.2, 0, 7); c.fill(); } });
    if (L.stick) { c.fillStyle = '#6b5233'; c.fillRect(x + w + 0.5, y + h * 0.5, 1.4, h * 0.5); }
    c.fillStyle = hex(L.body); c.fillRect(x, y, w, h);
    c.fillStyle = hex(L.stripe); c.fillRect(x, y + h * 0.25, w, 3); c.fillRect(x, y + h * 0.5, w, 3);
    c.fillStyle = hex(L.nose); c.beginPath(); c.moveTo(x - 1, y); c.lineTo(13, y - 9); c.lineTo(x + w + 1, y); c.fill();
    c.fillStyle = hex(L.stripe); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x - 4, y + h); c.lineTo(x, y + h - 8); c.fill();
    c.beginPath(); c.moveTo(x + w, y + h); c.lineTo(x + w + 4, y + h); c.lineTo(x + w, y + h - 8); c.fill();
  }

  function buildRack() {
    const rack = $('rack'); rack.innerHTML = '';
    CATALOG.forEach(t => {
      const b = document.createElement('button');
      b.className = 'card'; b.setAttribute('role', 'radio'); b.dataset.id = t.id;
      b.setAttribute('aria-checked', t.id === selected ? 'true' : 'false');
      b.title = t.desc;
      const cv = document.createElement('canvas'); drawIcon(cv, t);
      b.appendChild(cv);
      if (t.tag) b.insertAdjacentHTML('beforeend', `<em class="badge">${t.tag}</em>`);
      b.insertAdjacentHTML('beforeend', `<b>${t.short}</b><span class="spec">${t.caliber} mm · ${t.height} m</span><span class="snd">${t.sound}</span>`);
      b.addEventListener('click', () => select(t.id, true));
      rack.appendChild(b);
    });
    const pal = $('showPalette'); pal.innerHTML = '';
    CATALOG.forEach(t => {
      const c = document.createElement('button'); c.className = 'chip';
      c.innerHTML = `<i style="background:${t.swatch[0]}"></i>${t.short}`;
      c.addEventListener('click', () => { show.seq.push(t.id); saveShow(); renderSeq(); });
      pal.appendChild(c);
    });
  }
  function select(id, scroll) {
    selected = id; store.set('pyro-selected', id);
    const t = CATALOG.find(c => c.id === id);
    document.querySelectorAll('.card').forEach(c => c.setAttribute('aria-checked', c.dataset.id === id ? 'true' : 'false'));
    $('fireSub').textContent = t.name.toUpperCase();
    if (scroll) toast(`${t.name} · ${t.desc}`);
  }

  let toastT = 0;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }

  $('btnFire').addEventListener('click', () => { launch(selected); });
  $('btnSalvo').addEventListener('click', () => {
    for (let i = 0; i < 5; i++) g.after(i * 0.28, () => launch(selected, world.pads[i], rnd(0.9, 1.1)));
    toast('Ráfaga ×5');
  });
  $('btnZoomIn').addEventListener('click', () => world.cam.zoom(0.75));
  $('btnZoomOut').addEventListener('click', () => world.cam.zoom(1.33));
  $('btnCam').addEventListener('click', () => {
    camIdx = (camIdx + 1) % CAMS.length;
    world.cam.preset(CAMS[camIdx][0]);
    if (CAMS[camIdx][0] === 'seguir') { const live = g.rockets[g.rockets.length - 1]; if (live) world.cam.follow = live; }
    $('camName').textContent = CAMS[camIdx][1];
    toast('Cámara: ' + CAMS[camIdx][1]);
  });
  $('btnSlow').addEventListener('click', (e) => {
    const on = g.timeTarget === 1;
    g.timeTarget = on ? 0.25 : 1;
    e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
    toast(on ? 'Cámara lenta ×0,25 (el sonido también se estira)' : 'Velocidad normal');
  });

  /* ---------- paneles ---------- */
  function openSheet(id) { ['sheetShow', 'sheetSet'].forEach(s => $(s).hidden = s !== id ? true : !$(s).hidden); }
  $('btnShow').addEventListener('click', () => openSheet('sheetShow'));
  $('btnSet').addEventListener('click', () => openSheet('sheetSet'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { b.closest('.sheet').hidden = true; }));

  const vol = $('vol'), rev = $('rev');
  vol.value = store.get('pyro-vol', 0.85); rev.value = store.get('pyro-rev', 0.65);
  const syncAudio = () => {
    $('volOut').textContent = Math.round(vol.value * 100); $('revOut').textContent = Math.round(rev.value * 100);
    audio.setVolume(+vol.value); audio.setReverb(+rev.value);
    store.set('pyro-vol', +vol.value); store.set('pyro-rev', +rev.value);
  };
  vol.addEventListener('input', syncAudio); rev.addEventListener('input', syncAudio);
  $('delay').checked = store.get('pyro-delay', false);
  $('delay').addEventListener('change', e => { audio.realisticDelay = e.target.checked; store.set('pyro-delay', e.target.checked); });
  audio.realisticDelay = $('delay').checked;
  $('reflect').checked = store.get('pyro-reflect', true);
  $('reflect').addEventListener('change', e => { store.set('pyro-reflect', e.target.checked); if (fx.reflection) fx.reflection.visible = e.target.checked; else if (e.target.checked) location.reload(); });
  $('qual').value = qLevel; $('qualOut').textContent = quality.name;
  $('qual').addEventListener('change', e => { store.set('pyro-quality', +e.target.value); location.reload(); });

  /* ---------- espectáculo personalizado ---------- */
  const show = { seq: store.get('pyro-show', []).filter(id => CATALOG.find(c => c.id === id)), gap: store.get('pyro-gap', 0.9), playing: false, token: 0 };
  const saveShow = () => { store.set('pyro-show', show.seq); store.set('pyro-gap', show.gap); };
  function renderSeq(now) {
    const el = $('seq'); el.innerHTML = '';
    show.seq.forEach((id, i) => {
      const t = CATALOG.find(c => c.id === id);
      const c = document.createElement('button'); c.className = 'chip' + (i === now ? ' now' : '');
      c.innerHTML = `<i style="background:${t.swatch[0]}"></i>${i + 1}. ${t.short}`;
      c.title = 'Quitar'; c.addEventListener('click', () => { show.seq.splice(i, 1); saveShow(); renderSeq(); });
      el.appendChild(c);
    });
  }
  $('gap').value = show.gap; $('gapOut').textContent = show.gap.toFixed(1) + ' s';
  $('gap').addEventListener('input', e => { show.gap = +e.target.value; $('gapOut').textContent = show.gap.toFixed(1) + ' s'; saveShow(); });
  $('showUndo').addEventListener('click', () => { show.seq.pop(); saveShow(); renderSeq(); });
  $('showClear').addEventListener('click', () => { show.seq = []; saveShow(); renderSeq(); });
  $('showDemo').addEventListener('click', () => {
    const ids = CATALOG.map(c => c.id);
    show.seq = [0, 2, 1, 3, 5, 0, 0, 2, 4, 1, 3, 5, 2, 2, 4].map(i => ids[i % ids.length]).concat(ids);
    saveShow(); renderSeq(); toast('Ejemplo cargado');
  });
  $('showStop').addEventListener('click', stopShow);
  $('showPlay').addEventListener('click', () => {
    if (!show.seq.length) { toast('La secuencia está vacía'); return; }
    stopShow(); show.playing = true; const tok = ++show.token;
    show.seq.forEach((id, i) => g.after(i * show.gap, () => { if (tok !== show.token) return; launch(id); renderSeq(i); if (i === show.seq.length - 1) show.playing = false; }));
    $('sheetShow').hidden = true;
    toast(`Espectáculo: ${show.seq.length} cohetes`);
  });
  function stopShow() { show.token++; show.playing = false; g.queue = g.queue.filter(q => !q.show); renderSeq(); }

  /* ---------- gran final automático ---------- */
  $('btnFinale').addEventListener('click', () => {
    stopShow(); const tok = ++show.token;
    const ids = CATALOG.map(c => c.id);
    const pick = () => ids[(Math.random() * ids.length) | 0];
    let t = 0;
    const at = (dt, fn) => { t += dt; const tt = t; g.after(tt, () => { if (tok === show.token) fn(); }); };
    // 1) apertura: solos alternados
    for (let i = 0; i < 8; i++) at(0.95, () => launch(ids[i % ids.length]));
    // 2) pares espejados
    for (let i = 0; i < 7; i++) at(0.75, () => { const id = pick(); launch(id, world.pads[0]); launch(id, world.pads[4]); });
    // 3) abanicos de tres
    for (let i = 0; i < 6; i++) at(0.55, () => { const id = pick(); [1, 2, 3].forEach(p => launch(id, world.pads[p], rnd(0.85, 1))); });
    // 4) remate: cortina continua y gran estallido final
    for (let i = 0; i < 16; i++) at(0.14, () => launch(pick(), world.pads[i % 5], rnd(0.8, 1)));
    at(0.6, () => world.pads.forEach((p, k) => launch(ids[k % ids.length], p, 1.2)));
    if (world.cam.mode !== 'publico') { camIdx = 0; world.cam.preset('publico'); $('camName').textContent = 'Público'; }
    toast('GRAN FINAL');
  });

  /* ---------- activar audio ---------- */
  $('btnGo').addEventListener('click', async () => {
    try { await audio.init(); } catch (e) { console.error(e); }
    syncAudio();
    $('gate').hidden = true;
    // primer cohete de bienvenida
    setTimeout(() => launch(selected), 400);
  });

  /* ---------- vúmetro / hud ---------- */
  const meter = $('meter');
  for (let i = 0; i < 14; i++) { const b = document.createElement('i'); b.style.height = (6 + i * 1.1) + 'px'; meter.appendChild(b); }
  const bars = [...meter.children];
  let fpsAcc = 0, fpsN = 0, fps = 60;

  /* ---------- bucle ---------- */
  let last = performance.now(), time = 0;
  const right = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    time += rdt;
    g.timeScale += (g.timeTarget - g.timeScale) * (1 - Math.exp(-5 * rdt));
    if (Math.abs(g.timeScale - g.timeTarget) < 0.01) g.timeScale = g.timeTarget;
    audio.timeScale = g.timeScale;
    const dt = rdt * g.timeScale;
    g.simTime += dt;
    popBudget = Math.min(4, popBudget + rdt * 14);

    // cola de eventos programados (espectáculos, ráfagas)
    if (g.queue.length) {
      const due = g.queue.filter(q => q.at <= g.simTime);
      if (due.length) { g.queue = g.queue.filter(q => q.at > g.simTime); due.forEach(q => q.fn()); }
    }
    for (let i = 0; i < g.rockets.length; i++) {
      const r = g.rockets[i]; r.update(dt);
      if (r.state === 'done') { g.rockets.splice(i, 1); i--; }
    }
    fx.update(dt, g.simTime);
    smoke.update(dt, world.flashes);
    world.update(dt, rdt, time);

    // oyente = cámara
    const c = world.camera;
    right.setFromMatrixColumn(c.matrixWorld, 0);
    Object.assign(audio.listener, { x: c.position.x, y: c.position.y, z: c.position.z, rx: right.x, ry: right.y, rz: right.z });

    const s = world.pointScale(); fx.setScale(s); smoke.setScale(s);
    world.render();

    fpsAcc += rdt; fpsN++;
    if (fpsAcc > 0.5) {
      fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
      $('hud').textContent = `${fps} FPS · ${fx.n} PARTÍCULAS · ${audio.stats.voices} VOCES${g.timeScale < 1 ? ' · LENTA' : ''}`;
    }
    const lv = Math.min(1, audio.level() * 4);
    const on = Math.round(lv * bars.length);
    for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i < on);
  }

  window.addEventListener('resize', () => world.resize());
  buildRack(); select(selected); renderSeq();
  requestAnimationFrame(frame);
})();
