/* ------------------------------------------------------------------ effects */
const effects = [];
const fireballGeo = new THREE.SphereGeometry(1, 20, 14);
const ringGeo = new THREE.RingGeometry(0.82, 1, 64); ringGeo.rotateX(-Math.PI / 2);
let shake = 0;
// camera shake proportional to the impact and attenuated by distance to the camera
function addShake(amount, P) {
  const d = P ? camera.position.distanceTo(P) : 0;
  shake = Math.min(2.6, shake + amount / (1 + d / 45));
}
function soundDelay(P) { return Math.min(0.6, camera.position.distanceTo(P) / 340); }

/* shock waves: a visible ring that travels outward and shoves whatever it passes */
const shockwaves = [];
function addShockwave(P, power, inner, maxR) {
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  ring.position.set(P.x, Math.max(0.2, Math.min(P.y, 1) * 0.3), P.z); scene.add(ring);
  const shell = gfx.enhanced ? new THREE.Mesh(fireballGeo, shellMatHD()) : new THREE.Mesh(fireballGeo, new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }));
  shell.position.copy(P); scene.add(shell);
  shockwaves.push({ P: P.clone(), r: inner * 0.3, rPrev: 0, speed: 38 + power * 5, inner, maxR, v0: 1.6 + power * 0.9, ring, shell });
}
function shockStep(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const w = shockwaves[i];
    w.rPrev = w.r; w.r += w.speed * dt;
    for (const it of dynItems()) {
      if (it.dead) continue;
      const t = it.body.translation();
      const dx = t.x - w.P.x, dy = t.y - w.P.y, dz = t.z - w.P.z, d = Math.hypot(dx, dy, dz);
      if (d <= w.inner || d <= w.rPrev || d > w.r) continue;
      const v = w.v0 * (1 - d / w.maxR) * (t.y < 12 ? 1 : 0.5);
      // buildings only feel the wave close to the blast; light objects (cars, trees, debris) feel all of it
      if (it.kind === 'block') { if (v * 0.4 > 2.2 && it.body.isSleeping() === false || v * 0.4 > 3.2) pushBody(it.body, dx, dy * 0.3, dz, d, v * 0.4); }
      else if (v > 0.3) pushBody(it.body, dx, dy * 0.3, dz, d, v);
    }
    if (w.r > w.maxR) { shockwaves.splice(i, 1); scene.remove(w.ring, w.shell); w.ring.material.dispose(); w.shell.material.dispose(); }
  }
}
function shockVisual(dt) {
  for (const w of shockwaves) {
    const k = w.r / w.maxR;
    w.ring.scale.setScalar(w.r); w.ring.material.opacity = 0.8 * (1 - k) * (1 - k);
    const so = Math.max(0, 1 - w.r / (w.inner * (gfx.enhanced ? 3.2 : 2.2)));
    w.shell.scale.setScalar(Math.min(w.r, w.inner * (gfx.enhanced ? 3.2 : 2.2)));
    if (w.shell.material.uniforms) w.shell.material.uniforms.uOpacity.value = 0.9 * so; else w.shell.material.opacity = 0.22 * so;
    const n = Math.round(10 * (1 - k));
    for (let j = 0; j < n; j++) {
      const a = rnd(0, Math.PI * 2), x = w.P.x + Math.cos(a) * w.r, z = w.P.z + Math.sin(a) * w.r, g = rnd(0.45, 0.58);
      dust.emit(x, 0.5, z, Math.cos(a) * 5, rnd(0.5, 2.5), Math.sin(a) * 5, rnd(0.9, 1.8), rnd(1.6, 3), g + 0.06, g + 0.03, g, 0.55, 2, 1.5);
    }
  }
}

function blast(P, power, radius, opts = {}) {
  const vmax = 3.4 * Math.min(power, 13);
  if (!opts.silent) Sfx.boom(Math.min(1, power / 10), soundDelay(P));
  addShake(0.3 + power * 0.1, P);
  flashLight.position.set(P.x, P.y + 3, P.z);
  flashLight.intensity = (gfx.enhanced ? 2600 : 1200) + power * (gfx.enhanced ? 1100 : 700);
  if (power >= 7) skyFlash = Math.max(skyFlash, Math.min(1, (power - 6) * (gfx.enhanced ? 0.08 : 0.15)));
  if (!opts.noFire && !opts.silent && power >= 4) addFire(P, 6 + power * 0.9, 0.6 + power * 0.08);
  // blinding flash
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  fl.position.copy(P); fl.position.y += 1; scene.add(fl);
  const flS = gfx.enhanced ? 1.2 : 2.5, flO = gfx.enhanced ? 0.75 : 1;
  effects.push({ t: 0, dur: 0.3, update(e, k) { fl.scale.setScalar(radius * (flS + 2 * k)); fl.material.opacity = flO * (1 - k) * (1 - k); }, end() { scene.remove(fl); fl.material.dispose(); } });
  // fireball: animated noise sphere (enhanced) or the old pair of spheres (classic)
  if (!opts.noFireball && gfx.enhanced) hdFireball(P, radius, power);
  if (gfx.enhanced) {
    for (let i = 0; i < 25 + power * 9; i++) { tmpV.set(rnd(-1, 1), rnd(-0.1, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 18 + power * 2.5)); sparks.emit(P.x, P.y + 0.6, P.z, tmpV.x, tmpV.y, tmpV.z, rnd(0.6, 1.8)); }
    // heavy dark smoke that rolls outward and up, lit from above
    for (let i = 0; i < 10 + power * 3; i++) {
      tmpV.set(rnd(-1, 1), rnd(0.1, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(1, 3 + power * 0.5));
      const g = rnd(0.08, 0.16);
      dust.emit(P.x + tmpV.x, P.y + rnd(0.5, 2.5), P.z + tmpV.z, tmpV.x, tmpV.y + rnd(1, 3), tmpV.z, rnd(6, 11), rnd(4, 6.5) + power * 0.45, g + 0.02, g + 0.015, g, 0.85, 1.1 + power * 0.1, 0.35, -0.05);
    }
  }
  if (!opts.noFireball && !gfx.enhanced) {
    const core = new THREE.Mesh(fireballGeo, new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const shellM = new THREE.Mesh(fireballGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    core.position.copy(P); shellM.position.copy(P); scene.add(core, shellM);
    const maxR = radius * 0.6;
    effects.push({ t: 0, dur: 0.9, update(e, k) {
      const s = maxR * (0.3 + 0.7 * Math.sqrt(k));
      core.scale.setScalar(s * 0.75); core.material.opacity = Math.max(0, 1 - k * 1.6);
      shellM.scale.setScalar(s); shellM.position.y = P.y + k * maxR * 0.6; shellM.material.opacity = 0.75 * (1 - k);
      shellM.material.color.setHSL(0.06 - k * 0.05, 1, 0.5 - k * 0.38);
    }, end() { scene.remove(core, shellM); core.material.dispose(); shellM.material.dispose(); } });
  }
  addShockwave(P, power, radius * 0.7, radius * (2.4 + power * 0.12));
  // particles: flames, embers, rolling dust, smoke column, chunks
  const nFire = Math.round(24 + power * 8), nDust = Math.round(20 + power * 9), nChunk = Math.round(10 + power * 4);
  for (let i = 0; i < nFire; i++) {
    tmpV.set(rnd(-1, 1), rnd(-0.1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 4 + power * 1.5));
    fire.emit(P.x, P.y + 0.5, P.z, tmpV.x, tmpV.y + 2.5, tmpV.z, rnd(0.5, 1.3), rnd(1.6, 3) + power * 0.35, 1.0, rnd(0.4, 0.7), 0.12, 1, 3, 2.4, -2);
  }
  for (let i = 0; i < 10 + power * 3; i++) {
    tmpV.set(rnd(-1, 1), rnd(0.3, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(6, 10 + power * 1.6));
    fire.emit(P.x, P.y + 0.5, P.z, tmpV.x, tmpV.y, tmpV.z, rnd(1.2, 2.6), rnd(0.25, 0.5), 1, rnd(0.55, 0.8), 0.2, 1, -0.05, 0.25, 9.8);
  }
  for (let i = 0; i < nDust; i++) {
    tmpV.set(rnd(-1, 1), rnd(0, 0.5), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 3 + power * 1.1));
    const sh = rnd(0.34, 0.52);
    dust.emit(P.x + tmpV.x * 0.3, P.y + rnd(0, 1.2), P.z + tmpV.z * 0.3, tmpV.x, tmpV.y + 0.6, tmpV.z, rnd(3, 6 + power * 0.3), rnd(2.2, 3.8) + power * 0.3, sh + 0.06, sh + 0.03, sh, 0.8, 1.5 + power * 0.14, 0.8, -0.2);
  }
  for (let i = 0; i < nChunk; i++) {
    tmpV.set(rnd(-1, 1), rnd(0.4, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(5, 9 + power * 1.5));
    dust.emit(P.x, P.y + 0.5, P.z, tmpV.x, tmpV.y, tmpV.z, rnd(1, 2), rnd(0.15, 0.32), 0.24, 0.22, 0.2, 1, 0, 0.15, 9.8);
  }
  // rising smoke column; a mushroom cloud for the big ones
  const big = power >= 8 && !opts.silent;
  const colH = big ? 14 + power * 2 : 0;
  effects.push({ t: 0, dur: big ? 3.2 : 1.6, update(e, k) {
    const n = big ? 5 : 2;
    for (let j = 0; j < n; j++) {
      const g = rnd(0.12, 0.22);
      if (big && k > 0.12) {
        const a = rnd(0, 6.28), r = rnd(0, 3 + power * 0.9) * Math.min(1, k * 1.6), h = colH * Math.min(1, k * 2);
        dust.emit(P.x + Math.cos(a) * r, P.y + h + rnd(-2, 2), P.z + Math.sin(a) * r, Math.cos(a) * 2.2, rnd(0.6, 1.6), Math.sin(a) * 2.2, rnd(6, 10), rnd(5, 8), g + 0.1, g + 0.07, g + 0.05, 0.7, 1.2, 0.3, -0.05);
        if (k < 0.5) fire.emit(P.x + Math.cos(a) * r * 0.5, P.y + h * 0.9, P.z + Math.sin(a) * r * 0.5, 0, 1, 0, rnd(0.4, 0.8), rnd(3, 5), 1, 0.45, 0.1, 0.7, 1, 0.5, -0.5);
      }
      const yv = big ? rnd(9, 14) : rnd(2.5, 5);
      dust.emit(P.x + rnd(-1.5, 1.5), P.y + 1, P.z + rnd(-1.5, 1.5), rnd(-0.4, 0.4), yv, rnd(-0.4, 0.4), big ? colH / yv * rnd(0.8, 1.2) + 3 : rnd(4, 7), rnd(2.5, 4) + power * 0.2, g, g, g + 0.02, 0.7, 1.4, 0.25, 0);
    }
  }, end() {} });

  // physics: fragment nearest blocks, push everything in range
  let budget = Math.max(2, Math.round(Q.fragBudget * (0.35 + Math.min(power, 12) / 9)));
  const nearBlocks = [];
  for (const it of dynItems()) {
    if (it.dead) continue;
    const t = it.body.translation();
    const dx = t.x - P.x, dy = t.y - P.y, dz = t.z - P.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > radius) continue;
    if (it.kind === 'block' && d < radius * 0.62) { nearBlocks.push([d, it]); continue; }
    pushBody(it.body, dx, dy, dz, d, vmax * (1 - d / radius));
  }
  nearBlocks.sort((a, b) => a[0] - b[0]);
  for (const [d, it] of nearBlocks) {
    const f = Math.pow(1 - d / radius, 1.2);
    if (budget-- > 0) fragment(it, P, vmax * f);
    else { const t = it.body.translation(); pushBody(it.body, t.x - P.x, t.y - P.y, t.z - P.z, d, vmax * f); }
  }
  if (!opts.noCrater) addCrater(P, radius * 0.45, power >= 6);
  damageAround(P, radius * 1.9, Math.min(1, 0.45 + power * 0.07));
  impactAt(P.x, P.z, radius * 0.45, radius * 2.1);
  addThreat('blast', P.x, P.z, radius * 2.1, 6, { siren: power >= 6 });
  if (power >= 7 && !opts.silent) setTimeout(() => dispatchEmergency(P.x, P.z), 2500);
}
// marks left on nearby facades (broken windows, soot) and a little smoke from the worst hit
function damageAround(P, r, amount) {
  const touched = new Set();
  let smokes = 0;
  for (const it of allBlocks()) {
    const t = it.body.translation(), d = Math.hypot(t.x - P.x, t.y - P.y, t.z - P.z);
    if (d > r) continue;
    const v = Math.min(1, Math.max(it.dmg || 0, amount * (1 - d / r) * rnd(0.75, 1.15)));
    if (v <= (it.dmg || 0)) continue;
    it.dmg = v; it.pool.dmg.setX(it.idx, v); touched.add(it.pool);
    if (v > 0.7 && smokes < 2 && Math.random() < 0.15 && gfx.enhanced) { smokes++; addFire(new THREE.Vector3(t.x, t.y, t.z), rnd(10, 18), 0.5); }
  }
  for (const p of touched) p.dmg.needsUpdate = true;
}
function pushBody(body, dx, dy, dz, d, v) {
  if (d < 0.01) { dx = 0; dy = 1; dz = 0; d = 1; }
  const m = body.mass();
  let nx = dx / d, ny = dy / d + 0.45, nz = dz / d;
  const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  body.applyImpulse({ x: nx * v * m, y: ny * v * m, z: nz * v * m }, true);
  const tq = m * v * 0.08;
  body.applyTorqueImpulse({ x: rnd(-tq, tq), y: rnd(-tq, tq), z: rnd(-tq, tq) }, true);
}
const moltenTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,190,90,1)'); r.addColorStop(0.35, 'rgba(255,90,20,0.8)'); r.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
function addCrater(P, r, glow) {
  if (P.y > 2.5) return;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: craterTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 - craters.length * 0.1 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6;
  const gp = groundGroup.position;
  m.position.set(P.x - gp.x, 0.1 + craters.length * 0.003, P.z - gp.z);
  m.scale.setScalar(r * 2); m.receiveShadow = true;
  groundGroup.add(m); craters.push(m);
  if (craters.length > 24) { const o = craters.shift(); groundGroup.remove(o); o.material.dispose(); }
  if (glow) { // molten floor that cools down
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: moltenTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
    g.rotation.x = -Math.PI / 2; g.position.set(P.x - gp.x, 0.2, P.z - gp.z); g.scale.setScalar(r * 1.3); groundGroup.add(g);
    effects.push({ t: 0, dur: 9, update(e, k) { g.material.opacity = (1 - k) * (0.8 + 0.2 * Math.sin(e.t * 9)); }, end() { groundGroup.remove(g); g.material.dispose(); } });
  }
}

/* meteors */
const meteors = [];
const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, emissive: 0xff5a10, emissiveIntensity: 1.8, roughness: 0.9, flatShading: true });
function launchMeteor(P, size) {
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) + rnd(-0.9, 0.9) + Math.PI * 0.5;
  const dir = new THREE.Vector3(Math.sin(az) * 0.6, -1, Math.cos(az) * 0.6).normalize();
  const dist = 150;
  const start = P.clone().addScaledVector(dir, -dist);
  const r = 0.6 + size * 0.17;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rockMat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  glow.scale.setScalar(r * 11); mesh.add(glow);
  mesh.position.copy(start); scene.add(mesh);
  const dur = 1.5;
  // warning marker on the ground where it will hit
  const mark = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  mark.position.set(P.x, Math.max(0.25, P.y + 0.15), P.z); scene.add(mark);
  meteors.push({ P: P.clone(), start, dir, t: 0, dur, mesh, size, r, mark });
  // anticipation: people near the target see it coming and start running
  addThreat('meteor', P.x, P.z, 14 + size * 3.5, dur + 6, { siren: size >= 5 });
  Sfx.whoosh(dur);
}
function impactMeteor(m) {
  const power = 3.5 + m.size * 1.2, radius = 5 + m.size * 1.7;
  blast(m.P, power, radius, { meteor: true });
  if (m.size >= 7) addShake(1.2, m.P);
  // glowing ejecta rocks fly out and cool down
  const nEj = 2 + Math.round(m.size * 0.6);
  for (let j = 0; j < nEj; j++) {
    const rr = rnd(0.25, 0.45) + m.size * 0.03;
    const a = rnd(0, 6.28), sp = rnd(8, 14 + m.size);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(m.P.x + Math.cos(a), m.P.y + 1.5, m.P.z + Math.sin(a))
      .setLinvel(Math.cos(a) * sp, rnd(8, 16), Math.sin(a) * sp).setAngularDamping(0.5));
    const collider = world.createCollider(RAPIER.ColliderDesc.ball(rr).setDensity(3).setFriction(0.9).setRestitution(0.2), body);
    const obj = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0), new THREE.MeshStandardMaterial({ color: 0x2f241c, emissive: 0xff5a10, emissiveIntensity: 2, roughness: 0.9, flatShading: true }));
    addProp(body, collider, obj, { cool: 1, ttl: simTime + 14, trail: 1.2 });
  }
  // the rock itself remains as a heavy physical body
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(m.P.x - m.dir.x * m.r, m.P.y - m.dir.y * m.r + 0.1, m.P.z - m.dir.z * m.r)
    .setLinvel(m.dir.x * 28, m.dir.y * 28, m.dir.z * 28).setCcdEnabled(true).setAngularDamping(0.5));
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(m.r).setDensity(6).setFriction(0.9).setRestitution(0.1), body);
  const obj = new THREE.Mesh(new THREE.IcosahedronGeometry(m.r, 1), new THREE.MeshStandardMaterial({ color: 0x33271f, emissive: 0xff4a08, emissiveIntensity: 1.6, roughness: 0.95, flatShading: true }));
  obj.castShadow = true;
  addProp(body, collider, obj, { cool: 1 });
}
function updateMeteors(dt) {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    const ease = k * k * 0.35 + k * 0.65;
    m.mesh.position.lerpVectors(m.start, m.P, ease);
    m.mesh.rotation.x += dt * 5; m.mesh.rotation.y += dt * 3;
    const p = m.mesh.position;
    const n = 3 + Math.round(m.size * 0.4);
    for (let j = 0; j < n; j++) {
      const back = rnd(0, 1.5) * m.r;
      fire.emit(p.x - m.dir.x * back + rnd(-0.3, 0.3) * m.r, p.y - m.dir.y * back, p.z - m.dir.z * back + rnd(-0.3, 0.3) * m.r, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(0.25, 0.55), m.r * rnd(2.6, 4), 1, rnd(0.4, 0.7), 0.12, 1, -m.r * 2, 1);
      const g = rnd(0.2, 0.32);
      dust.emit(p.x, p.y, p.z, rnd(-0.5, 0.5), rnd(-0.2, 0.5), rnd(-0.5, 0.5), rnd(3, 6), m.r * rnd(1.8, 2.8), g, g - 0.01, g - 0.02, 0.6, 1.4 + m.size * 0.15, 0.5, -0.15);
    }
    if (Math.random() < 0.6) fire.emit(p.x, p.y, p.z, rnd(-6, 6), rnd(-3, 6), rnd(-6, 6), rnd(0.4, 0.9), rnd(0.2, 0.4), 1, 0.85, 0.5, 1, 0, 0.3, 4);
    for (let q = 0; q < 2; q++) sparks.emit(p.x, p.y, p.z, -m.dir.x * 15 + rnd(-6, 6), -m.dir.y * 15 + rnd(-3, 6), -m.dir.z * 15 + rnd(-6, 6), rnd(0.3, 0.8));
    flashLight.position.copy(p); flashLight.intensity = Math.max(flashLight.intensity, 400 + m.size * 120);
    if (m.mark) { const pr = 4 + m.size * 1.3; m.mark.scale.setScalar(pr * (1.4 - 0.6 * k) + Math.sin(m.t * 12) * 0.3); m.mark.material.opacity = 0.25 + 0.55 * k; }
    if (k >= 1) {
      if (m.mark) { scene.remove(m.mark); m.mark.material.dispose(); }
      scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.children[0].material.dispose();
      meteors.splice(i, 1);
      impactMeteor(m);
    }
  }
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt; const k = Math.min(1, e.t / e.dur);
    e.update(e, k);
    if (k >= 1) { e.end(); effects.splice(i, 1); }
  }
  shockVisual(dt);
  flashLight.intensity *= Math.exp(-dt * (gfx.enhanced ? 3.8 : 5.5));
  sparks.update(dt);
  if (flashLight.intensity < 1) flashLight.intensity = 0;
}
