/* ------------------------------------------------------------------ titans: two original giant creatures */
// BASALTO: a volcanic rock golem with glowing magma cracks and crystal spines. Punches, stomps, rips up boulders and throws them.
// VEX: a four-legged alien insectoid with bioluminescent spines and a stinger tail. Lands from orbit, whips its tail, fires a plasma beam.
// They are built from primitives and animated joint by joint; collisions with the city use a kinematic body each,
// so buildings are really pushed and broken (simplified physics, not a creature simulation). No gore: the loser crumbles or teleports away.
const TITAN_NAMES = { basalt: 'Basalto', vex: 'Vex' };
const titans = { mode: 'fight', fury: 6, dur: 60, list: [], phase: 'idle', t: 0, hud: null, winner: null };
const magmaTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffb060'; g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * 128, y = Math.random() * 128; g.lineWidth = 1 + Math.random() * 2.5; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += Math.random() * 30 - 15; y += Math.random() * 30 - 15; g.lineTo(x, y); } g.stroke();
  }
});
const rockTex = canvasTex(128, 128, (g) => { g.drawImage(noiseCanvas(128, 128, 5, 333), 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#5a4c44'; g.fillRect(0, 0, 128, 128); });
const chitinTex = canvasTex(128, 128, (g) => { g.drawImage(noiseCanvas(128, 128, 4, 444), 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#3d3460'; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(0,0,0,0.5)'; for (let y = 8; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + 4); g.stroke(); } });
const UPV = new THREE.Vector3(0, 1, 0);
function seg(a, b, th, mat) { // a box from point a to point b
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(th, len, th), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UPV, d.normalize()); m.castShadow = true;
  return m;
}
function glowMat(r, g, b) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }); }

function buildBasalt() {
  const rock = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x8a7a70, roughness: 0.95, flatShading: true, emissive: 0xff6a20, emissiveMap: magmaTex, emissiveIntensity: 1.6 });
  const crystal = glowMat(2.6, 1.0, 0.25);
  const M = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, rock); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
  const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = 11.5; root.add(hips);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group(); leg.position.set(s * 3.6, 0, 0); hips.add(leg);
    leg.add(M(new THREE.DodecahedronGeometry(1, 0), 0, -5.5, 0, 2.6, 6.4, 2.8));
    leg.add(M(new THREE.BoxGeometry(5.2, 1.9, 7.4), 0, -10.9, 1.1));
    return leg;
  });
  const torso = new THREE.Group(); hips.add(torso);
  torso.add(M(new THREE.DodecahedronGeometry(1, 0), 0, 6.5, 0, 7.2, 6.8, 4.8));
  torso.add(M(new THREE.DodecahedronGeometry(1, 0), 0, 1.2, 0.2, 5.2, 3.2, 4));
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4 + (i % 3), 5), crystal); c.position.set((i % 2 ? 1 : -1) * (1 + (i % 3)), 8 + i * 0.7, -4.3); c.rotation.x = -0.6; torso.add(c); }
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 8.2, 10, 0); torso.add(sh);
    sh.add(M(new THREE.IcosahedronGeometry(1, 0), 0, 0.4, 0, 3.6, 3.2, 3.6));
    sh.add(M(new THREE.DodecahedronGeometry(1, 0), 0, -6.2, 0, 2.4, 6.2, 2.4));
    sh.add(M(new THREE.IcosahedronGeometry(3.3, 0), 0, -12.6, 0.4));
    return sh;
  });
  const head = new THREE.Group(); head.position.set(0, 13.2, 1.8); torso.add(head);
  head.add(M(new THREE.DodecahedronGeometry(1, 0), 0, 0, 0, 2.8, 2.4, 2.8));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.4), crystal); e.position.set(s * 1.1, 0.3, 2.5); head.add(e); }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, hips, legs, torso, arms, head, mats: [rock], height: 27, reach: 15, radius: 6.5, speed: 4.2, colY: 13, colR: 5.5, colH: 7 };
}
function buildVex() {
  const chitin = new THREE.MeshStandardMaterial({ map: chitinTex, color: 0x9a8fc8, roughness: 0.35, metalness: 0.45, emissive: 0x20d8ff, emissiveIntensity: 0 });
  const glow = glowMat(0.25, 2.2, 3.0);
  const M = (geo, x, y, z, sx = 1, sy = 1, sz = 1, mat = chitin) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
  const root = new THREE.Group(), body = new THREE.Group(); body.position.y = 13; root.add(body);
  body.add(M(new THREE.SphereGeometry(1, 16, 10), 0, 0, -2, 5, 4.2, 10));
  body.add(M(new THREE.SphereGeometry(1, 14, 10), 0, 1, 7.5, 4.4, 4.2, 4.6));
  for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4 - i * 0.25, 5), glow); c.position.set(0, 4 - i * 0.15, 6 - i * 2.4); c.rotation.x = -0.5; body.add(c); }
  const head = new THREE.Group(); head.position.set(0, 1.6, 12); body.add(head);
  const skull = M(new THREE.ConeGeometry(2.6, 7, 6), 0, 0, 2.4); skull.rotation.x = Math.PI / 2; head.add(skull);
  for (const [x, y] of [[-1.1, 0.9], [1.1, 0.9], [-0.7, 1.6], [0.7, 1.6]]) head.add(M(new THREE.SphereGeometry(0.42, 8, 6), x, y, 1.6, 1, 1, 1, glow));
  const mand = [-1, 1].map((s) => { const m = M(new THREE.ConeGeometry(0.5, 4, 5), s * 1.5, -1.3, 4.2); m.rotation.x = Math.PI / 2; m.rotation.z = s * 0.4; head.add(m); return m; });
  const legs = [];
  for (const [sx, sz, ph] of [[-1, 5, 0], [1, 5, Math.PI], [-1, -6, Math.PI], [1, -6, 0]]) {
    const leg = new THREE.Group(); leg.position.set(sx * 4, 0, sz); body.add(leg);
    const knee = new THREE.Vector3(sx * 7, 6, sz * 0.15), tip = new THREE.Vector3(sx * 11, -13, sz * 0.25);
    leg.add(seg(new THREE.Vector3(0, 0, 0), knee, 1.7, chitin), seg(knee, tip, 1.3, chitin));
    const claw = M(new THREE.ConeGeometry(0.7, 2.2, 5), tip.x, tip.y + 0.6, tip.z); claw.rotation.x = Math.PI; leg.add(claw);
    leg.userData = { tip: tip.clone(), ph, sx };
    legs.push(leg);
  }
  const tail = []; let parent = body, off = new THREE.Vector3(0, 1.2, -11.5);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group(); s.position.copy(off); parent.add(s);
    s.add(M(new THREE.SphereGeometry(1, 10, 8), 0, 0, -1.4, 2.3 - i * 0.28, 2.0 - i * 0.24, 2.4 - i * 0.2));
    tail.push(s); parent = s; off = new THREE.Vector3(0, 0.9, -3);
  }
  const sting = M(new THREE.ConeGeometry(0.8, 3.6, 6), 0, 0.4, -3.6, 1, 1, 1, glow); sting.rotation.x = -Math.PI / 2; parent.add(sting);
  return { root, body, head, legs, tail, mand, mats: [chitin], glow, height: 22, reach: 17, radius: 8, speed: 6.2, colY: 13, colR: 7.5, colH: 0 };
}

class Titan {
  constructor(kind, x, z, yaw) {
    this.kind = kind; this.name = TITAN_NAMES[kind];
    Object.assign(this, kind === 'basalt' ? buildBasalt() : buildVex());
    this.pos = new THREE.Vector3(x, 0, z); this.yaw = yaw; this.hp = 100; this.state = 'emerge'; this.t = 0;
    this.ph = 0; this.walkAmt = 0; this.kb = new THREE.Vector3(); this.cdM = 2; this.cdR = 4; this.goal = null; this.flash = 0;
    this.root.position.copy(this.pos); this.root.rotation.y = yaw;
    if (kind === 'basalt') this.root.position.y = -this.height; else this.root.position.y = 140;
    scene.add(this.root);
    const bd = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, this.colY + (kind === 'basalt' ? -this.height : 140), z);
    this.rb = world.createRigidBody(bd);
    world.createCollider(this.colH ? RAPIER.ColliderDesc.capsule(this.colH, this.colR) : RAPIER.ColliderDesc.ball(this.colR), this.rb);
    this.threat = addThreat('titan', x, z, 60, 9999, { follow: () => this.pos });
    this.lastStep = [0, 0, 0, 0];
  }
  get fwd() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  world(local) { return this.root.localToWorld(local.clone()); }
  hit(dmg, dir) {
    if (this.state === 'down' || this.state === 'gone' || this.state === 'emerge') return;
    this.hp = Math.max(0, this.hp - dmg); this.flash = 1;
    this.kb.copy(dir).setY(0).normalize().multiplyScalar(10 + dmg * 0.6);
    if (this.hp <= 0) { this.state = 'down'; this.t = 0; Sfx.roar(this.kind, 1.2, soundDelay(this.pos)); toast(`${this.name} cae…`); return; }
    if (this.state !== 'attackR' || dmg > 8) { this.state = 'stagger'; this.t = 0; }
    if (Math.random() < 0.5) Sfx.roar(this.kind, 0.6, soundDelay(this.pos));
  }
  remove() {
    scene.remove(this.root);
    if (this.rb && world) { try { world.removeRigidBody(this.rb); } catch (e) {} }
    this.rb = null;
    if (this.threat) this.threat.until = simTime + 3;
    if (this.beam) { scene.remove(this.beam); this.beam = null; }
  }
}

/* ground slam / footstep: breaks what is right under it and shoves what is around */
function stomp(x, z, r, power, y = 0) {
  const P = new THREE.Vector3(x, y, z);
  let n = 0;
  for (const it of dynItems()) {
    if (it.dead) continue;
    const t = it.body.translation(), d = Math.hypot(t.x - x, t.z - z);
    if (d > r * 1.9 || Math.abs(t.y - y) > 8) continue;
    if (it.kind === 'block' && d < r && n++ < 4) fragment(it, P, 3 + power * 0.6);
    else pushBody(it.body, t.x - x, 1 + Math.abs(t.y - y), t.z - z, Math.max(0.5, d), power * 0.55 * (1 - d / (r * 1.9)) * (it.kind === 'block' ? 0.6 : 1));
  }
  for (let i = 0; i < 10 + power * 2; i++) { const a = rnd(0, 6.28), g = rnd(0.45, 0.58); dust.emit(x + Math.cos(a) * r * 0.6, y + 0.5, z + Math.sin(a) * r * 0.6, Math.cos(a) * rnd(3, 6), rnd(0.5, 2.5), Math.sin(a) * rnd(3, 6), rnd(2, 4), rnd(2.5, 4.5), g + 0.05, g + 0.03, g, 0.7, 1.6, 1); }
  addShake(0.12 + power * 0.04, P);
  Sfx.boom(0.12 + power * 0.03, soundDelay(P));
  impactAt(x, z, r * 0.7, r * 3);
  if (power >= 6) damageAround(P, r * 1.6, 0.4);
}
// a straight beam of plasma: breaks pieces along its path and explodes where it lands
function beamDamage(a, b) {
  let n = 0;
  const ab = new THREE.Vector3().subVectors(b, a), L2 = ab.lengthSq();
  for (const it of allBlocks()) {
    if (n >= 2) break;
    const t = it.body.translation(); tmpV.set(t.x - a.x, t.y - a.y, t.z - a.z);
    const k = THREE.MathUtils.clamp(tmpV.dot(ab) / L2, 0, 1);
    tmpV.set(a.x + ab.x * k - t.x, a.y + ab.y * k - t.y, a.z + ab.z * k - t.z);
    if (tmpV.lengthSq() < 4 && Math.random() < 0.5) { fragment(it, b, 6); n++; }
  }
}

function startTitans(P) {
  if (titans.list.length) { toast('Ya hay titanes en la ciudad'); return; }
  const m = titans.mode;
  titans.phase = 'on'; titans.t = 0; titans.winner = null; titans.winT = 0;
  const a = rnd(0, Math.PI * 2), d = m === 'fight' ? 22 : 0;
  if (m === 'fight' || m === 'basalt') titans.list.push(new Titan('basalt', P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, a + Math.PI));
  if (m === 'fight' || m === 'vex') titans.list.push(new Titan('vex', P.x - Math.cos(a) * d, P.z - Math.sin(a) * d, a));
  const [A, B] = titans.list;
  if (A && B) { A.foe = B; B.foe = A; if (B.kind === 'vex') B.t = -1.6; }   // Vex lands a moment later
  sirenUntil = simTime + 40;
  setTimeout(() => dispatchEmergency(P.x, P.z), 6000);
  toast(m === 'fight' ? '¡Combate de titanes!' : `${TITAN_NAMES[m]} arrasa la ciudad`);
  showTitanHud(true); refreshRunning();
}
function retreatTitans() { for (const T of titans.list) if (T.state !== 'down' && T.state !== 'gone') { T.state = 'leave'; T.t = 0; } titans.phase = 'leaving'; refreshRunning(); }
function clearTitans() { for (const T of titans.list) T.remove(); titans.list.length = 0; titans.phase = 'idle'; showTitanHud(false); Sfx.beam(0); }

function titansStep(dt) {
  for (const T of titans.list) {
    if (!T.rb) continue;
    T.rb.setNextKinematicTranslation({ x: T.root.position.x, y: T.root.position.y + T.colY, z: T.root.position.z });
    // plough through buildings while walking or being knocked back
    if ((T.state === 'walk' || T.state === 'stagger' || T.walkAmt > 0.3) && T.root.position.y > -2) {
      let n = 0;
      for (const it of allBlocks()) {
        const t = it.body.translation(), d = Math.hypot(t.x - T.pos.x, t.z - T.pos.z);
        if (d < T.radius + 1.2 && t.y < T.height * 0.9 && Math.random() < 0.08 && n++ < 2) fragment(it, T.pos, 4 + T.kb.length() * 0.3);
      }
    }
  }
}

function titansUpdate(dt) {
  if (!titans.list.length) return;
  titans.t += dt;
  for (const T of titans.list) updateTitan(T, dt);
  // fight over → winner roars, then everyone leaves
  const alive = titans.list.filter((T) => T.state !== 'gone' && T.state !== 'down');
  if (titans.phase === 'on' && titans.list.length === 2 && alive.length === 1 && !titans.winner) {
    titans.winner = alive[0]; titans.winner.state = 'roar'; titans.winner.t = 0; Sfx.roar(titans.winner.kind, 1.3, soundDelay(titans.winner.pos));
    toast(`¡Ganó ${titans.winner.name}!`);
  }
  if (titans.phase === 'on' && titans.list.length === 1 && titans.t > titans.dur) retreatTitans();
  if (titans.phase === 'on' && titans.winner) { titans.winT = (titans.winT || 0) + dt; if (titans.winT > 9) { titans.winT = 0; retreatTitans(); } }
  if (titans.list.every((T) => T.state === 'gone')) { clearTitans(); refreshRunning(); }
  updateTitanHud();
  Sfx.beam(titans.list.some((T) => T.beam && T.beam.visible) ? 1 : 0);
}

function faceTo(T, x, z, dt, rate = 2.5) {
  const want = Math.atan2(x - T.pos.x, z - T.pos.z);
  T.yaw += Math.atan2(Math.sin(want - T.yaw), Math.cos(want - T.yaw)) * Math.min(1, dt * rate);
}
function updateTitan(T, dt) {
  T.t += dt;
  const fury = titans.fury, foe = T.foe && T.foe.state !== 'gone' && T.foe.state !== 'down' ? T.foe : null;
  T.flash *= Math.exp(-dt * 6);
  // an interrupted ranged attack must not leave its beam or boulder behind
  if (T.state !== 'attackR') {
    if (T.beam && T.beam.visible) { T.beam.visible = false; if (T.glow) T.glow.color.setRGB(0.25, 2.2, 3.0); }
    if (T.rock && !T.thrown) { scene.remove(T.rock); T.rock = null; }
    T.thrown = false;
  }
  if (T.state !== 'attackM') T.struck = false;
  for (const m of T.mats) m.emissiveIntensity = (T.kind === 'basalt' ? 1.6 : 0) + T.flash * 2;
  let moving = false;
  switch (T.state) {
    case 'emerge': {
      if (T.kind === 'basalt') {
        const k = Math.min(1, Math.max(0, T.t) / 3.2);
        T.root.position.y = -T.height * (1 - k * (2 - k));
        addShake(0.08, T.pos); Sfx.rumble(0.8);
        if (Math.random() < 0.8) { const a = rnd(0, 6.28), r = rnd(3, 11); dust.emit(T.pos.x + Math.cos(a) * r, 0.5, T.pos.z + Math.sin(a) * r, Math.cos(a) * 3, rnd(2, 6), Math.sin(a) * 3, rnd(2, 4), rnd(3, 5), 0.42, 0.38, 0.33, 0.75, 1.6, 0.8); }
        if (T.t > 0.1 && T.t < 0.2) stomp(T.pos.x, T.pos.z, 9, 7);
        if (k >= 1) { T.state = 'roar'; T.t = 0; Sfx.roar('basalt', 1, soundDelay(T.pos)); }
      } else {
        if (T.t < 0) { T.root.visible = false; break; }
        T.root.visible = true;
        const k = Math.min(1, T.t / 1.4);
        T.root.position.y = 140 * (1 - k) * (1 - k);
        for (let i = 0; i < 3; i++) fire.emit(T.pos.x + rnd(-3, 3), T.root.position.y + 14, T.pos.z + rnd(-3, 3), rnd(-2, 2), rnd(6, 14), rnd(-2, 2), rnd(0.3, 0.6), rnd(3, 5), 0.4, 0.9, 1, 1, 0, 0.3, 0);
        if (k >= 1) { blast(new THREE.Vector3(T.pos.x, 0.5, T.pos.z), 8, 12, { noFire: true }); T.state = 'roar'; T.t = 0; Sfx.roar('vex', 1, soundDelay(T.pos)); }
      }
      break;
    }
    case 'roar': {
      if (T.t > 2.2) T.state = 'idle';
      break;
    }
    case 'idle': case 'walk': {
      T.cdM -= dt * (0.6 + fury * 0.08); T.cdR -= dt * (0.6 + fury * 0.08);
      let tx, tz;
      if (foe) { tx = foe.pos.x; tz = foe.pos.z; }
      else {
        if (!T.goal || Math.hypot(T.goal.x - T.pos.x, T.goal.z - T.pos.z) < T.reach * 0.7) {
          const bl = allBlocks(); const b = bl.length ? bl[Math.floor(Math.random() * bl.length)].body.translation() : { x: rnd(-60, 40), z: rnd(-30, 30) };
          T.goal = new THREE.Vector3(b.x, 0, b.z);
        }
        tx = T.goal.x; tz = T.goal.z;
      }
      faceTo(T, tx, tz, dt);
      const d = Math.hypot(tx - T.pos.x, tz - T.pos.z);
      if (foe && d < T.reach + foe.radius * 0.6 && T.cdM <= 0) { T.state = 'attackM'; T.t = 0; T.cdM = rnd(2.5, 4.5); break; }
      if (foe && d > 24 && d < 90 && T.cdR <= 0) { T.state = 'attackR'; T.t = 0; T.cdR = rnd(6, 10); break; }
      if (!foe && d < T.reach + 2 && T.cdM <= 0) { T.state = 'attackM'; T.t = 0; T.cdM = rnd(1.5, 3); break; }
      if (!foe && T.cdR <= 0 && Math.random() < 0.01) { T.state = 'attackR'; T.t = 0; T.cdR = rnd(8, 12); T.target = T.goal.clone().setY(6); break; }
      if (d > (foe ? T.reach * 0.85 + foe.radius * 0.4 : T.reach * 0.6)) { moving = true; T.state = 'walk'; T.pos.addScaledVector(T.fwd, T.speed * (0.8 + fury * 0.04) * dt); }
      else T.state = 'idle';
      break;
    }
    case 'attackM': attackMelee(T, foe, dt); break;
    case 'attackR': attackRanged(T, foe, dt); break;
    case 'stagger': {
      if (T.t > 0.7) T.state = 'idle';
      break;
    }
    case 'down': {
      const k = Math.min(1, T.t / 1.5);
      if (T.kind === 'basalt') { T.root.rotation.x = -k * k * 1.35; T.hips.position.y = 11.5 - k * 4; }
      else { T.body.position.y = 13 - k * k * 10; for (const L of T.legs) L.rotation.z = L.userData.sx * k * 0.5; }
      if (T.t > 1.5 && !T.landed) { T.landed = true; const p = T.world(new THREE.Vector3(0, 0, T.kind === 'basalt' ? -12 : 0)); stomp(p.x, p.z, 13, 10); for (let i = 0; i < 40; i++) dust.emit(p.x + rnd(-8, 8), 1, p.z + rnd(-8, 8), rnd(-5, 5), rnd(1, 6), rnd(-5, 5), rnd(4, 8), rnd(5, 8), 0.52, 0.48, 0.42, 0.8, 2, 0.6); }
      if (T.t > 4.5) vanish(T);
      break;
    }
    case 'leave': {
      if (T.kind === 'basalt') { T.root.position.y -= dt * 6; addShake(0.05, T.pos); if (Math.random() < 0.6) dust.emit(T.pos.x + rnd(-7, 7), 0.5, T.pos.z + rnd(-7, 7), 0, rnd(2, 5), 0, rnd(2, 4), rnd(3, 5), 0.42, 0.38, 0.33, 0.7, 1.4, 0.8); }
      else { T.root.position.y += dt * (8 + T.t * 18); fire.emit(T.pos.x, T.root.position.y + 10, T.pos.z, rnd(-1, 1), -rnd(6, 12), rnd(-1, 1), 0.5, rnd(3, 5), 0.3, 0.9, 1, 1, 0, 0.2, 0); }
      if (T.t > 4.5) { T.state = 'gone'; T.remove(); }
      break;
    }
  }
  // knockback slides the titan back through whatever is behind it
  if (T.kb.lengthSq() > 0.01) { T.pos.addScaledVector(T.kb, dt); T.kb.multiplyScalar(Math.exp(-dt * 3)); }
  T.pos.x = THREE.MathUtils.clamp(T.pos.x, -85, 95); T.pos.z = THREE.MathUtils.clamp(T.pos.z, -55, 50);
  T.root.position.x = T.pos.x; T.root.position.z = T.pos.z;
  if (T.state !== 'down') T.root.rotation.y = T.yaw;
  if (T.state !== 'gone' && T.state !== 'emerge' && T.state !== 'leave') T.root.position.y += (0 - T.root.position.y) * Math.min(1, dt * 4);
  animateTitan(T, dt, moving);
}

function animateTitan(T, dt, moving) {
  T.walkAmt += ((moving ? 1 : 0) - T.walkAmt) * Math.min(1, dt * 4);
  T.ph += dt * (T.kind === 'basalt' ? 3.0 : 4.2) * (0.3 + T.walkAmt);
  const w = T.walkAmt, s = Math.sin(T.ph);
  const staggerK = T.state === 'stagger' ? Math.sin(Math.min(1, T.t / 0.7) * Math.PI) : 0;
  if (T.kind === 'basalt') {
    T.legs[0].rotation.x = s * 0.5 * w; T.legs[1].rotation.x = -s * 0.5 * w;
    T.hips.position.y = 11.5 + Math.abs(Math.cos(T.ph)) * 0.6 * w;
    T.torso.rotation.z = s * 0.06 * w; T.torso.rotation.x = 0.12 - staggerK * 0.35 + (T.state === 'roar' ? -0.25 * Math.sin(Math.min(1, T.t / 2) * Math.PI) : 0);
    T.head.rotation.x = T.state === 'roar' ? -0.6 * Math.sin(Math.min(1, T.t / 2) * Math.PI) : 0;
    if (T.state !== 'attackM' && T.state !== 'attackR') { T.arms[0].rotation.x = -s * 0.35 * w; T.arms[1].rotation.x = s * 0.35 * w; T.arms[0].rotation.z = -0.15; T.arms[1].rotation.z = 0.15; }
    // footsteps: a stomp each time a foot comes down
    for (let i = 0; i < 2; i++) {
      const v = i ? -s : s;
      if (w > 0.4 && T.lastStep[i] > 0 && v <= 0) { const p = T.world(new THREE.Vector3(i ? 3.6 : -3.6, 0, 2)); stomp(p.x, p.z, 3.5, 4 + titans.fury * 0.2); }
      T.lastStep[i] = v;
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const L = T.legs[i], v = Math.sin(T.ph + L.userData.ph);
      L.rotation.y = v * 0.32 * w; L.rotation.x = Math.max(0, Math.cos(T.ph + L.userData.ph)) * 0.18 * w;
      if (w > 0.4 && T.lastStep[i] > 0 && v <= 0) { const p = T.world(L.userData.tip.clone().add(L.position).add(T.body.position)); stomp(p.x, p.z, 2.6, 3 + titans.fury * 0.15); }
      T.lastStep[i] = v;
    }
    T.body.position.y = (T.state === 'down' ? T.body.position.y : 13 + Math.sin(T.ph * 2) * 0.35 * w);
    T.body.rotation.x = -staggerK * 0.25 + (T.state === 'roar' ? -0.3 * Math.sin(Math.min(1, T.t / 2) * Math.PI) : 0);
    T.head.rotation.y = Math.sin(pedTime.value * 1.3) * 0.15;
    for (const m of T.mand) m.rotation.y = (T.state === 'roar' ? 0.5 : 0.1) * Math.sin(pedTime.value * 9);
    if (T.state !== 'attackM') T.tail.forEach((sgm, i) => { sgm.rotation.y = Math.sin(pedTime.value * 1.5 - i * 0.6) * 0.18; sgm.rotation.x = -0.12; });
  }
}

function attackMelee(T, foe, dt) {
  const t = T.t;
  if (foe) faceTo(T, foe.pos.x, foe.pos.z, dt, 4);
  if (T.kind === 'basalt') {
    const arm = T.arms[1];
    if (t < 0.6) arm.rotation.x = -t / 0.6 * 2.6;                                     // wind up, fist over the shoulder
    else if (t < 0.85) arm.rotation.x = -2.6 + (t - 0.6) / 0.25 * 3.8;                // swing down
    else arm.rotation.x += (0 - arm.rotation.x) * Math.min(1, dt * 4);
    if (t >= 0.78 && !T.struck) {
      T.struck = true;
      const fist = T.world(new THREE.Vector3(0, 0, 0)).add(T.fwd.multiplyScalar(T.reach * 0.9));
      if (foe && Math.hypot(foe.pos.x - fist.x, foe.pos.z - fist.z) < foe.radius + 6) {
        foe.hit(10 + titans.fury * 0.9, T.fwd);
        const hp = foe.pos.clone().setY(foe.height * 0.55);
        for (let i = 0; i < 40; i++) sparks.emit(hp.x, hp.y, hp.z, rnd(-14, 14), rnd(-4, 14), rnd(-14, 14), rnd(0.4, 1.2));
        for (let i = 0; i < 14; i++) dust.emit(hp.x, hp.y, hp.z, rnd(-6, 6), rnd(-2, 6), rnd(-6, 6), rnd(1.5, 3), rnd(3, 5), 0.35, 0.32, 0.3, 0.7, 1.5, 0.8);
        addShake(0.6, hp); Sfx.boom(0.6, soundDelay(hp));
      } else stomp(fist.x, fist.z, 6, 9);                                            // fist slams the street / a building
    }
    if (t > 1.6) { T.state = 'idle'; T.struck = false; }
  } else {
    // tail whip around the body
    const k = t < 0.55 ? -t / 0.55 : t < 0.85 ? -1 + (t - 0.55) / 0.3 * 2.4 : 1.4 * Math.max(0, 1 - (t - 0.85) / 0.6);
    T.tail.forEach((sgm, i) => { sgm.rotation.y = k * (0.35 + i * 0.05); sgm.rotation.x = 0.1 + Math.abs(k) * 0.15; });
    T.yaw += (t > 0.55 && t < 0.85 ? 4.5 : 0) * dt;
    if (t >= 0.75 && !T.struck) {
      T.struck = true;
      const tip = T.world(new THREE.Vector3(0, 13, -20));
      if (foe && Math.hypot(foe.pos.x - T.pos.x, foe.pos.z - T.pos.z) < T.reach + foe.radius + 6) {
        foe.hit(8 + titans.fury * 0.8, new THREE.Vector3(foe.pos.x - T.pos.x, 0, foe.pos.z - T.pos.z));
        const hp = foe.pos.clone().setY(foe.height * 0.5);
        for (let i = 0; i < 35; i++) sparks.emit(hp.x, hp.y, hp.z, rnd(-12, 12), rnd(-3, 12), rnd(-12, 12), rnd(0.4, 1));
        addShake(0.5, hp); Sfx.boom(0.5, soundDelay(hp));
      } else stomp(tip.x, tip.z, 5, 8, 0);
    }
    if (t > 1.5) { T.state = 'idle'; T.struck = false; }
  }
}

const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const beamCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 3.2), transparent: true, opacity: 1, depthWrite: false, fog: false });
function attackRanged(T, foe, dt) {
  const t = T.t;
  const aim = foe ? foe.pos.clone().setY(foe.height * 0.55) : (T.target || T.pos.clone().add(T.fwd.multiplyScalar(30)).setY(5));
  faceTo(T, aim.x, aim.z, dt, 3);
  if (T.kind === 'basalt') {
    // rip a boulder out of the street and hurl it
    const a0 = T.arms[0], a1 = T.arms[1];
    if (t < 0.7) { a0.rotation.x = a1.rotation.x = t / 0.7 * 0.9; T.torso.rotation.x = 0.12 + t / 0.7 * 0.5; if (t < 0.1) stomp(T.world(new THREE.Vector3(0, 0, 8)).x, T.world(new THREE.Vector3(0, 0, 8)).z, 4, 6); }
    else if (t < 1.3) { const k = (t - 0.7) / 0.6; a0.rotation.x = a1.rotation.x = 0.9 - k * 3.9; T.torso.rotation.x = 0.62 - k * 0.8; }
    else { a0.rotation.x += (0 - a0.rotation.x) * Math.min(1, dt * 3); a1.rotation.x = a0.rotation.x; }
    if (t > 0.7 && !T.rock) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), T.mats[0]); m.castShadow = true; scene.add(m); T.rock = m;
    }
    if (T.rock && !T.thrown) T.rock.position.copy(T.world(new THREE.Vector3(0, 27, 0)));
    if (t > 1.3 && T.rock && !T.thrown) {
      T.thrown = true;
      const from = T.rock.position.clone(), flight = 1.3;
      const v = new THREE.Vector3((aim.x - from.x) / flight, (aim.y - from.y) / flight + 0.5 * 9.81 * flight, (aim.z - from.z) / flight);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(from.x, from.y, from.z).setLinvel(v.x, v.y, v.z).setAngvel({ x: 2, y: 1, z: 3 }).setCcdEnabled(true));
      const collider = world.createCollider(RAPIER.ColliderDesc.ball(2.4).setDensity(2.5), body);
      scene.remove(T.rock);
      const item = addProp(body, collider, T.rock, { ttl: simTime + 12, trail: 2, boulder: { from: T, armed: simTime + 0.3, lastV: v.length() } });
      titanRocks.push(item); T.rock = null;
    }
    if (t > 2.1) { T.state = 'idle'; T.thrown = false; T.target = null; }
  } else {
    // plasma beam: charge, fire, sweep
    T.glow.color.setRGB(0.25 + (t < 0.9 ? t : 1) * 2, 2.2 + (t < 0.9 ? t : 1) * 2, 3 + (t < 0.9 ? t : 1));
    const mouth = T.world(T.head.position.clone().add(T.body.position).add(new THREE.Vector3(0, 0, 6)));
    if (t < 0.9) { for (let i = 0; i < 3; i++) { const p = mouth.clone().add(new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6))); fire.emit(p.x, p.y, p.z, (mouth.x - p.x) * 3, (mouth.y - p.y) * 3, (mouth.z - p.z) * 3, 0.3, rnd(0.8, 1.5), 0.3, 0.9, 1, 1, -1, 0, 0); } }
    else if (t < 2.5) {
      if (!T.beam) { T.beam = new THREE.Group(); const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5); T.beam.add(new THREE.Mesh(g, beamMat), new THREE.Mesh(g, beamCore)); T.beam.children[1].scale.set(0.35, 0.35, 1); scene.add(T.beam); }
      const sweep = Math.sin((t - 0.9) * 3) * 5;
      const end = aim.clone().add(new THREE.Vector3(Math.cos(T.yaw) * sweep, 0, -Math.sin(T.yaw) * sweep));
      const len = mouth.distanceTo(end);
      T.beam.visible = true; T.beam.position.copy(mouth); T.beam.lookAt(end); T.beam.scale.set(1.1 + Math.sin(pedTime.value * 40) * 0.2, 1.1, len);
      flashLight.position.copy(end); flashLight.color.setHex(0x60e0ff); flashLight.intensity = Math.max(flashLight.intensity, 1800);
      T.beamT = (T.beamT || 0) - dt;
      if (T.beamT <= 0) {
        T.beamT = 0.16;
        for (let i = 0; i < 6; i++) sparks.emit(end.x, end.y, end.z, rnd(-10, 10), rnd(0, 12), rnd(-10, 10), rnd(0.3, 0.8));
        for (let i = 0; i < 3; i++) fire.emit(end.x, end.y, end.z, rnd(-3, 3), rnd(0, 4), rnd(-3, 3), rnd(0.3, 0.6), rnd(2, 4), 0.4, 0.95, 1, 1, 2, 1, 0);
        if (foe && Math.hypot(foe.pos.x - end.x, foe.pos.z - end.z) < foe.radius + 4) foe.hit(2 + titans.fury * 0.25, new THREE.Vector3(end.x - T.pos.x, 0, end.z - T.pos.z));
        else if (Math.random() < 0.35) blast(end, 3.5, 4.5, { noCrater: end.y > 2, noFire: true });
        beamDamage(mouth, end);
        addShake(0.08, end);
      }
    } else { if (T.beam) T.beam.visible = false; T.glow.color.setRGB(0.25, 2.2, 3.0); }
    if (t > 3) { T.state = 'idle'; T.target = null; }
  }
}
const titanRocks = [];
function titanRocksUpdate() {
  for (let i = titanRocks.length - 1; i >= 0; i--) {
    const it = titanRocks[i];
    if (it.dead || !it.boulder) { titanRocks.splice(i, 1); continue; }
    const t = it.body.translation(), lv = it.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), b = it.boulder;
    for (const T of titans.list) {
      if (T === b.from || T.state === 'gone' || T.state === 'down') continue;
      if (Math.hypot(T.pos.x - t.x, T.pos.z - t.z) < T.radius + 2.5 && t.y < T.height + 2) {
        T.hit(14 + titans.fury, new THREE.Vector3(lv.x, 0, lv.z));
        blast(new THREE.Vector3(t.x, t.y, t.z), 5, 6, { noCrater: true, noFire: true }); it.boulder = null; break;
      }
    }
    if (it.boulder && simTime > b.armed && sp < b.lastV * 0.55) { blast(new THREE.Vector3(t.x, t.y, t.z), 6, 7, { noFire: true, noCrater: t.y > 2 }); it.boulder = null; }
    if (it.boulder) b.lastV = sp;
  }
}
function vanish(T) {
  const p = T.pos.clone();
  if (T.kind === 'basalt') {
    // crumbles into a pile of real rock debris
    for (let i = 0; i < 14; i++) {
      const s = rnd(1.2, 2.6);
      addDebris(new THREE.Vector3(p.x + rnd(-8, 8), rnd(2, 12), p.z + rnd(-8, 8)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 3), rnd(0, 3), 0)), s, s * rnd(0.6, 1), s, new THREE.Color(0x4a403a), { x: rnd(-4, 4), y: rnd(0, 5), z: rnd(-4, 4) }, { x: rnd(-2, 2), y: rnd(-2, 2), z: rnd(-2, 2) });
    }
    for (let i = 0; i < 40; i++) dust.emit(p.x + rnd(-9, 9), rnd(1, 12), p.z + rnd(-9, 9), rnd(-3, 3), rnd(0, 3), rnd(-3, 3), rnd(4, 8), rnd(5, 8), 0.4, 0.36, 0.32, 0.85, 1.8, 0.4);
    addFire(p, 14, 1.2);
  } else {
    // the alien is pulled back by its ship: a cyan flash and it is gone
    skyFlash = Math.max(skyFlash, 0.6);
    for (let i = 0; i < 60; i++) sparks.emit(p.x, 8, p.z, rnd(-18, 18), rnd(0, 25), rnd(-18, 18), rnd(0.5, 1.5));
    for (let i = 0; i < 25; i++) fire.emit(p.x + rnd(-6, 6), rnd(2, 14), p.z + rnd(-6, 6), 0, rnd(5, 15), 0, rnd(0.6, 1.2), rnd(3, 6), 0.3, 0.9, 1, 1, 1, 0.3, 0);
  }
  T.state = 'gone'; T.remove();
}

/* health bars */
function showTitanHud(on) {
  const el = $('#titan-hud'); el.hidden = !on;
  if (on) el.innerHTML = titans.list.map((T) => `<div class="tb ${T.kind}"><span>${T.name}</span><i><b data-k="${T.kind}"></b></i></div>`).join('');
}
function updateTitanHud() {
  for (const T of titans.list) { const b = document.querySelector(`#titan-hud b[data-k="${T.kind}"]`); if (b) b.style.width = T.hp + '%'; }
}

/* titan voices: a deep stony growl and a buzzing alien screech, plus the plasma hum */
Sfx.roar = function (kind, s = 1, delay = 0) {
  if (!this.ok()) return;
  const c = this.ctx, t = c.currentTime + delay, dur = kind === 'basalt' ? 2.2 : 1.6;
  const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  if (kind === 'basalt') { o.type = 'sawtooth'; o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + dur); f.type = 'lowpass'; f.frequency.setValueAtTime(240, t); f.frequency.linearRampToValueAtTime(520, t + dur * 0.4); f.frequency.linearRampToValueAtTime(180, t + dur); }
  else { o.type = 'square'; o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(620, t + dur * 0.35); o.frequency.linearRampToValueAtTime(190, t + dur); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 22; lg.gain.value = 45; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * s, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.1);
  const n = this.noiseSrc(t, dur), nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = kind === 'basalt' ? 'lowpass' : 'highpass'; nf.frequency.value = kind === 'basalt' ? 300 : 2500;
  ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35 * s, t + 0.2); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(nf); nf.connect(ng); ng.connect(this.master);
};
Sfx.beam = function (level) {
  if (!this.ctx) return;
  if (!this.beamGain) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 110; o2.type = 'sine'; o2.frequency.value = 333; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.5; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o.start(); o2.start(); this.beamGain = g;
  }
  this.beamGain.gain.setTargetAtTime(settings.sound ? level * 0.12 : 0, this.ctx.currentTime, 0.08);
};
