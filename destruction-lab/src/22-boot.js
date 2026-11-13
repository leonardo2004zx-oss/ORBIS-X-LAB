/* ------------------------------------------------------------------ boot */
async function boot() {
  try {
    await RAPIER.init();
  } catch (e) {
    $('#loader-msg').textContent = 'No se pudo iniciar el motor de física: ' + e.message;
    throw e;
  }
  eventQueue = new RAPIER.EventQueue(true);
  $('#loader-msg').textContent = 'Preparando materiales y efectos…';
  await initPost();
  buildHDMaterials();
  buildDecor();
  applyRenderQuality();
  applyFxLimit();
  controls.radius = controls.goal.radius;
  createWorld();
  populateCity();
  buildNav(); buildSignals(); buildPeople(); spawnPeople();
  syncAll(true);
  setTool('meteor');
  syncHourUI(); refreshRunning(); applyGfx(true);
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
  renderMs: () => { const gl = renderer.getContext(); gl.finish(); const t0 = performance.now(); renderFrame(); gl.finish(); const a = performance.now() - t0; const t1 = performance.now(); renderer.render(scene, camera); gl.finish(); return { composer: +a.toFixed(1), direct: +(performance.now() - t1).toFixed(1) }; },
  prof: () => { const gl = renderer.getContext(), px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const T = (f) => { sync(); const t = performance.now(); f(); sync(); return +(performance.now() - t).toFixed(1); };
    return { particles: T(() => { dust.update(0.016); fire.update(0.016); }), sparks: T(() => sparks.update(0.016)), sync: T(() => syncAll(false)), light: T(() => updateLighting(0.016)), step: T(() => world.step(eventQueue)), renderDirect: T(() => renderer.render(scene, camera)), renderFrame: T(() => renderFrame()) }; },
  perf: () => ({ phys: +perf.phys.toFixed(2), upd: +perf.upd.toFixed(2), rend: +perf.rend.toFixed(2), frame: +perf.frame.toFixed(1) }),
  people: () => { const c = {}; for (const p of peds) c[p.state] = (c[p.state] || 0) + 1; return { n: peds.length, ...c, threats: threats.map((t) => t.kind).join('+'), siren: simTime < sirenUntil, emergency: emergency.length, evac: evacuation }; },
  evac: (on) => setEvacuation(on),
  dmg: () => allBlocks().filter((b) => b.dmg > 0.1).length,
  titans: (mode, x, z, fury) => { if (mode) titans.mode = mode; if (fury) titans.fury = fury; startTitans(new THREE.Vector3(x, 0, z)); },
  titanState: () => titans.list.map((T) => ({ k: T.kind, s: T.state, hp: Math.round(T.hp), x: Math.round(T.pos.x), z: Math.round(T.pos.z) })),
  retreat: () => retreatTitans(),
  titanHp: (k, hp) => { const T = titans.list.find((x) => x.kind === k); if (T) T.hp = hp; },
  titanAttack: (k, move) => { const T = titans.list.find((x) => x.kind === k); if (T && !T.busy()) startAct(T, move); },
  fightLog: () => { const l = titans.log || []; titans.log = []; return l.join(' '); },
  titanDemo: (n) => titanDemo(n),
  titanDebug: () => titans.list.map((T) => { let n = 0, bad = 0; const bb = new THREE.Box3(); T.root.updateMatrixWorld(true); T.root.traverse((o) => { if (o.isMesh) { n++; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) if (!isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) { bad++; break; } bb.expandByObject(o); } }); return { k: T.kind, vis: T.root.visible, inScene: !!T.root.parent, meshes: n, badGeo: bad, min: bb.min.toArray().map((v) => +v.toFixed(1)), max: bb.max.toArray().map((v) => +v.toFixed(1)), y: T.y, cam: camera.position.toArray().map((v) => +v.toFixed(1)), tgt: controls.target.toArray().map((v) => +v.toFixed(1)) }; }),
  cineState: () => ({ slow: +cine.slow.toFixed(2), hitStop: +cine.hitStop.toFixed(2) }),
  gfx: (on) => { if (on !== undefined) setGfx(on); return { enhanced: gfx.enhanced, post: gfx.ready && gfx.post, env: !!scene.environment, rubble: rubble.count }; },
};
boot();
