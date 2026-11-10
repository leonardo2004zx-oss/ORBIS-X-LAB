/* ------------------------------------------------------------------ boot */
async function boot() {
  try {
    await RAPIER.init();
  } catch (e) {
    $('#loader-msg').textContent = 'No se pudo iniciar el motor de física: ' + e.message;
    throw e;
  }
  eventQueue = new RAPIER.EventQueue(true);
  applyRenderQuality();
  applyFxLimit();
  controls.radius = controls.goal.radius;
  createWorld();
  populateCity();
  syncAll(true);
  setTool('meteor');
  syncHourUI(); refreshRunning();
  $('#loader').hidden = true;
  requestAnimationFrame((t) => { last = t; frame(t); });
}

// hooks for automated checks
window.__dbg = { camera, scene, renderer, sun, hemi, controls };
window.__lab = {
  counts: () => ({ sim: +simTime.toFixed(1), stepMs: +stepMs.toFixed(2), blocks: blockCount(), debris: debris.items.length, props: props.length, awake: awakeCount, fps, meteors: meteors.length, quake: quake.on, ground: groundBody.translation() }),
  meteor: (x, y, z, s = 5) => launchMeteor(new THREE.Vector3(x, y, z), s),
  blast: (x, y, z, p = 5) => blast(new THREE.Vector3(x, y, z), p * 1.15 + 1, 3.5 + p * 1.25),
  quake: (on, i) => { if (i) quake.intensity = i; setQuake(on); },
  build: (x, z, f = 6) => addBuilding(x, z, 6, 6, f, 0xd9c2a5),
  reset: () => resetCity(),
  tool: (t) => setTool(t),
  tornado: (on, s) => { if (s) tornado.strength = s; setTornado(on); },
  tornadoAt: (x, z) => setTornado(true, new THREE.Vector3(x, 0, z)),
  tsunami: (h) => { if (h) tsunami.height = h; launchTsunami(); },
  tsunamiState: () => ({ phase: tsunami.phase, front: tsunami.front }),
  storm: (on, r) => { if (r) storm.rate = r; setStorm(on); },
  strike: (x, z) => strike(pickDown(x, z)),
  shower: () => startShower(12, controls.target, 6),
  fires: () => fires.length,
  stopAll: () => stopAll(),
  heights: () => allBlocks().reduce((m, it) => Math.max(m, it.body.translation().y), 0),
  volcano: (x, z, p) => { if (p) volcano.power = p; startVolcano(new THREE.Vector3(x, 0, z)); },
  volcanoState: () => ({ phase: volcano.phase, lavaR: +volcano.lavaR.toFixed(1), bombs: volcano.bombs.length }),
  blackhole: (x, z, p) => { if (p) blackhole.power = p; startBlackHole(new THREE.Vector3(x, 0, z)); },
  bhState: () => ({ phase: blackhole.phase, eaten: blackhole.eaten }),
  hour: (h) => { env.hour = h; syncHourUI(); },
  slow: () => toggleSlowmo(),
  cracks: () => cracks.length,
  velStats: () => { const v = []; for (const it of allBlocks()) if (!it.body.isSleeping()) { const l = it.body.linvel(), a = it.body.angvel(); v.push([Math.hypot(l.x, l.y, l.z), Math.hypot(a.x, a.y, a.z), it.still || 0]); } v.sort((a, b) => a[0] - b[0]); const q = (k) => v.length ? v[Math.floor(k * (v.length - 1))].map((x) => +x.toFixed(3)) : null; return { n: v.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) }; },
  traffic: () => props.filter((p) => p.drive).length,
  shockwaves: () => shockwaves.length,
};
boot();
