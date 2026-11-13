/* ------------------------------------------------------------------ UI */
const ui = { meteorSize: 6, meteorMode: 'one', showerN: 12, blastPower: 6, floors: 8, buildType: 'tower' };
let tool = 'meteor';
const HINTS = {
  camera: '<strong>Arrastrá</strong> para girar · <strong>pellizcá</strong> o rueda para acercar · <strong>dos dedos</strong> o clic derecho para desplazar.',
  meteor: '<strong>Tocá un punto</strong>: en modo Lluvia caen varios alrededor de ese punto.',
  blast: '<strong>Tocá dónde detonar</strong>. Desde potencia 8 se forma un hongo de humo.',
  quake: '<strong>Tocá</strong> para elegir el epicentro y empezar. Desde intensidad 5 se abren grietas; desde 8 hay sacudidas verticales.',
  tornado: '<strong>Tocá</strong> donde nace el tornado; con el tornado activo, tocá para guiarlo. Fuerza 8–10: tornado gigante.',
  tsunami: '<strong>Tocá cerca del borde</strong> por donde querés que entre la ola, o usá el botón.',
  storm: '<strong>Iniciá la tormenta</strong>: los rayos buscan lo más alto. Tocá para que caiga un rayo donde quieras.',
  volcano: '<strong>Tocá el suelo</strong> donde va a brotar el volcán. Primero se eleva, después hace erupción.',
  blackhole: '<strong>Tocá</strong> sobre qué punto se abre el agujero negro. Al terminar colapsa con una onda expansiva.',
  titans: '<strong>Tocá</strong> donde empieza la pelea. Basalto surge del suelo y Vex cae del cielo; también podés soltar uno solo a arrasar la ciudad.',
  build: '<strong>Tocá el suelo</strong> para levantar un edificio y probar su resistencia.',
};
function setTool(t) {
  tool = t;
  const tb = document.querySelector(`.tool[data-tool="${t}"] .short`); if (tb) $('#pill-tool').textContent = tb.textContent;
  document.querySelectorAll('.tool[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  document.querySelectorAll('.ctl').forEach((c) => (c.hidden = c.dataset.for !== t));
  $('#hint').innerHTML = HINTS[t];
}
document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => { Sfx.init(); setTool(b.dataset.tool); }));
function bindSlider(id, fn) {
  const inp = $('#' + id), out = $('#' + id + '-out');
  const h = () => { out.textContent = inp.value; fn(Number(inp.value)); };
  inp.addEventListener('input', h); h();
}
function bindSeg(id, attr, fn) {
  const btns = document.querySelectorAll(`#${id} button`);
  btns.forEach((b) => b.addEventListener('click', () => { btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset[attr]); }));
}
bindSlider('meteor-size', (v) => (ui.meteorSize = v));
bindSlider('shower-n', (v) => (ui.showerN = v));
bindSeg('meteor-mode', 'm', (v) => (ui.meteorMode = v));
bindSlider('blast-power', (v) => (ui.blastPower = v));
bindSlider('build-floors', (v) => (ui.floors = v));
bindSeg('build-type', 'b', (v) => (ui.buildType = v));
bindSlider('quake-int', (v) => (quake.intensity = v));
bindSlider('quake-dur', (v) => (quake.dur = v));
bindSlider('tornado-str', (v) => (tornado.strength = v));
bindSlider('tornado-dur', (v) => (tornado.dur = v));
bindSlider('tsunami-h', (v) => (tsunami.height = v));
bindSlider('storm-rate', (v) => (storm.rate = v));
bindSlider('storm-dur', (v) => (storm.dur = v));
bindSlider('volcano-pow', (v) => (volcano.power = v));
bindSlider('volcano-dur', (v) => (volcano.dur = v));
bindSlider('bh-pow', (v) => (blackhole.power = v));
bindSlider('bh-dur', (v) => (blackhole.dur = v));
bindSlider('titan-fury', (v) => (titans.fury = v));
bindSlider('titan-dur', (v) => (titans.dur = v));
bindSeg('titan-mode', 'm', (v) => (titans.mode = v));
$('#titan-cine').addEventListener('change', (e) => { titans.cine = e.target.checked; });
$('#titan-btn').addEventListener('click', () => { if (titans.list.length) retreatTitans(); });
function setQuake(on) {
  quake.on = on;
  if (on) { addThreat('quake', quake.epi.x, quake.epi.z, 25 + quake.intensity * 7, quake.dur, { siren: quake.intensity >= 6 }); quake.wakeT = 0; quake.t = 0; quake.crackT = 0.5; toast(quake.intensity >= 8 ? 'Terremoto extremo' : 'Terremoto en curso'); }
  refreshRunning();
}
$('#quake-btn').addEventListener('click', () => { Sfx.init(); if (!quake.on) setQuakeEpicenter(controls.target); setQuake(!quake.on); });
$('#tornado-btn').addEventListener('click', () => { Sfx.init(); setTornado(!tornado.on); });
$('#tsunami-btn').addEventListener('click', () => { Sfx.init(); launchTsunami(); });
$('#storm-btn').addEventListener('click', () => { Sfx.init(); setStorm(!storm.on); });
$('#btn-stop').addEventListener('click', () => { stopAll(); toast('Desastres detenidos'); });
function stopAll() {
  setQuake(false); setTornado(false); setStorm(false); shower.length = 0;
  if (tsunami.phase === 'advance') tsunami.phase = 'recede';
  if (volcano.phase === 'rising' || volcano.phase === 'erupt') { if (volcano.phase === 'rising') clearVolcano(); else { volcano.phase = 'dormant'; volcano.t = 0; } }
  if (blackhole.phase === 'grow' || blackhole.phase === 'active') { blackhole.phase = 'collapse'; blackhole.t = 0; }
  if (titans.list.length) retreatTitans();
  refreshRunning();
}
function refreshRunning() {
  const run = { quake: quake.on, tornado: tornado.on, storm: storm.on, tsunami: tsunami.phase !== 'idle', volcano: volcano.phase === 'rising' || volcano.phase === 'erupt', blackhole: blackhole.phase === 'grow' || blackhole.phase === 'active', titans: titans.list.length > 0 };
  for (const k in run) document.querySelector(`.tool[data-tool="${k}"]`).classList.toggle('running', run[k]);
  const set = (id, on, a, b) => { const el = $(id); el.textContent = on ? b : a; el.classList.toggle('stop', on); };
  set('#quake-btn', quake.on, 'Iniciar', 'Detener');
  set('#tornado-btn', tornado.on, 'Iniciar', 'Detener');
  set('#storm-btn', storm.on, 'Iniciar', 'Detener');
  $('#btn-evac').setAttribute('aria-pressed', String(evacuation)); $('#btn-evac').textContent = evacuation ? 'Fin evacuación' : 'Evacuar';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

function onTap(cx, cy) {
  if (tool === 'meteor') {
    const p = pick(cx, cy); if (!p) return;
    if (ui.meteorMode === 'shower') { startShower(ui.showerN, p, ui.meteorSize); return; }
    if (meteors.length >= 8) { toast('Esperá a que caigan los meteoritos en vuelo'); return; }
    launchMeteor(p, ui.meteorSize);
  } else if (tool === 'blast') {
    const p = pick(cx, cy); if (!p) return;
    const pw = ui.blastPower;
    blast(p, pw * 1.15 + 1, 3.5 + pw * 1.25);
  } else if (tool === 'quake') {
    const p = pick(cx, cy, true); if (!p) return;
    setQuakeEpicenter(p);
    if (!quake.on) setQuake(true); else toast('Epicentro movido');
  } else if (tool === 'tornado') {
    const p = pick(cx, cy, true); if (!p) return;
    if (!tornado.on) setTornado(true, p); else { tornado.target = p.clone(); toast('Tornado redirigido'); }
  } else if (tool === 'tsunami') {
    const p = pick(cx, cy, true);
    launchTsunami(p);
  } else if (tool === 'storm') {
    const p = pick(cx, cy); if (!p) return;
    strike(p);
  } else if (tool === 'volcano') {
    const p = pick(cx, cy, true); if (!p) return;
    if (p.x > RIVER.x0 - 4 && p.x < RIVER.x1 + 4) { toast('Elegí un punto fuera del río'); return; }
    startVolcano(p);
  } else if (tool === 'titans') {
    const p = pick(cx, cy, true); if (!p) return;
    if (p.x > RIVER.x0 - 6 && p.x < RIVER.x1 + 6) { toast('Elegí un punto fuera del río'); return; }
    startTitans(p);
  } else if (tool === 'blackhole') {
    const p = pick(cx, cy); if (!p) return;
    startBlackHole(p);
  } else if (tool === 'build') {
    const p = pick(cx, cy, true); if (!p) return;
    if (p.x > RIVER.x0 - 4 && p.x < RIVER.x1 + 4) { toast('No se puede construir sobre el río'); return; }
    const t = ui.buildType, w = t === 'glass' || t === 'stepped' ? 8 : 6;
    const col = t === 'glass' ? pickOf(GLASS_TINTS) : t === 'brick' ? pickOf(BRICK_TINTS) : PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const ok = addBuilding(Math.round(p.x), Math.round(p.z), w, w, ui.floors, col, t);
    if (!ok) { toast('Límite de piezas alcanzado. Reconstruí o destruí algo primero.'); return; }
    for (let i = 0; i < 24; i++) dust.emit(p.x + rnd(-4, 4), 0.4, p.z + rnd(-4, 4), rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1), rnd(1, 2), rnd(1.5, 2.5), 0.7, 0.67, 0.62, 0.5, 1, 1);
    Sfx.crumble(0.4);
    toast(`Edificio de ${ui.floors} pisos construido`);
  }
}

/* slow motion and time of day */
let timeScale = 1;
function toggleSlowmo() { timeScale = timeScale === 1 ? 0.25 : 1; $('#btn-slow').setAttribute('aria-pressed', String(timeScale < 1)); toast(timeScale < 1 ? 'Cámara lenta ×0,25' : 'Velocidad normal'); }
$('#btn-slow').addEventListener('click', toggleSlowmo);
const HOUR_CYCLE = [12, 18.6, 23, 6.6];
$('#btn-time').addEventListener('click', () => {
  const next = HOUR_CYCLE.find((h) => h > env.hour + 0.01 && h - env.hour < 12) ?? HOUR_CYCLE[0];
  env.hour = next; env.auto = false; syncHourUI(); toast(hourName(env.hour));
});
function fmtHour(h) { const m = Math.round((h % 1) * 60); return `${Math.floor(h)}:${m < 10 ? '0' : ''}${m}`; }
function syncHourUI() {
  $('#opt-hour').value = env.hour; $('#opt-hour-out').textContent = fmtHour(env.hour);
  $('#opt-cycle').checked = env.auto;
  const night = env.hour < 6 || env.hour >= 19.5;
  $('#ico-sun').hidden = night; $('#ico-moon').hidden = !night;
}
$('#opt-hour').addEventListener('input', (e) => { env.hour = Number(e.target.value); syncHourUI(); });
$('#opt-cycle').addEventListener('change', (e) => { env.auto = e.target.checked; });
$('#opt-dynres').addEventListener('change', (e) => { settings.dynRes = e.target.checked; if (!settings.dynRes) { dynScale = 1; renderer.setPixelRatio(Q.dpr); onResize(); } });

// sound + settings
const sndBtn = $('#btn-sound');
function renderSound() { sndBtn.setAttribute('aria-pressed', String(settings.sound)); $('#snd-wave').style.opacity = settings.sound ? 1 : 0.15; }
sndBtn.addEventListener('click', () => { settings.sound = !settings.sound; store.set('sound', settings.sound); Sfx.init(); Sfx.setEnabled(settings.sound); if (!settings.sound) Sfx.rumble(0); renderSound(); toast(settings.sound ? 'Sonido activado' : 'Sonido desactivado'); });
renderSound();
const settingsEl = $('#settings');
$('#btn-settings').addEventListener('click', () => { syncSettingsUI(); settingsEl.hidden = false; });
$('#settings-close').addEventListener('click', () => (settingsEl.hidden = true));
settingsEl.addEventListener('click', (e) => { if (e.target === settingsEl) settingsEl.hidden = true; });
function syncSettingsUI() {
  document.querySelectorAll('#quality-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === settings.quality)));
  $('#max-debris').value = settings.maxDebris; $('#max-debris-out').textContent = settings.maxDebris;
  $('#max-fx').value = settings.maxFx; $('#max-fx-out').textContent = settings.maxFx;
  $('#opt-shadows').checked = settings.shadows;
  $('#opt-shadows').disabled = QUALITY[settings.quality].shadowSize === 0;
}
document.querySelectorAll('#quality-seg button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.q === settings.quality) return;
  settings.quality = b.dataset.q; store.set('quality', settings.quality);
  applyQualityDefaults(); applyRenderQuality(); applyFxLimit(); syncSettingsUI(); resetCity();
}));
$('#max-debris').addEventListener('input', (e) => { settings.maxDebris = Number(e.target.value); $('#max-debris-out').textContent = settings.maxDebris; store.set('maxDebris.' + settings.quality, settings.maxDebris); enforceDebrisCap(); });
$('#max-fx').addEventListener('input', (e) => { settings.maxFx = Number(e.target.value); $('#max-fx-out').textContent = settings.maxFx; store.set('maxFx.' + settings.quality, settings.maxFx); applyFxLimit(); });
$('#opt-shadows').addEventListener('change', (e) => { settings.shadows = e.target.checked; store.set('shadows', settings.shadows); applyRenderQuality(); });

$('#btn-reset').addEventListener('click', () => { Sfx.init(); resetCity(); });


/* graphics: classic ("antes") vs enhanced ("después") on the same scene */
function applyGfx(silent) {
  applyGfxMaterials(); applyGfxDecor();
  dust.hd = fire.hd = gfx.enhanced;
  dust.mat.uniforms.uTextured.value = fire.mat.uniforms.uTextured.value = gfx.enhanced ? 1 : 0;
  if (!gfx.enhanced) sparks.clear();
  sun.shadow.radius = gfx.enhanced ? 3 : 1;
  if (gfx.enhanced) updateEnvironment(true); else scene.environment = null;
  $('#btn-gfx').setAttribute('aria-pressed', String(gfx.enhanced));
  $('#btn-gfx').querySelector('span').textContent = gfx.enhanced ? 'Después' : 'Antes';
  $('#opt-post').checked = gfx.post; $('#opt-post').disabled = !gfx.enhanced || !gfx.ready || !Q.post;
  if (!silent) toast(gfx.enhanced ? 'Gráficos mejorados (después)' : 'Gráficos clásicos (antes)');
}
function setGfx(on) { gfx.enhanced = on; store.set('gfx', on); applyGfx(); }
$('#btn-gfx').addEventListener('click', () => setGfx(!gfx.enhanced));
$('#opt-post').addEventListener('change', (e) => { gfx.post = e.target.checked; store.set('post', gfx.post); });

/* collapsible tools: more room for the scene and no accidental taps on the panel while moving the camera */
function setCollapsed(c) {
  $('#panel').hidden = c; document.querySelector('.toolbar').hidden = c; $('#btn-expand').hidden = !c;
  store.set('collapsed', c);
}
$('#btn-collapse').addEventListener('click', () => setCollapsed(true));
$('#btn-expand').addEventListener('click', () => setCollapsed(false));
if (store.get('collapsed', false)) setCollapsed(true);
$('#btn-evac').addEventListener('click', () => { Sfx.init(); setEvacuation(!evacuation); });
