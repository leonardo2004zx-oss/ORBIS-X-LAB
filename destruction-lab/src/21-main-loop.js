/* ------------------------------------------------------------------ main loop */
let stepMs = 0, simTime = 0, acc = 0, last = performance.now(), awakeCount = 0;
const DT = 1 / 60;
const breakQueue = [];
function handleEvents() {
  eventQueue.drainContactForceEvents((ev) => {
    const f = ev.totalForceMagnitude();
    const a = colliderMap.get(ev.collider1()), b = colliderMap.get(ev.collider2());
    if (a && a.kind === 'block' && f > a.breakForce && simTime - a.born > 0.5) breakQueue.push(a);
    if (b && b.kind === 'block' && f > b.breakForce && simTime - b.born > 0.5) breakQueue.push(b);
  });
  let n = 0;
  while (breakQueue.length) {
    const it = breakQueue.pop();
    if (it.dead) continue;
    if (n++ >= 4) continue; // limit per step to keep framerate stable
    const lv = it.body.linvel();
    fragment(it, null, 1.5 + Math.min(4, Math.hypot(lv.x, lv.y, lv.z) * 0.15));
  }
  breakQueue.length = 0;
}

function syncPool(pool) {
  let changed = false;
  const items = pool.items;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const b = it.body;
    let sleeping = b.isSleeping();
    if (!sleeping) {
      // put pieces that have been still for a while to sleep: keeps the solver cheap after a collapse
      const v = b.linvel(), w = b.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z < 0.02 && w.x * w.x + w.y * w.y + w.z * w.z < 0.03) {
        if (!it.still) it.still = simTime;
        else if (simTime - it.still > 0.8 && quake.amp < 0.01) { b.sleep(); it.still = 0; sleeping = true; }
      } else it.still = 0;
    }
    if (!sleeping) awakeCount++;
    // settled debris on the ground becomes static rubble: it stays visible but costs no physics
    if (sleeping && pool === debris && gfx.enhanced && simTime - it.born > 4) {
      const t = b.translation();
      if (t.y < 1.6 && quake.amp < 0.01) { addRubble(it); removeItem(it); changed = true; continue; }
    }
    if (!sleeping || it.dirty) {
      const t = b.translation();
      if (t.y < -25) { removeItem(it); changed = true; continue; }
      if (!sleeping && collapseDust > 0 && t.y < 2.5 && it.kind === 'block') {
        const v = b.linvel();
        if (v.y < -4) { collapseDust--; const g = rnd(0.5, 0.62), hd = gfx.enhanced ? 1.6 : 1; for (let q = 0; q < (gfx.enhanced ? 2 : 1); q++) dust.emit(t.x + rnd(-1, 1), 0.6, t.z + rnd(-1, 1), rnd(-4, 4), rnd(0.5, 2.5), rnd(-4, 4), rnd(3, 6) * hd, rnd(2.5, 4) * hd, g + 0.05, g + 0.02, g - 0.02, 0.65, 1.8 * hd, 0.8); }
      }
      const r = b.rotation();
      tmpV.set(t.x, t.y, t.z); tmpQ.set(r.x, r.y, r.z, r.w); tmpS.set(it.sx, it.sy, it.sz);
      tmpM.compose(tmpV, tmpQ, tmpS);
      pool.mesh.setMatrixAt(it.idx, tmpM);
      it.dirty = false; changed = true;
    }
  }
  if (changed) pool.mesh.instanceMatrix.needsUpdate = true;
}
let collapseDust = 0;
function syncAll(force) {
  awakeCount = 0; collapseDust = gfx.enhanced ? 10 : 6;
  if (force) { for (const p of BLOCK_POOLS) for (const it of p.items) it.dirty = true; for (const it of debris.items) it.dirty = true; }
  for (const p of BLOCK_POOLS) syncPool(p);
  syncPool(debris);
  for (let i = props.length - 1; i >= 0; i--) {
    const it = props[i];
    if (it.ttl && simTime > it.ttl) { const t = it.body.translation(); dust.emit(t.x, t.y, t.z, 0, 0.5, 0, 1, 1.5, 0.4, 0.38, 0.36, 0.5, 1, 1); removeItem(it); continue; }
    const asleep = it.body.isSleeping();
    if (!asleep || force || !it.synced) {
      if (!asleep) awakeCount++;
      const t = it.body.translation(), r = it.body.rotation();
      if (t.y < -25) { removeItem(it); continue; }
      if (it.obj) { it.obj.position.set(t.x, t.y, t.z); it.obj.quaternion.set(r.x, r.y, r.z, r.w); }
      else { tmpV.set(t.x, t.y, t.z); tmpQ.set(r.x, r.y, r.z, r.w); if (it.rotOff) tmpQ.multiply(it.rotOff); tmpS.set(1, 1, 1); tmpM.compose(tmpV, tmpQ, tmpS); for (const p of it.slots) { p.mesh.setMatrixAt(it[p.id], tmpM); p.mesh.instanceMatrix.needsUpdate = true; } }
      it.synced = true;
      if (it.trail && it.cool > 0.3 && !asleep && Math.random() < 0.7) {
        const g = rnd(0.18, 0.28);
        dust.emit(t.x, t.y, t.z, rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3), rnd(1.5, 3), it.trail * rnd(0.8, 1.2), g, g, g, 0.6, 1.2, 0.5, -0.2);
        fire.emit(t.x, t.y, t.z, 0, 0, 0, 0.25, it.trail * 0.8, 1, 0.5, 0.1, 0.9, -1, 0, 0);
      }
    }
    if (it.cool > 0) { it.cool = Math.max(0, it.cool - 0.003); if (it.obj && it.obj.material) it.obj.material.emissiveIntensity = 1.8 * it.cool; }
  }
  const g = groundBody.translation();
  groundGroup.position.set(g.x, g.y - GROUND_Y, g.z);
}

let lowFps = 0, lowFpsWarned = false, fpsFrames = 0, fpsTime = 0, fps = 60, paused = false, dynScale = 1, dynT = 0;
const statsEl = $('#stats');
// city ambience: traffic hum near the camera, crowd running, distant city noise
function ambience() {
  let cars = 0; const cam = camera.position;
  for (const it of props) if (it.drive && !it.dead) { const t = it.body.translation(); if (Math.abs(t.x - cam.x) + Math.abs(t.z - cam.z) < 90) cars++; }
  const zoom = THREE.MathUtils.clamp(1.4 - controls.radius / 120, 0.25, 1);
  Sfx.loop('engine', Math.min(0.35, cars * 0.04) * zoom);
  Sfx.loop('city', (0.08 + 0.05 * (1 - env.night)) * zoom);
  Sfx.loop('crowd', Math.min(0.3, fleeingNear * 0.012) * zoom);
}
const perf = { phys: 0, upd: 0, rend: 0, frame: 0 };
let frameNo = 0;
const ema = (k, v) => { perf[k] = perf[k] * 0.92 + v * 0.08; };
function frame(now) {
  requestAnimationFrame(frame);
  const fdt = Math.min(0.1, (now - last) / 1000); ema('frame', now - last); last = now;
  if (paused) return;
  const tA = performance.now();
  const sdt = fdt * timeScale;
  acc += sdt;
  let n = 0;
  while (acc >= DT && n < Q.substeps) {
    quakeStep(DT);
    tornadoForces(DT);
    tsunamiForces(DT);
    shockStep(DT);
    volcanoStep(DT);
    blackholeStep(DT);
    titansStep(DT);
    trafficStep();
    const s0 = performance.now();
    world.step(eventQueue);
    stepMs = stepMs * 0.95 + (performance.now() - s0) * 0.05;
    simTime += DT;
    handleEvents();
    acc -= DT; n++;
  }
  if (n >= Q.substeps) acc = 0;
  const tB = performance.now(); ema('phys', tB - tA);
  updateShower(sdt);
  updateMeteors(sdt);
  tornadoUpdate(sdt);
  tsunamiUpdate(sdt);
  stormUpdate(sdt);
  volcanoUpdate(sdt);
  blackholeUpdate(sdt);
  titansUpdate(sdt);
  titanRocksUpdate();
  updateCracks(sdt);
  updateFires(sdt);
  updateLights(sdt);
  updatePeople(sdt);
  updateEmergency(sdt);
  ambience();
  updateEffects(sdt);
  updateLighting(sdt);
  dust.update(sdt); fire.update(sdt);
  syncAll(false);
  if (quake.amp > 0.01) {
    Sfx.rumble(Math.min(1, quake.amp * (0.25 + quake.intensity * 0.08)));
    shake = Math.max(shake, quake.amp * quake.intensity * 0.05);
  } else if (!quake.on && volcano.phase !== 'rising') Sfx.rumble(0);
  controls.update(fdt);
  if (shake > 0.001) {
    camera.position.x += rnd(-1, 1) * shake * 0.35; camera.position.y += rnd(-1, 1) * shake * 0.35; camera.position.z += rnd(-1, 1) * shake * 0.35;
    shake *= Math.exp(-fdt * 3.5);
  }
  // keep the shadow frustum centered on what you look at; light comes from the sun (or the moon)
  sun.position.set(controls.target.x + sunDir.x * 90, sunDir.y * 90, controls.target.z + sunDir.z * 90);
  sun.target.position.set(controls.target.x, 0, controls.target.z); sun.target.updateMatrixWorld();
  const tC = performance.now(); ema('upd', tC - tB);
  // shadows are refreshed every other frame: halves their cost, hardly visible
  frameNo++; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = (frameNo & 1) === 0;
  renderFrame();
  ema('rend', performance.now() - tC);
  fpsFrames++; fpsTime += fdt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
    // dynamic resolution keeps the frame rate up on phones
    if (settings.dynRes) {
      dynT = fps < 26 ? dynT + 1 : fps > 50 ? dynT - 1 : 0;
      if (dynT >= 4 && dynScale > 0.6) { dynScale = Math.max(0.6, dynScale - 0.12); dynT = 0; renderer.setPixelRatio(Q.dpr * dynScale); onResize(); }
      if (dynT <= -8 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.1); dynT = 0; renderer.setPixelRatio(Q.dpr * dynScale); onResize(); }
    }
    lowFps = fps < 22 && awakeCount < 30 && settings.quality !== 'bajo' ? lowFps + 1 : 0;
    if (lowFps === 10 && !lowFpsWarned) { lowFpsWarned = true; toast('Va lento: probá calidad Baja en Ajustes'); }
    statsEl.textContent = `${fps} FPS · ${blockCount()} piezas · ${debris.items.length} escombros · ${awakeCount} en movimiento${timeScale < 1 ? ' · cámara lenta' : ''}`;
  }
}

function onResize() {
  const w = app.clientWidth || window.innerWidth, h = app.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!controls.userZoomed) controls.goal.radius = w / h < 0.8 ? 105 : w / h < 1.2 ? 80 : 64;
  const sc = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  dust.mat.uniforms.uScale.value = sc; fire.mat.uniforms.uScale.value = sc;
  if (gfx.composer) {
    const pr = renderer.getPixelRatio();
    gfx.composer.setPixelRatio(pr); gfx.composer.setSize(w, h);
    if (Q.bloomScale < 1) gfx.bloom.setSize(w * pr * Q.bloomScale, h * pr * Q.bloomScale); // cheaper bloom on phones
  }
}
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { paused = document.hidden; last = performance.now(); if (paused) { Sfx.rumble(0); for (const k of ['wind', 'water', 'rain', 'hum', 'lava', 'city', 'engine', 'crowd']) Sfx.loop(k, 0); Sfx.siren(0); } });

