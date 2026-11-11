/* ------------------------------------------------------------------ reset */
function clearScene() {
  for (const m of meteors) scene.remove(m.mesh);
  meteors.length = 0;
  for (const e of effects) e.end();
  effects.length = 0;
  for (const p of props) if (p.obj) scene.remove(p.obj);
  for (const p of PROP_POOLS) p.clear();
  clearLampFX(); clearRubble(); sparks.clear();
  props.length = 0;
  for (const c of craters) { groundGroup.remove(c); c.material.dispose(); }
  craters.length = 0;
  for (const p of BLOCK_POOLS) p.clear();
  debris.clear(); debrisQueue = [];
  colliderMap.clear();
  dust.clear(); fire.clear();
  groundGroup.position.set(0, 0, 0);
  flashLight.intensity = 0;
  fires.length = 0; shower.length = 0;
  tornado.on = false; tornado.fade = 0; funnel.visible = false;
  tsunami.phase = 'idle'; tsunami.depth = 0; tsunami.crest = 0; tsunami.front = -200; water.visible = false;
  storm.on = false;
  clearCracks(); clearVolcano(); volcano.bombs.length = 0; clearBlackHole();
  for (const w of shockwaves) { scene.remove(w.ring, w.shell); w.ring.material.dispose(); w.shell.material.dispose(); }
  shockwaves.length = 0; env.ash = env.ashTarget = 0; skyFlash = 0;
}
function resetCity() {
  clearScene();
  if (eventQueue) eventQueue.clear();
  if (world) world.free();
  createWorld();
  populateCity();
  clearPeople(); spawnPeople();
  quake.t = 0; quake.amp = 0; setQuake(false); Sfx.rumble(0); refreshRunning();
  syncAll(true);
  toast('Ciudad reconstruida');
  refreshRunning();
}

