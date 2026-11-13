/* ------------------------------------------------------------------ titans: two original giant creatures, choreographed brawl */
// BASALTO: volcanic rock golem (magma cracks, crystal spines). Boxer: jab-cross-uppercut, haymaker, hammer slam,
//          shoulder charge, grab-and-throw, guard, a magma blade when cornered, and boulders from the street.
// VEX: four-legged alien insectoid (bioluminescent spines, stinger tail). Claw combos, scorpion tail stab, pounce,
//          tail wrap-and-slam, side dodges and a plasma beam.
// Every joint is driven by a damped spring toward its pose, so moves have anticipation, inertia and follow-through.
// Bodies are kinematic colliders that really push and break the city (simplified physics). No gore: the loser crumbles or is beamed away.
const TITAN_NAMES = { basalt: 'Basalto', vex: 'Vex' };
const titans = { mode: 'fight', fury: 6, dur: 60, list: [], phase: 'idle', t: 0, winner: null, winT: 0, cine: true };
const cine = { hitStop: 0, slow: 0, kick: 0, theta: 0, dir: 1 };
function cineScale(realDt) {
  let k = 1;
  if (cine.hitStop > 0) { cine.hitStop -= realDt; k *= 0.06; }
  if (cine.slow > 0) { cine.slow -= realDt; k *= 0.3; }
  return k;
}
const magmaTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ffb060'; g.lineCap = 'round';
  for (let i = 0; i < 14; i++) { let x = Math.random() * 128, y = Math.random() * 128; g.lineWidth = 1 + Math.random() * 2.5; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.random() * 30 - 15; y += Math.random() * 30 - 15; g.lineTo(x, y); } g.stroke(); }
});
const rockTex = canvasTex(128, 128, (g) => { g.drawImage(noiseCanvas(128, 128, 5, 333), 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#5a4c44'; g.fillRect(0, 0, 128, 128); });
const chitinTex = canvasTex(128, 128, (g) => { g.drawImage(noiseCanvas(128, 128, 4, 444), 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#3d3460'; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(0,0,0,0.5)'; for (let y = 8; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + 4); g.stroke(); } });
const UPV = new THREE.Vector3(0, 1, 0);
function seg(a, b, th, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(th, len, th), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UPV, d.normalize()); m.castShadow = true;
  return m;
}
const glowMat = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

/* ---------- spring rig: each joint chases a target angle (or height) */
class Rig {
  constructor() { this.j = {}; }
  add(name, obj, prop, k = 90, d = 15) { const v = prop === 'py' ? obj.position.y : obj.rotation[prop]; this.j[name] = { obj, prop, cur: v, vel: 0, rest: v, target: v, k, d, k0: k, d0: d }; }
  set(name, v) { const j = this.j[name]; if (j) j.target = v; }
  kick(name, v) { const j = this.j[name]; if (j) j.vel += v; }
  stiff(f) { for (const n in this.j) { const j = this.j[n]; j.k = j.k0 * f; j.d = j.d0 * Math.sqrt(f); } }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (const name in this.j) {
      const j = this.j[name];
      for (let i = 0; i < n; i++) { j.vel += ((j.target - j.cur) * j.k - j.vel * j.d) * h; j.cur += j.vel * h; }
      if (j.prop === 'py') j.obj.position.y = j.cur; else j.obj.rotation[j.prop] = j.cur;
    }
  }
}

/* ---------- builders */
function buildBasalt() {
  const rock = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x8a7a70, roughness: 0.95, flatShading: true, emissive: 0xff6a20, emissiveMap: magmaTex, emissiveIntensity: 1.6 });
  const crystal = glowMat(2.6, 1.0, 0.25);
  const M = (geo, x, y, z, sx = 1, sy = 1, sz = 1, mat = rock) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
  const D = () => new THREE.DodecahedronGeometry(1, 0);
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const hips = new THREE.Group(); hips.position.y = 11.5; tilt.add(hips);
  const legs = [], knees = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 3.6, 0, 0); hips.add(leg);
    leg.add(M(D(), 0, -3, 0, 2.7, 3.6, 2.9));
    const knee = new THREE.Group(); knee.position.y = -6; leg.add(knee);
    knee.add(M(D(), 0, -2.6, 0, 2.3, 3.3, 2.5)); knee.add(M(new THREE.BoxGeometry(5.2, 1.9, 7.4), 0, -5.1, 1.1));
    legs.push(leg); knees.push(knee);
  }
  const torso = new THREE.Group(); hips.add(torso);
  torso.add(M(D(), 0, 6.5, 0, 7.2, 6.8, 4.8)); torso.add(M(D(), 0, 1.2, 0.2, 5.2, 3.2, 4));
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4 + (i % 3), 5), crystal); c.position.set((i % 2 ? 1 : -1) * (1 + (i % 3)), 8 + i * 0.7, -4.3); c.rotation.x = -0.6; torso.add(c); }
  const arms = [], elbows = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 8.2, 10, 0); torso.add(sh);
    sh.add(M(new THREE.IcosahedronGeometry(1, 0), 0, 0.4, 0, 3.6, 3.2, 3.6)); sh.add(M(D(), 0, -3.2, 0, 2.3, 3.6, 2.3));
    const el = new THREE.Group(); el.position.y = -6.4; sh.add(el);
    el.add(M(D(), 0, -3, 0, 2.2, 3.4, 2.2)); el.add(M(new THREE.IcosahedronGeometry(3.2, 0), 0, -6.6, 0.3));
    arms.push(sh); elbows.push(el);
  }
  const blade = new THREE.Mesh(new THREE.ConeGeometry(1.3, 13, 6), glowMat(3.2, 1.2, 0.2)); blade.position.set(0, -13, 0.3); blade.rotation.x = Math.PI; blade.visible = false; elbows[1].add(blade);
  const head = new THREE.Group(); head.position.set(0, 13.2, 1.8); torso.add(head);
  head.add(M(D(), 0, 0, 0, 2.8, 2.4, 2.8));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.4), crystal); e.position.set(s * 1.1, 0.3, 2.5); head.add(e); }
  const rig = new Rig();
  rig.add('tiltX', tilt, 'x', 40, 9); rig.add('hipsY', hips, 'py', 70, 13);
  rig.add('legL', legs[0], 'x', 110, 16); rig.add('legR', legs[1], 'x', 110, 16); rig.add('legLz', legs[0], 'z'); rig.add('legRz', legs[1], 'z');
  rig.add('kneeL', knees[0], 'x', 110, 16); rig.add('kneeR', knees[1], 'x', 110, 16);
  rig.add('torsoX', torso, 'x', 80, 13); rig.add('torsoY', torso, 'y', 80, 12); rig.add('torsoZ', torso, 'z', 70, 12);
  rig.add('armL', arms[0], 'x', 120, 15); rig.add('armR', arms[1], 'x', 120, 15); rig.add('armLz', arms[0], 'z', 100, 14); rig.add('armRz', arms[1], 'z', 100, 14);
  rig.add('elbL', elbows[0], 'x', 130, 15); rig.add('elbR', elbows[1], 'x', 130, 15);
  rig.add('headX', head, 'x', 90, 12); rig.add('headY', head, 'y', 90, 12);
  return { root, tilt, rig, hips, legs, knees, torso, arms, elbows, head, blade, mats: [rock], height: 27, radius: 6.5, speed: 5, colY: 13, colR: 5.5, colH: 7 };
}
function buildVex() {
  const chitin = new THREE.MeshStandardMaterial({ map: chitinTex, color: 0x9a8fc8, roughness: 0.35, metalness: 0.45, emissive: 0x20d8ff, emissiveIntensity: 0 });
  const glow = glowMat(0.25, 2.2, 3.0);
  const M = (geo, x, y, z, sx = 1, sy = 1, sz = 1, mat = chitin) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const body = new THREE.Group(); body.position.y = 13; tilt.add(body);
  body.add(M(new THREE.SphereGeometry(1, 16, 10), 0, 0, -2, 5, 4.2, 10)); body.add(M(new THREE.SphereGeometry(1, 14, 10), 0, 1, 7.5, 4.4, 4.2, 4.6));
  for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4 - i * 0.25, 5), glow); c.position.set(0, 4 - i * 0.15, 6 - i * 2.4); c.rotation.x = -0.5; body.add(c); }
  const head = new THREE.Group(); head.position.set(0, 1.6, 12); body.add(head);
  const skull = M(new THREE.ConeGeometry(2.6, 7, 6), 0, 0, 2.4); skull.rotation.x = Math.PI / 2; head.add(skull);
  for (const [x, y] of [[-1.1, 0.9], [1.1, 0.9], [-0.7, 1.6], [0.7, 1.6]]) head.add(M(new THREE.SphereGeometry(0.42, 8, 6), x, y, 1.6, 1, 1, 1, glow));
  const mand = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 1.4, -1.2, 3); head.add(g); const m = M(new THREE.ConeGeometry(0.5, 4, 5), 0, 0, 1.8); m.rotation.x = Math.PI / 2; g.add(m); return g; });
  const legs = [];
  for (const [sx, sz, ph] of [[-1, 5, 0], [1, 5, Math.PI], [-1, -6, Math.PI], [1, -6, 0]]) {
    const leg = new THREE.Group(); leg.position.set(sx * 4, 0, sz); body.add(leg);
    const knee = new THREE.Vector3(sx * 7, 6, sz * 0.15), tip = new THREE.Vector3(sx * 11, -13, sz * 0.25);
    leg.add(seg(new THREE.Vector3(0, 0, 0), knee, 1.7, chitin), seg(knee, tip, 1.3, chitin));
    const claw = M(new THREE.ConeGeometry(0.7, 2.2, 5), tip.x, tip.y + 0.6, tip.z); claw.rotation.x = Math.PI; leg.add(claw);
    leg.userData = { tip: tip.clone(), ph, sx }; legs.push(leg);
  }
  const tail = []; let parent = body, off = new THREE.Vector3(0, 1.2, -11.5);
  for (let i = 0; i < 6; i++) { const s = new THREE.Group(); s.position.copy(off); parent.add(s); s.add(M(new THREE.SphereGeometry(1, 10, 8), 0, 0, -1.4, 2.3 - i * 0.28, 2.0 - i * 0.24, 2.4 - i * 0.2)); tail.push(s); parent = s; off = new THREE.Vector3(0, 0.9, -3); }
  const sting = M(new THREE.ConeGeometry(0.8, 3.6, 6), 0, 0.4, -3.6, 1, 1, 1, glow); sting.rotation.x = -Math.PI / 2; parent.add(sting);
  const rig = new Rig();
  rig.add('tiltZ', tilt, 'z', 40, 9); rig.add('bodyY', body, 'py', 70, 12); rig.add('bodyX', body, 'x', 80, 12); rig.add('bodyYaw', body, 'y', 80, 12); rig.add('bodyZ', body, 'z', 70, 11);
  rig.add('headX', head, 'x', 100, 13); rig.add('headY', head, 'y', 100, 13);
  rig.add('mandL', mand[0], 'y', 140, 12); rig.add('mandR', mand[1], 'y', 140, 12);
  legs.forEach((L, i) => { rig.add('leg' + i + 'y', L, 'y', 120, 15); rig.add('leg' + i + 'x', L, 'x', 120, 15); rig.add('leg' + i + 'z', L, 'z', 120, 15); });
  tail.forEach((s, i) => { rig.add('tail' + i + 'x', s, 'x', 70 - i * 6, 10); rig.add('tail' + i + 'y', s, 'y', 70 - i * 6, 10); });
  return { root, tilt, rig, body, head, legs, tail, mand, mats: [chitin], glow, height: 22, radius: 8, speed: 6.5, colY: 13, colR: 7.5, colH: 0 };
}

/* ---------- the titan */
class Titan {
  constructor(kind, x, z, yaw) {
    this.kind = kind; this.name = TITAN_NAMES[kind];
    Object.assign(this, kind === 'basalt' ? buildBasalt() : buildVex());
    this.pos = new THREE.Vector3(x, 0, z); this.yaw = yaw; this.hp = 100; this.state = 'emerge'; this.t = 0;
    this.y = kind === 'basalt' ? -this.height : 140; this.vy = 0; this.vel = new THREE.Vector3(); this.kb = new THREE.Vector3();
    this.ph = 0; this.walkAmt = 0; this.strafe = 0; this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.cd = 2.5; this.think = 0;
    this.act = null; this.block = false; this.invuln = 0; this.combo = 0; this.comboT = 0; this.flash = 0; this.lastStep = [0, 0, 0, 0]; this.bladeUsed = false; this.mcd = {};
    this.root.position.set(x, this.y, z); this.root.rotation.y = yaw; scene.add(this.root);
    this.rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, this.colY + this.y, z));
    world.createCollider(this.colH ? RAPIER.ColliderDesc.capsule(this.colH, this.colR) : RAPIER.ColliderDesc.ball(this.colR), this.rb);
    this.threat = addThreat('titan', x, z, 60, 99999, { follow: () => this.pos });
  }
  get fwd() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  w(local) { return this.root.localToWorld(local.clone()); }
  busy() { return ['emerge', 'down', 'gone', 'leave', 'held', 'air', 'ko', 'getup', 'getdown'].includes(this.state); }
  remove() {
    scene.remove(this.root);
    if (this.rb && world) { try { world.removeRigidBody(this.rb); } catch (e) {} }
    this.rb = null;
    if (this.threat) this.threat.until = simTime + 3;
    if (this.beam) { scene.remove(this.beam); this.beam = null; }
  }
}

/* ---------- city interaction helpers */
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

/* ---------- moves: phases with a pose (joint targets), stiffness, root motion and an optional event */
// pose values are absolute joint targets; phases blend naturally through the springs.
const B_GUARD = { armL: -0.95, elbL: -1.75, armLz: -0.35, armR: -0.75, elbR: -1.9, armRz: 0.35 };
const MOVES = {
  basalt: {
    jab: { gap: [0, 7], w: 3, ph: [
      { d: 0.14, pose: { armL: -0.5, elbL: -2.2, torsoY: 0.3, torsoX: 0.2 }, s: 1 },
      { d: 0.13, pose: { armL: -1.6, elbL: -0.15, armLz: -0.05, torsoY: -0.35, torsoX: 0.3 }, s: 2.6, mv: 7, hit: { dmg: 4, range: 8, arc: 0.8, type: 'light', side: 1 } },
      { d: 0.2, pose: {}, s: 1.2 }], next: 'cross' },
    cross: { gap: [0, 7], w: 0, ph: [
      { d: 0.12, pose: { armR: -0.4, elbR: -2.3, torsoY: -0.45 }, s: 1.2 },
      { d: 0.14, pose: { armR: -1.65, elbR: -0.1, armRz: 0.05, torsoY: 0.5, torsoX: 0.35, legL: -0.35 }, s: 2.8, mv: 8, hit: { dmg: 6, range: 8.5, arc: 0.8, type: 'light', side: -1 } },
      { d: 0.22, pose: {}, s: 1.2 }], next: 'upper' },
    upper: { gap: [0, 6], w: 0, ph: [
      { d: 0.22, pose: { hipsY: 9.2, kneeL: 0.9, kneeR: 0.9, torsoX: 0.45, armL: 0.3, elbL: -2.4, torsoY: 0.3 }, s: 1.1 },
      { d: 0.18, pose: { hipsY: 12.4, kneeL: 0, kneeR: 0, armL: -2.9, elbL: -0.7, torsoX: -0.35, torsoY: -0.2, headX: -0.4 }, s: 2.6, mv: 5, hit: { dmg: 10, range: 8, arc: 0.9, type: 'launch', up: 1 } },
      { d: 0.45, pose: {}, s: 0.9 }] },
    haymaker: { gap: [0, 8], w: 2, cool: 3, ph: [
      { d: 0.42, pose: { armR: 0.7, armRz: 1.1, elbR: -1.3, torsoY: 0.85, torsoZ: -0.15, legR: 0.3 }, s: 0.9, mv: -1.5 },
      { d: 0.2, pose: { armR: -1.4, armRz: -0.4, elbR: -0.25, torsoY: -1.0, torsoX: 0.3, torsoZ: 0.2, legL: -0.4 }, s: 2.4, mv: 9, hit: { dmg: 13, range: 10, arc: 1.2, type: 'heavy', side: -1 } },
      { d: 0.5, pose: { torsoY: -0.5 }, s: 0.8 }] },
    hammer: { gap: [0, 9], w: 1.5, cool: 7, ph: [
      { d: 0.5, pose: { armL: -2.9, armR: -2.9, elbL: -0.6, elbR: -0.6, armLz: 0.15, armRz: -0.15, torsoX: -0.35, headX: -0.3, hipsY: 12.2 }, s: 0.9 },
      { d: 0.16, pose: { armL: -0.9, armR: -0.9, elbL: -0.2, elbR: -0.2, torsoX: 0.75, hipsY: 9.5, kneeL: 0.8, kneeR: 0.8 }, s: 3, mv: 5, ev: 'slam' },
      { d: 0.6, pose: { torsoX: 0.55, hipsY: 10 }, s: 0.8 }] },
    charge: { gap: [12, 40], w: 1, cool: 10, ph: [
      { d: 0.35, pose: { hipsY: 9.8, kneeL: 0.8, kneeR: 0.8, torsoX: 0.6, armL: 0.3, armR: 0.3, elbL: -1, elbR: -1, torsoY: 0.4 }, s: 1, mv: -2 },
      { d: 1.0, pose: { torsoX: 0.75, torsoY: 0.5, armL: -0.5, elbL: -2, armR: 0.4, elbR: -0.8, hipsY: 10.8 }, s: 1.5, mv: 24, run: true, ev: 'ram' },
      { d: 0.45, pose: { torsoX: 0.2 }, s: 1, mv: 3 }] },
    grab: { gap: [0, 6], w: 1.5, cool: 9, ph: [
      { d: 0.32, pose: { armL: -1.45, armR: -1.45, elbL: -0.35, elbR: -0.35, armLz: 0.35, armRz: -0.35, torsoX: 0.45 }, s: 1.4, mv: 6, ev: 'grab' },
      { d: 0.7, pose: { armL: -2.85, armR: -2.85, elbL: -0.5, elbR: -0.5, armLz: 0.1, armRz: -0.1, torsoX: -0.3, hipsY: 12 }, s: 1, ev: 'lift' },
      { d: 0.55, pose: { armL: -2.6, armR: -2.6, torsoY: 1.2, torsoX: -0.2 }, s: 1, turn: 3.4 },
      { d: 0.22, pose: { armL: -1.3, armR: -1.3, elbL: -0.1, elbR: -0.1, torsoY: -0.4, torsoX: 0.5 }, s: 2.6, ev: 'throw' },
      { d: 0.5, pose: {}, s: 1 }] },
    guard: { gap: [0, 14], w: 0, ph: [{ d: 0.9, pose: { armL: -1.25, elbL: -2.0, armLz: 0.45, armR: -1.25, elbR: -2.0, armRz: -0.45, torsoX: 0.3, hipsY: 10.8, headX: 0.25 }, s: 1.8, block: true }] },
    blade: { gap: [0, 10], w: 0, ph: [
      { d: 0.6, pose: { armR: -0.4, armRz: 1.4, elbR: -0.3, torsoY: 1.0, torsoX: 0.1 }, s: 1, ev: 'bladeOn' },
      { d: 0.24, pose: { armR: -1.5, armRz: -1.0, elbR: -0.05, torsoY: -1.1, torsoX: 0.35, legL: -0.4 }, s: 2.4, mv: 10, hit: { dmg: 19, range: 15, arc: 1.4, type: 'launch' } },
      { d: 0.7, pose: { torsoY: -0.6 }, s: 0.8, ev: 'bladeOff' }] },
    boulder: { gap: [22, 90], w: 1, cool: 8, ph: [
      { d: 0.55, pose: { armL: -0.6, armR: -0.6, elbL: -0.3, elbR: -0.3, torsoX: 0.8, hipsY: 9.5, kneeL: 0.9, kneeR: 0.9 }, s: 1, ev: 'rip' },
      { d: 0.55, pose: { armL: -3.0, armR: -3.0, elbL: -0.8, elbR: -0.8, torsoX: -0.45, hipsY: 12 }, s: 1 },
      { d: 0.25, pose: { armL: -1.2, armR: -1.2, elbL: -0.1, elbR: -0.1, torsoX: 0.5 }, s: 2.4, ev: 'throwRock' },
      { d: 0.5, pose: {}, s: 1 }] },
  },
  vex: {
    clawL: { gap: [0, 9], w: 3.5, ph: [
      { d: 0.16, pose: { leg0z: 0.8, leg0y: 0.5, bodyYaw: 0.25, bodyX: -0.1 }, s: 1.3 },
      { d: 0.12, pose: { leg0z: 0.35, leg0y: -0.9, bodyYaw: -0.3, bodyX: 0.18 }, s: 2.8, mv: 7, hit: { dmg: 5, range: 10, arc: 1.2, type: 'light', side: 1 } },
      { d: 0.18, pose: {}, s: 1.2 }], next: 'clawR' },
    clawR: { gap: [0, 8], w: 0, ph: [
      { d: 0.14, pose: { leg1z: -0.8, leg1y: -0.5, bodyYaw: -0.25 }, s: 1.3 },
      { d: 0.12, pose: { leg1z: -0.35, leg1y: 0.9, bodyYaw: 0.3, bodyX: 0.18 }, s: 2.8, mv: 7, hit: { dmg: 5, range: 10, arc: 1.2, type: 'light', side: -1 } },
      { d: 0.18, pose: {}, s: 1.2 }], next: 'bite' },
    bite: { gap: [0, 7], w: 0, ph: [
      { d: 0.2, pose: { bodyX: -0.25, headX: -0.4, mandL: 0.7, mandR: -0.7, bodyY: 14 }, s: 1.2, mv: -2 },
      { d: 0.15, pose: { bodyX: 0.35, headX: 0.3, mandL: -0.3, mandR: 0.3, bodyY: 12 }, s: 2.8, mv: 14, hit: { dmg: 9, range: 9, arc: 1.0, type: 'heavy' } },
      { d: 0.35, pose: {}, s: 1 }] },
    stab: { gap: [0, 16], w: 2.5, cool: 3, ph: [
      { d: 0.5, pose: { tail0x: 0.5, tail1x: 0.6, tail2x: 0.7, tail3x: 0.7, tail4x: 0.6, tail5x: 0.4, bodyX: -0.15, bodyY: 14 }, s: 0.9 },
      { d: 0.16, pose: { tail0x: 0.35, tail1x: 0.45, tail2x: 0.9, tail3x: 1.0, tail4x: 0.9, tail5x: 0.9, bodyX: 0.25, bodyY: 12 }, s: 2.8, mv: 10, hit: { dmg: 12, range: 20, arc: 0.95, type: 'heavy' } },
      { d: 0.5, pose: {}, s: 0.9 }] },
    pounce: { gap: [9, 45], w: 2.5, cool: 6, ph: [
      { d: 0.4, pose: { bodyY: 8.5, bodyX: 0.2, leg0x: 0.3, leg1x: 0.3, tail0x: 0.3 }, s: 1.2, mv: -2 },
      { d: 0.1, pose: { bodyY: 14, bodyX: -0.3, leg0z: 0.7, leg1z: -0.7, leg0y: -0.6, leg1y: 0.6 }, s: 2, ev: 'jump' },
      { d: 0.9, pose: { bodyX: 0.3, leg0z: 0.5, leg1z: -0.5 }, s: 1, air: true },
      { d: 0.45, pose: { bodyY: 10, bodyX: 0.2 }, s: 1 }] },
    wrap: { gap: [0, 13], w: 2, cool: 9, ph: [
      { d: 0.4, pose: { tail0y: 0.9, tail1y: 0.6, tail2y: 0.4, tail0x: 0.2, bodyYaw: -0.4 }, s: 1 },
      { d: 0.22, pose: { tail0y: -1.2, tail1y: -0.8, tail2y: -0.6, tail3y: -0.5, bodyYaw: 0.5 }, s: 2.2, ev: 'grab' },
      { d: 0.75, pose: { tail0x: 0.9, tail1x: 0.8, tail2x: 0.6, tail0y: 0, tail1y: 0, bodyX: -0.3, bodyY: 15 }, s: 1, ev: 'lift' },
      { d: 0.25, pose: { tail0x: -0.3, tail1x: 0.1, bodyX: 0.45, bodyY: 11 }, s: 2.6, ev: 'slamHeld' },
      { d: 0.5, pose: {}, s: 1 }] },
    dodge: { gap: [0, 14], w: 0, counter: 'stab', ph: [{ d: 0.38, pose: { bodyZ: 0.35, bodyY: 11.5 }, s: 1.6, side: 18, iframes: true }, { d: 0.2, pose: {}, s: 1 }] },
    beam: { gap: [18, 95], w: 1.5, cool: 9, ph: [
      { d: 0.9, pose: { bodyX: -0.2, headX: -0.25, mandL: 0.8, mandR: -0.8, bodyY: 13.5 }, s: 1, ev: 'charge' },
      { d: 1.6, pose: { bodyX: 0.1, headX: 0.15, mandL: 0.9, mandR: -0.9 }, s: 1.4, ev: 'fire' },
      { d: 0.4, pose: {}, s: 1, ev: 'beamOff' }] },
  },
};

/* ---------- start / stop */
function startTitans(P) {
  if (titans.list.length) { toast('Ya hay titanes en la ciudad'); return; }
  const m = titans.mode;
  titans.phase = 'on'; titans.t = 0; titans.winner = null; titans.winT = 0;
  const a = rnd(0, Math.PI * 2), d = m === 'fight' ? 24 : 0;
  if (m === 'fight' || m === 'basalt') titans.list.push(new Titan('basalt', P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 0));
  if (m === 'fight' || m === 'vex') titans.list.push(new Titan('vex', P.x - Math.cos(a) * d, P.z - Math.sin(a) * d, 0));
  const [A, B] = titans.list;
  if (A && B) { A.foe = B; B.foe = A; B.t = -1.6; A.yaw = Math.atan2(B.pos.x - A.pos.x, B.pos.z - A.pos.z); B.yaw = A.yaw + Math.PI; }
  sirenUntil = simTime + 40;
  setTimeout(() => dispatchEmergency(P.x, P.z), 6000);
  popup(m === 'fight' ? '¡COMBATE!' : TITAN_NAMES[m].toUpperCase(), '#ffb02e');
  showTitanHud(true); refreshRunning();
}
function retreatTitans() { for (const T of titans.list) if (!['down', 'gone', 'ko'].includes(T.state)) { endAct(T); T.state = 'leave'; T.t = 0; } titans.phase = 'leaving'; refreshRunning(); }
function clearTitans() { for (const T of titans.list) T.remove(); titans.list.length = 0; titans.phase = 'idle'; showTitanHud(false); Sfx.beam(0); cine.slow = cine.hitStop = 0; }

/* ---------- per physics step: kinematic body follows the model; ploughing through buildings */
function titansStep(dt) {
  for (const T of titans.list) {
    if (!T.rb) continue;
    T.rb.setNextKinematicTranslation({ x: T.root.position.x, y: T.root.position.y + T.colY, z: T.root.position.z });
    const fast = T.kb.length() > 4 || T.state === 'air' || (T.act && T.act.def.ph[T.act.i] && T.act.def.ph[T.act.i].run);
    if ((T.walkAmt > 0.3 || fast) && T.root.position.y > -2) {
      let n = 0;
      for (const it of allBlocks()) {
        const t = it.body.translation(), d = Math.hypot(t.x - T.pos.x, t.z - T.pos.z);
        if (d < T.radius + 1.5 && Math.abs(t.y - T.root.position.y - T.height * 0.45) < T.height * 0.6 && Math.random() < (fast ? 0.5 : 0.08) && n++ < (fast ? 4 : 2)) fragment(it, T.pos, 4 + T.kb.length() * 0.4 + (fast ? 6 : 0));
      }
    }
  }
}

/* ---------- frame update */
function titansUpdate(dt) {
  if (!titans.list.length) return;
  titans.t += dt;
  for (const T of titans.list) updateTitan(T, dt);
  const alive = titans.list.filter((T) => !['gone', 'down', 'ko'].includes(T.state));
  if (titans.phase === 'on' && titans.list.length === 2 && alive.length === 1 && !titans.winner) {
    titans.winner = alive[0]; endAct(titans.winner); titans.winner.state = 'roar'; titans.winner.t = 0;
    Sfx.roar(titans.winner.kind, 1.3, soundDelay(titans.winner.pos));
  }
  if (titans.phase === 'on' && titans.list.length === 1 && titans.t > titans.dur) retreatTitans();
  if (titans.phase === 'on' && titans.winner) { titans.winT += dt; if (titans.winT > 9) retreatTitans(); }
  if (titans.list.every((T) => T.state === 'gone')) { clearTitans(); refreshRunning(); }
  updateTitanHud();
  updateCine(dt);
  Sfx.beam(titans.list.some((T) => T.beam && T.beam.visible) ? 1 : 0);
}
// cinematic camera: frames both fighters, slowly orbits, punches in on big moments; any touch on the camera pauses it
function updateCine(dt) {
  if (!titans.cine || titans.phase === 'idle' || performance.now() - (controls.userT || 0) < 5000) return;
  const L = titans.list.filter((T) => T.state !== 'gone'); if (!L.length) return;
  const mid = new THREE.Vector3(); for (const T of L) mid.add(T.pos); mid.multiplyScalar(1 / L.length);
  const sep = L.length > 1 ? L[0].pos.distanceTo(L[1].pos) : 20;
  cine.kick = Math.max(0, cine.kick - dt);
  const g = controls.goal;
  g.target.lerp(new THREE.Vector3(mid.x, 11, mid.z), Math.min(1, dt * 2));
  g.radius += (THREE.MathUtils.clamp(sep * 1.25 + 38, 48, 120) * (1 - cine.kick * 0.25) - g.radius) * Math.min(1, dt * 1.5);
  g.phi += ((cine.kick > 0 ? 1.3 : 1.18) - g.phi) * Math.min(1, dt);
  g.theta += dt * 0.07 * cine.dir;
}

function faceTo(T, x, z, dt, rate = 3) {
  const want = Math.atan2(x - T.pos.x, z - T.pos.z);
  T.yaw += Math.atan2(Math.sin(want - T.yaw), Math.cos(want - T.yaw)) * Math.min(1, dt * rate);
}
function startAct(T, name) {
  const def = MOVES[T.kind][name]; if (!def) return;
  T.act = { name, def, i: -1, t: 0, hitDone: false, connected: false };
  if (def.cool) T.mcd[name] = titans.t + def.cool * (1.3 - titans.fury * 0.05);
  (titans.log = titans.log || []).push(T.kind[0] + ':' + name);
  T.state = 'act'; nextPhase(T);
}
function endAct(T) {
  if (T.act && T.act.held) release(T, false);
  T.act = null; T.block = false; T.rig.stiff(1);
  if (T.blade) T.blade.visible = false;
  if (T.beam) T.beam.visible = false;
  if (T.glow) T.glow.color.setRGB(0.25, 2.2, 3.0);
  if (T.rock && !T.rockThrown) { T.root.remove(T.rock); scene.remove(T.rock); } T.rock = null; T.rockThrown = false;
}
function nextPhase(T) {
  const a = T.act; a.i++; a.t = 0; a.hitDone = false;
  const p = a.def.ph[a.i];
  if (!p) { const nx = a.def.counter || a.def.next, ok = a.connected || !!a.def.counter; endAct(T); T.state = 'neutral'; if (nx && ok && T.foe && !T.foe.busy()) startAct(T, nx); else T.cd = rnd(0.5, 1.2) * (1.4 - titans.fury * 0.08); return; }
  T.rig.stiff(p.s || 1);
  T.block = !!p.block; T.invuln = p.iframes ? p.d : 0;
  if (p.ev) moveEvent(T, p.ev);
  if (p.d > 0.12 && (p.s || 1) > 2) Sfx.whoosh(0.25);
}
function poseTargets(T) {
  const p = T.act && T.act.def.ph[T.act.i];
  return p ? p.pose : null;
}

function updateTitan(T, dt) {
  T.t += dt;
  const foe = T.foe && !['gone', 'down', 'ko'].includes(T.foe.state) ? T.foe : null;
  T.flash *= Math.exp(-dt * 6); T.invuln = Math.max(0, T.invuln - dt); T.comboT -= dt; if (T.comboT <= 0) T.combo = 0;
  for (const m of T.mats) m.emissiveIntensity = (T.kind === 'basalt' ? 1.6 : 0) + T.flash * 2.5;
  let speed = 0;
  switch (T.state) {
    case 'emerge': emerge(T, dt); break;
    case 'roar': if (T.t > 2.2) T.state = 'neutral'; break;
    case 'neutral': speed = neutral(T, foe, dt); break;
    case 'act': speed = runAct(T, foe, dt); break;
    case 'stagger': if (T.t > T.stagT) T.state = 'neutral'; break;
    case 'air': {
      T.y += T.vy * dt; T.vy -= 32 * dt; T.pos.addScaledVector(T.vel, dt);
      if (T.y <= 0 && T.vy < 0) { T.y = 0; land(T); }
      break;
    }
    case 'held': break;
    case 'getdown': if (T.t > 1.7) { T.state = 'getup'; T.t = 0; } break;
    case 'getup': if (T.t > 1.1) { T.state = 'neutral'; T.cd = 0.3; T.invuln = 0.9; } break;
    case 'ko': if (T.t > 2.2 && !T.koDone) { T.koDone = true; vanish(T); } break;
    case 'leave': {
      if (T.kind === 'basalt') { T.y -= dt * 6; addShake(0.05, T.pos); if (Math.random() < 0.6) dust.emit(T.pos.x + rnd(-7, 7), 0.5, T.pos.z + rnd(-7, 7), 0, rnd(2, 5), 0, rnd(2, 4), rnd(3, 5), 0.42, 0.38, 0.33, 0.7, 1.4, 0.8); }
      else { T.y += dt * (8 + T.t * 18); fire.emit(T.pos.x, T.y + 10, T.pos.z, rnd(-1, 1), -rnd(6, 12), rnd(-1, 1), 0.5, rnd(3, 5), 0.3, 0.9, 1, 1, 0, 0.2, 0); }
      if (T.t > 4.5) { T.state = 'gone'; T.remove(); }
      break;
    }
  }
  // knockback slide (through buildings) and arena limits
  if (T.kb.lengthSq() > 0.01) { T.pos.addScaledVector(T.kb, dt); T.kb.multiplyScalar(Math.exp(-dt * 2.6)); }
  T.pos.x = THREE.MathUtils.clamp(T.pos.x, -85, 95); T.pos.z = THREE.MathUtils.clamp(T.pos.z, -55, 50);
  const airborneMove = T.act && T.act.def.ph[T.act.i] && T.act.def.ph[T.act.i].air;
  if (!['emerge', 'leave', 'air', 'held'].includes(T.state) && !airborneMove) T.y += (0 - T.y) * Math.min(1, dt * 6);
  T.root.position.set(T.pos.x, T.y, T.pos.z);
  T.root.rotation.y = T.yaw;
  animate(T, dt, speed);
}

function emerge(T, dt) {
  if (T.kind === 'basalt') {
    const k = Math.min(1, Math.max(0, T.t) / 3.2);
    T.y = -T.height * (1 - k * (2 - k));
    addShake(0.08, T.pos); Sfx.rumble(0.8);
    if (Math.random() < 0.8) { const a = rnd(0, 6.28), r = rnd(3, 11); dust.emit(T.pos.x + Math.cos(a) * r, 0.5, T.pos.z + Math.sin(a) * r, Math.cos(a) * 3, rnd(2, 6), Math.sin(a) * 3, rnd(2, 4), rnd(3, 5), 0.42, 0.38, 0.33, 0.75, 1.6, 0.8); }
    if (T.t > 0.1 && !T.emStomp) { T.emStomp = true; stomp(T.pos.x, T.pos.z, 9, 7); }
    if (k >= 1) { T.state = 'roar'; T.t = 0; Sfx.roar('basalt', 1, soundDelay(T.pos)); T.rig.kick('headX', -3); T.rig.kick('torsoX', -2); }
  } else {
    if (T.t < 0) { T.root.visible = false; return; }
    T.root.visible = true;
    const k = Math.min(1, T.t / 1.4);
    T.y = 140 * (1 - k) * (1 - k);
    for (let i = 0; i < 3; i++) fire.emit(T.pos.x + rnd(-3, 3), T.y + 14, T.pos.z + rnd(-3, 3), rnd(-2, 2), rnd(6, 14), rnd(-2, 2), rnd(0.3, 0.6), rnd(3, 5), 0.4, 0.9, 1, 1, 0, 0.3, 0);
    if (k >= 1) { T.y = 0; blast(new THREE.Vector3(T.pos.x, 0.5, T.pos.z), 8, 12, { noFire: true }); T.state = 'roar'; T.t = 0; Sfx.roar('vex', 1, soundDelay(T.pos)); T.rig.kick('bodyY', -25); T.rig.kick('headX', -3); cine.kick = 1; }
  }
}

/* neutral: footwork and decisions */
function neutral(T, foe, dt) {
  let tx, tz;
  if (foe) { tx = foe.pos.x; tz = foe.pos.z; }
  else {
    if (!T.goal || Math.hypot(T.goal.x - T.pos.x, T.goal.z - T.pos.z) < 12) {
      const bl = allBlocks(); const b = bl.length ? bl[Math.floor(Math.random() * bl.length)].body.translation() : { x: rnd(-60, 40), z: rnd(-30, 30) };
      T.goal = new THREE.Vector3(b.x, 0, b.z);
    }
    tx = T.goal.x; tz = T.goal.z;
  }
  faceTo(T, tx, tz, dt, foe ? 4 : 2.5);
  const dist = Math.hypot(tx - T.pos.x, tz - T.pos.z), gap = foe ? dist - T.radius - foe.radius : dist - 8;
  T.cd -= dt;
  // react to an incoming attack: Basalto raises his guard, Vex sidesteps
  if (foe && foe.state === 'act' && foe.act && foe.act.i === 0 && gap < 12 && !T.reacted && Math.random() < 0.18 + titans.fury * 0.025) {
    T.reacted = true; startAct(T, T.kind === 'basalt' ? 'guard' : 'dodge'); return 0;
  }
  if (!(foe && foe.state === 'act')) T.reacted = false;
  if (T.cd <= 0) {
    const moves = MOVES[T.kind], opts = [];
    for (const n in moves) {
      const m = moves[n]; if (!m.w) continue;
      if (gap < m.gap[0] || gap > m.gap[1]) continue;
      if (!foe && (n === 'grab' || n === 'wrap' || n === 'guard' || n === 'dodge')) continue;
      if ((T.mcd[n] || 0) > titans.t) continue;
      opts.push([n, m.w]);
    }
    if (T.kind === 'basalt' && T.hp < 45 && !T.bladeUsed && foe && gap < 10) opts.push(['blade', 6]);
    if (opts.length) {
      let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), pick = opts[0][0];
      for (const [n, w] of opts) { r -= w; if (r <= 0) { pick = n; break; } }
      if (pick === 'blade') T.bladeUsed = true;
      startAct(T, pick); return 0;
    }
  }
  // footwork: close the distance, keep spacing, circle the opponent
  let fw = 0;
  const want = foe ? 3 : 0;
  if (gap > want + 4) fw = Math.min(1, (gap - want) / 15) * T.speed * (1 + titans.fury * 0.05) * (gap > 25 ? 1.6 : 1);
  else if (gap < want - 1.5) fw = -T.speed * 0.6;
  T.strafeT = (T.strafeT || 0) - dt; if (T.strafeT <= 0) { T.strafeT = rnd(1.5, 3.5); T.strafeDir *= Math.random() < 0.6 ? -1 : 1; }
  const sw = foe && gap < 14 ? T.speed * 0.55 * T.strafeDir : 0;
  T.pos.addScaledVector(T.fwd, fw * dt).addScaledVector(T.right, sw * dt);
  T.strafe = sw / T.speed;
  return Math.hypot(fw, sw);
}

function runAct(T, foe, dt) {
  const a = T.act, p = a.def.ph[a.i];
  a.t += dt;
  if (foe && !p.air && !p.run && !p.turn) faceTo(T, foe.pos.x, foe.pos.z, dt, p.hit ? 2 : 5);
  let sp = 0;
  if (p.mv) { T.pos.addScaledVector(T.fwd, p.mv * dt); sp = Math.abs(p.mv); }
  if (p.side) { T.pos.addScaledVector(T.right, p.side * T.strafeDir * dt); sp = p.side; }
  if (p.turn) T.yaw += p.turn * dt;
  if (p.hit && !a.hitDone && a.t > p.d * 0.45) { a.hitDone = true; if (tryHit(T, p.hit)) a.connected = true; else if (p.hit.type !== 'light' || !T.foe) swingMiss(T, p); }
  if (p.run && foe && !a.rammed) {
    const gap = T.pos.distanceTo(foe.pos) - T.radius - foe.radius;
    if (gap < 2) { a.rammed = true; tryHit(T, { dmg: 13, range: 6, arc: 1.6, type: 'launch' }); a.t = p.d; }
  }
  if (p.air) {
    T.y += T.vy * dt; T.vy -= 32 * dt; T.pos.addScaledVector(T.vel, dt);
    if (T.y <= 0 && T.vy < 0) { T.y = 0; a.t = p.d; moveEvent(T, 'landPounce'); }
    else a.t = Math.min(a.t, p.d - 0.001);
  }
  if (a.held) holdVictim(T);
  if (a.t >= p.d) nextPhase(T);
  return sp;
}
function swingMiss(T, p) { // a missed heavy swing still smashes whatever is in front
  const f = T.pos.clone().addScaledVector(T.fwd, T.radius + (p.hit.range || 8) * 0.6);
  stomp(f.x, f.z, 4.5, 6, 4);
}

/* move events */
function moveEvent(T, ev) {
  const foe = T.foe && !['gone', 'down', 'ko'].includes(T.foe.state) ? T.foe : null;
  switch (ev) {
    case 'slam': {
      const f = T.pos.clone().addScaledVector(T.fwd, T.radius + 6);
      stomp(f.x, f.z, 8, 10); addShockwave(new THREE.Vector3(f.x, 0.5, f.z), 6, 6, 40); cine.kick = 1; addShake(0.8, f);
      if (foe && foe.pos.distanceTo(f) < foe.radius + 9) applyHit(T, foe, { dmg: 12, type: 'launch', up: 0.6 }, f.clone().setY(3));
      break;
    }
    case 'grab': {
      if (!foe || foe.busy() || foe.invuln > 0) break;
      const gap = T.pos.distanceTo(foe.pos) - T.radius - foe.radius;
      if (gap < (T.kind === 'vex' ? 12 : 6) && angleTo(T, foe) < 1.1) {
        T.act.held = foe; endAct(foe); foe.state = 'held'; foe.t = 0;
        popup(T.kind === 'vex' ? '¡LO ATRAPA CON LA COLA!' : '¡LLAVE!', T.kind === 'vex' ? '#6ff0ff' : '#ffb02e');
        Sfx.boom(0.35, soundDelay(foe.pos)); T.act.connected = true;
      } else { T.act.i = T.act.def.ph.length - 2; }
      break;
    }
    case 'lift': if (T.act.held) { cine.kick = 1; Sfx.roar(T.kind, 0.7, soundDelay(T.pos)); } break;
    case 'throw': if (T.act.held) release(T, true); break;
    case 'slamHeld': if (T.act.held) { const v = T.act.held; release(T, false); v.state = 'air'; v.vy = -30; v.vel.set(0, 0, 0); v.slammed = true; } break;
    case 'ram': cine.kick = 0.6; break;
    case 'jump': {
      const to = foe ? foe.pos : T.pos.clone().addScaledVector(T.fwd, 30);
      const flight = 0.95; T.vy = 15; T.vel.set((to.x - T.pos.x) / flight * 0.85, 0, (to.z - T.pos.z) / flight * 0.85);
      Sfx.roar('vex', 0.6, soundDelay(T.pos)); dust.emit(T.pos.x, 1, T.pos.z, 0, 3, 0, 2, 6, 0.5, 0.47, 0.42, 0.7, 2, 1);
      break;
    }
    case 'landPounce': {
      T.vel.set(0, 0, 0); stomp(T.pos.x, T.pos.z, 9, 9); addShockwave(new THREE.Vector3(T.pos.x, 0.5, T.pos.z), 5, 6, 35); cine.kick = 1;
      if (foe && foe.pos.distanceTo(T.pos) < T.radius + foe.radius + 5) applyHit(T, foe, { dmg: 13, type: 'launch', up: 0.5 }, foe.pos.clone().setY(foe.height * 0.6));
      break;
    }
    case 'bladeOn': T.blade.visible = true; Sfx.roar('basalt', 0.8, soundDelay(T.pos)); popup('¡HOJA DE MAGMA!', '#ff7a2a'); for (let i = 0; i < 30; i++) { const p = T.w(new THREE.Vector3(8.2, 14, 0)); fire.emit(p.x, p.y, p.z, rnd(-3, 3), rnd(-3, 3), rnd(-3, 3), rnd(0.3, 0.7), rnd(1, 2), 1, 0.45, 0.1, 1, 0, 1, 0); } break;
    case 'bladeOff': T.blade.visible = false; break;
    case 'rip': {
      const f = T.pos.clone().addScaledVector(T.fwd, T.radius + 4); stomp(f.x, f.z, 4, 6);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), T.mats[0]); m.castShadow = true; m.position.set(0, 27, 2); T.root.add(m); T.rock = m; T.rockThrown = false;
      break;
    }
    case 'throwRock': {
      if (!T.rock) break;
      const from = T.w(new THREE.Vector3(0, 27, 4)); T.root.remove(T.rock);
      const aim = foe ? foe.pos.clone().setY(foe.height * 0.55) : T.pos.clone().addScaledVector(T.fwd, 40).setY(6);
      const flight = Math.max(0.7, from.distanceTo(aim) / 40);
      const v = new THREE.Vector3((aim.x - from.x) / flight, (aim.y - from.y) / flight + 0.5 * 9.81 * flight, (aim.z - from.z) / flight);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(from.x, from.y, from.z).setLinvel(v.x, v.y, v.z).setAngvel({ x: 2, y: 1, z: 3 }).setCcdEnabled(true));
      const collider = world.createCollider(RAPIER.ColliderDesc.ball(2.4).setDensity(2.5), body);
      titanRocks.push(addProp(body, collider, T.rock, { ttl: simTime + 12, trail: 2, boulder: { from: T, armed: simTime + 0.3, lastV: v.length() } }));
      T.rock = null; T.rockThrown = true; Sfx.whoosh(0.6);
      break;
    }
    case 'charge': break;
    case 'fire': break;
    case 'beamOff': if (T.beam) T.beam.visible = false; break;
  }
}
const angleTo = (T, o) => { const d = new THREE.Vector3(o.pos.x - T.pos.x, 0, o.pos.z - T.pos.z).normalize(); return Math.acos(THREE.MathUtils.clamp(d.dot(T.fwd), -1, 1)); };

/* hits */
function tryHit(A, h) {
  const B = A.foe;
  if (!B || B.busy() || B.invuln > 0) return false;
  const gap = A.pos.distanceTo(B.pos) - A.radius - B.radius;
  if (gap > h.range || angleTo(A, B) > h.arc) return false;
  const hp = B.pos.clone().lerp(A.pos, B.radius / Math.max(1, A.pos.distanceTo(B.pos))).setY(B.height * (h.up ? 0.75 : 0.55));
  if (B.block && angleTo(B, A) < 1.0 && h.type !== 'launch') {
    B.hp = Math.max(1, B.hp - h.dmg * 0.15); B.kb.copy(A.fwd).multiplyScalar(5); B.rig.kick('torsoX', -2.5);
    for (let i = 0; i < 25; i++) sparks.emit(hp.x, hp.y, hp.z, rnd(-10, 10), rnd(-2, 10), rnd(-10, 10), rnd(0.3, 0.8));
    Sfx.clang(soundDelay(hp)); cine.hitStop = 0.05; popup('¡BLOQUEO!', '#cfd8e6');
    return true;
  }
  applyHit(A, B, h, hp);
  return true;
}
function applyHit(A, B, h, hp) {
  const dmg = h.dmg * (0.38 + titans.fury * 0.025) * (A.kind === 'vex' ? 1.3 : 1);
  (titans.log = titans.log || []).push('HIT>' + B.kind[0] + ':' + h.type);
  B.hp = Math.max(0, B.hp - dmg); B.flash = 1;
  const dir = new THREE.Vector3(B.pos.x - A.pos.x, 0, B.pos.z - A.pos.z).normalize();
  // impact: sparks, chips of rock or cyan plasma, dust, light, sound, camera
  const chips = B.kind === 'basalt' ? [0.35, 0.3, 0.27] : [0.2, 0.85, 1];
  for (let i = 0; i < (h.type === 'light' ? 18 : 45); i++) sparks.emit(hp.x, hp.y, hp.z, dir.x * 8 + rnd(-10, 10), rnd(-3, 12), dir.z * 8 + rnd(-10, 10), rnd(0.3, 1.1));
  for (let i = 0; i < (h.type === 'light' ? 6 : 16); i++) (B.kind === 'basalt' ? dust : fire).emit(hp.x, hp.y, hp.z, dir.x * 6 + rnd(-5, 5), rnd(-2, 7), dir.z * 6 + rnd(-5, 5), rnd(0.8, 2), rnd(1.5, 3.5), chips[0], chips[1], chips[2], 0.85, 1.2, 0.8, 4);
  flashLight.position.copy(hp); flashLight.color.setHex(B.kind === 'basalt' ? 0xffa050 : 0x70e8ff); flashLight.intensity = Math.max(flashLight.intensity, h.type === 'light' ? 900 : 2600);
  addShake(h.type === 'light' ? 0.25 : 0.7, hp);
  Sfx.punch(h.type !== 'light', soundDelay(hp));
  cine.hitStop = h.type === 'light' ? 0.045 : h.type === 'heavy' ? 0.09 : 0.13;
  if (h.type !== 'light') cine.kick = 1;
  // combo counter
  A.combo++; A.comboT = 1.4; if (A.combo >= 2) popup(`COMBO x${A.combo}`, A.kind === 'vex' ? '#6ff0ff' : '#ffb02e');
  // reaction
  endAct(B);
  const side = h.side || (Math.random() < 0.5 ? 1 : -1);
  if (B.hp <= 0) { knockOut(B, dir); return; }
  if (h.type === 'light') {
    B.state = 'stagger'; B.t = 0; B.stagT = 0.32; B.kb.copy(dir).multiplyScalar(5);
    if (B.kind === 'basalt') { B.rig.kick('headY', side * 6); B.rig.kick('torsoY', side * 3); B.rig.kick('torsoX', -2); } else { B.rig.kick('headY', side * 6); B.rig.kick('bodyYaw', side * 2.5); B.rig.kick('bodyZ', side * 2); }
  } else if (h.type === 'heavy') {
    B.state = 'stagger'; B.t = 0; B.stagT = 0.75; B.kb.copy(dir).multiplyScalar(14);
    if (B.kind === 'basalt') { B.rig.kick('torsoX', -6); B.rig.kick('headX', -7); B.rig.kick('torsoY', side * 4); } else { B.rig.kick('bodyX', -4); B.rig.kick('bodyZ', side * 4); B.rig.kick('headX', -6); }
    if (Math.random() < 0.5) Sfx.roar(B.kind, 0.6, soundDelay(B.pos));
  } else {
    // launched: flies back through the buildings and goes down
    B.state = 'air'; B.t = 0; B.vy = 10 + (h.up || 0) * 10; B.vel.copy(dir).multiplyScalar(16); B.launched = true;
    popup(B.kind === 'basalt' ? '¡BASALTO VUELA!' : '¡VEX VUELA!', '#ffffff'); Sfx.roar(B.kind, 0.9, soundDelay(B.pos));
  }
}
function land(T) {
  stomp(T.pos.x, T.pos.z, 10, 10); addShockwave(new THREE.Vector3(T.pos.x, 0.5, T.pos.z), 5, 6, 30);
  T.vel.set(0, 0, 0); cine.kick = 1;
  if (T.slammed) { T.slammed = false; T.hp = Math.max(0, T.hp - 12 * (0.45 + titans.fury * 0.03)); T.flash = 1; popup('¡AZOTADO!', '#6ff0ff'); }
  if (T.hp <= 0) { knockOut(T, T.fwd.negate()); return; }
  if (T.launched || T.thrown || true) { T.launched = T.thrown = false; T.state = 'getdown'; T.t = 0; }
}
function knockOut(B, dir) {
  B.state = 'ko'; B.t = 0; B.kb.copy(dir).multiplyScalar(12); B.y = Math.max(B.y, 0);
  cine.slow = 1.8; cine.kick = 1; popup('¡K.O.!', '#ff4a2a');
  Sfx.roar(B.kind, 1.2, soundDelay(B.pos));
  setTimeout(() => { if (B.state === 'ko' || B.state === 'gone') { const p = B.pos; stomp(p.x, p.z, 13, 10); for (let i = 0; i < 40; i++) dust.emit(p.x + rnd(-8, 8), 1, p.z + rnd(-8, 8), rnd(-5, 5), rnd(1, 6), rnd(-5, 5), rnd(4, 8), rnd(5, 8), 0.52, 0.48, 0.42, 0.8, 2, 0.6); } }, 700);
}
function holdVictim(T) {
  const v = T.act.held; if (!v) return;
  const p = T.kind === 'basalt' ? T.w(new THREE.Vector3(0, 26, 7)) : T.w(new THREE.Vector3(0, 18, -16));
  v.pos.set(p.x, 0, p.z); v.y = Math.max(0, p.y - v.height * 0.45);
  v.yaw += 0.04; v.rig.kick(v.kind === 'basalt' ? 'legL' : 'leg0x', rnd(-1, 1)); v.rig.kick(v.kind === 'basalt' ? 'armR' : 'leg1z', rnd(-1, 1));
}
function release(T, thrown) {
  const v = T.act.held; T.act.held = null; if (!v) return;
  v.state = 'air'; v.t = 0;
  if (thrown) { v.vy = 14; v.vel.copy(T.fwd).multiplyScalar(26); v.thrown = true; v.hp = Math.max(0, v.hp - 4); popup('¡LANZAMIENTO!', '#ffb02e'); cine.kick = 1; Sfx.whoosh(0.8); }
  else { v.vy = 0; v.vel.set(0, 0, 0); }
}

/* ---------- animation: locomotion base pose + move pose, through the springs */
function animate(T, dt, speed) {
  const r = T.rig, pose = poseTargets(T), st = T.state;
  T.walkAmt += ((speed > 0.8 ? Math.min(1, speed / T.speed) : 0) - T.walkAmt) * Math.min(1, dt * 5);
  T.ph += dt * (T.kind === 'basalt' ? 2.6 : 3.8) * (0.2 + T.walkAmt * 1.2);
  const w = T.walkAmt, s = Math.sin(T.ph), c = Math.cos(T.ph), breath = Math.sin(pedTime.value * 1.6);
  const foe = T.foe && T.foe.state !== 'gone' ? T.foe : null;
  const look = foe ? Math.atan2(Math.sin(Math.atan2(foe.pos.x - T.pos.x, foe.pos.z - T.pos.z) - T.yaw), Math.cos(Math.atan2(foe.pos.x - T.pos.x, foe.pos.z - T.pos.z) - T.yaw)) : 0;
  const down = st === 'getdown' || st === 'ko' || (st === 'air' && T.launched !== false && T.vy < 4);
  if (T.kind === 'basalt') {
    const base = {
      tiltX: down ? -1.35 : st === 'getup' ? -0.5 : 0,
      hipsY: (st === 'getup' ? 8.5 : 10.8) + Math.abs(c) * 0.7 * w + breath * 0.15,
      legL: s * 0.55 * w - 0.12, legR: -s * 0.55 * w + 0.12, legLz: -0.08 + c * 0.12 * T.strafe, legRz: 0.08 + c * 0.12 * T.strafe,
      kneeL: 0.3 + Math.max(0, -s) * 0.7 * w, kneeR: 0.3 + Math.max(0, s) * 0.7 * w,
      torsoX: 0.18 + w * 0.15 + breath * 0.03, torsoY: s * 0.14 * w + look * 0.3, torsoZ: -s * 0.05 * w,
      headX: -0.05 + breath * 0.02, headY: look * 0.5,
      ...(st === 'roar' ? { torsoX: -0.4, headX: -0.7, armL: -2.2, armR: -2.2, elbL: -0.6, elbR: -0.6, armLz: -0.6, armRz: 0.6 } : B_GUARD),
    };
    if (st === 'roar') { base.armLz = -0.9; base.armRz = 0.9; }
    if (st === 'held' || st === 'air') { base.legL = -0.8; base.legR = 0.4; base.armL = -2; base.armR = -1; }
    const tgt = Object.assign(base, pose || {});
    for (const k in tgt) r.set(k, tgt[k]);
    // footsteps
    for (let i = 0; i < 2; i++) { const v = i ? -s : s; if (w > 0.35 && T.lastStep[i] > 0 && v <= 0 && T.y < 1) { const p = T.w(new THREE.Vector3(i ? 3.6 : -3.6, 0, 2)); stomp(p.x, p.z, 3.5, 3.5 + titans.fury * 0.2); } T.lastStep[i] = v; }
  } else {
    const base = {
      tiltZ: down ? 1.2 : 0,
      bodyY: (st === 'getup' ? 9 : 12.5) + Math.sin(T.ph * 2) * 0.4 * w + breath * 0.2, bodyX: 0.06, bodyYaw: look * 0.35, bodyZ: -T.strafe * 0.08,
      headX: 0.05, headY: look * 0.6, mandL: 0.15 + Math.sin(pedTime.value * 9) * 0.12, mandR: -0.15 - Math.sin(pedTime.value * 9) * 0.12,
    };
    for (let i = 0; i < 4; i++) { const L = T.legs[i], v = Math.sin(T.ph + L.userData.ph), sx = L.userData.sx; base['leg' + i + 'y'] = v * 0.32 * w; base['leg' + i + 'x'] = Math.max(0, Math.cos(T.ph + L.userData.ph)) * 0.2 * w; base['leg' + i + 'z'] = i < 2 ? sx * 0.22 : 0; }
    for (let i = 0; i < 6; i++) { base['tail' + i + 'x'] = 0.12 + (st === 'roar' ? 0.35 : 0.05); base['tail' + i + 'y'] = Math.sin(pedTime.value * 1.4 - i * 0.6) * 0.16; }
    if (st === 'roar') { base.bodyX = -0.3; base.headX = -0.5; base.mandL = 0.9; base.mandR = -0.9; base.leg0z = -0.9; base.leg1z = 0.9; }
    const tgt = Object.assign(base, pose || {});
    for (const k in tgt) r.set(k, tgt[k]);
    for (let i = 0; i < 4; i++) { const L = T.legs[i], v = Math.sin(T.ph + L.userData.ph); if (w > 0.35 && T.lastStep[i] > 0 && v <= 0 && T.y < 1) { const p = T.w(L.userData.tip.clone().add(L.position).add(T.body.position)); stomp(p.x, p.z, 2.6, 3 + titans.fury * 0.15); } T.lastStep[i] = v; }
  }
  r.step(dt);
  // beam
  if (T.kind === 'vex' && T.act && T.act.name === 'beam') vexBeam(T, dt);
}

const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const beamCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 3.2), transparent: true, opacity: 1, depthWrite: false, fog: false });
function vexBeam(T, dt) {
  const a = T.act, foe = T.foe && !['gone', 'down', 'ko'].includes(T.foe.state) ? T.foe : null;
  const mouth = T.w(T.head.position.clone().add(T.body.position).add(new THREE.Vector3(0, 0, 6)));
  const aim = foe ? foe.pos.clone().setY(foe.y + foe.height * 0.55) : T.pos.clone().addScaledVector(T.fwd, 35).setY(5);
  if (a.i === 0) {
    const k = a.t / 0.9; T.glow.color.setRGB(0.25 + k * 2, 2.2 + k * 2, 3 + k);
    for (let i = 0; i < 3; i++) { const p = mouth.clone().add(new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6))); fire.emit(p.x, p.y, p.z, (mouth.x - p.x) * 3, (mouth.y - p.y) * 3, (mouth.z - p.z) * 3, 0.3, rnd(0.8, 1.5), 0.3, 0.9, 1, 1, -1, 0, 0); }
  } else if (a.i === 1) {
    if (!T.beam) { T.beam = new THREE.Group(); const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5); T.beam.add(new THREE.Mesh(g, beamMat), new THREE.Mesh(g, beamCore)); T.beam.children[1].scale.set(0.35, 0.35, 1); scene.add(T.beam); }
    const sweep = Math.sin(a.t * 3) * 5, end = aim.clone().addScaledVector(T.right, sweep), len = mouth.distanceTo(end);
    T.beam.visible = true; T.beam.position.copy(mouth); T.beam.lookAt(end); T.beam.scale.set(1.1 + Math.sin(pedTime.value * 40) * 0.2, 1.1, len);
    flashLight.position.copy(end); flashLight.color.setHex(0x60e0ff); flashLight.intensity = Math.max(flashLight.intensity, 1800);
    T.beamT = (T.beamT || 0) - dt;
    if (T.beamT <= 0) {
      T.beamT = 0.16;
      for (let i = 0; i < 6; i++) sparks.emit(end.x, end.y, end.z, rnd(-10, 10), rnd(0, 12), rnd(-10, 10), rnd(0.3, 0.8));
      for (let i = 0; i < 3; i++) fire.emit(end.x, end.y, end.z, rnd(-3, 3), rnd(0, 4), rnd(-3, 3), rnd(0.3, 0.6), rnd(2, 4), 0.4, 0.95, 1, 1, 2, 1, 0);
      if (foe && Math.hypot(foe.pos.x - end.x, foe.pos.z - end.z) < foe.radius + 4) {
        if (foe.block) { foe.hp = Math.max(1, foe.hp - 0.4); Sfx.clang(0); } else { foe.hp = Math.max(0, foe.hp - (1.1 + titans.fury * 0.12)); foe.flash = 1; foe.kb.addScaledVector(T.fwd, 1.5); if (foe.hp <= 0) knockOut(foe, T.fwd); }
      } else if (Math.random() < 0.35) blast(end, 3.5, 4.5, { noCrater: end.y > 2, noFire: true });
      beamDamage(mouth, end); addShake(0.08, end);
    }
  }
}

/* ---------- thrown boulders */
const titanRocks = [];
function titanRocksUpdate() {
  for (let i = titanRocks.length - 1; i >= 0; i--) {
    const it = titanRocks[i];
    if (!it || it.dead || !it.boulder) { titanRocks.splice(i, 1); continue; }
    const t = it.body.translation(), lv = it.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), b = it.boulder;
    for (const T of titans.list) {
      if (T === b.from || T.busy()) continue;
      if (Math.hypot(T.pos.x - t.x, T.pos.z - t.z) < T.radius + 2.5 && t.y < T.y + T.height + 2) {
        if (T.block) { Sfx.clang(soundDelay(T.pos)); popup('¡BLOQUEO!', '#cfd8e6'); T.hp = Math.max(1, T.hp - 3); }
        else applyHit(b.from, T, { dmg: 14, type: 'heavy' }, new THREE.Vector3(t.x, t.y, t.z));
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
    for (let i = 0; i < 14; i++) { const s = rnd(1.2, 2.6); addDebris(new THREE.Vector3(p.x + rnd(-8, 8), rnd(2, 10), p.z + rnd(-8, 8)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 3), rnd(0, 3), 0)), s, s * rnd(0.6, 1), s, new THREE.Color(0x4a403a), { x: rnd(-4, 4), y: rnd(0, 5), z: rnd(-4, 4) }, { x: rnd(-2, 2), y: rnd(-2, 2), z: rnd(-2, 2) }); }
    for (let i = 0; i < 40; i++) dust.emit(p.x + rnd(-9, 9), rnd(1, 10), p.z + rnd(-9, 9), rnd(-3, 3), rnd(0, 3), rnd(-3, 3), rnd(4, 8), rnd(5, 8), 0.4, 0.36, 0.32, 0.85, 1.8, 0.4);
    addFire(p, 14, 1.2); popup('BASALTO SE DESMORONA', '#ffb02e');
  } else {
    skyFlash = Math.max(skyFlash, 0.6);
    for (let i = 0; i < 60; i++) sparks.emit(p.x, 8, p.z, rnd(-18, 18), rnd(0, 25), rnd(-18, 18), rnd(0.5, 1.5));
    for (let i = 0; i < 25; i++) fire.emit(p.x + rnd(-6, 6), rnd(2, 14), p.z + rnd(-6, 6), 0, rnd(5, 15), 0, rnd(0.6, 1.2), rnd(3, 6), 0.3, 0.9, 1, 1, 1, 0.3, 0);
    popup('VEX ES ABDUCIDO', '#6ff0ff');
  }
  T.state = 'gone'; T.remove();
  const w = titans.list.find((x) => x !== T && x.state !== 'gone');
  if (w) setTimeout(() => popup(`¡GANA ${w.name.toUpperCase()}!`, w.kind === 'vex' ? '#6ff0ff' : '#ffb02e'), 900);
}

/* ---------- HUD, popups and voices */
function showTitanHud(on) {
  const el = $('#titan-hud'); el.hidden = !on;
  if (on) el.innerHTML = titans.list.map((T) => `<div class="tb ${T.kind}"><span>${T.name}</span><i><b data-k="${T.kind}"></b></i></div>`).join('');
}
function updateTitanHud() { for (const T of titans.list) { const b = document.querySelector(`#titan-hud b[data-k="${T.kind}"]`); if (b) b.style.width = T.hp + '%'; } }
let popTimer;
function popup(text, color) {
  const el = $('#fight-pop'); if (!el) return;
  el.textContent = text; el.style.color = color || '#fff';
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(popTimer); popTimer = setTimeout(() => el.classList.remove('go'), 1100);
}
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
// a punch: dull thump + crunchy noise; heavier hits go lower and longer
Sfx.punch = function (heavy, delay = 0) {
  if (!this.ok()) return;
  const c = this.ctx, t = c.currentTime + delay;
  const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(heavy ? 120 : 180, t); o.frequency.exponentialRampToValueAtTime(40, t + (heavy ? 0.35 : 0.18));
  og.gain.setValueAtTime(heavy ? 1 : 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.5 : 0.25));
  o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.6);
  const n = this.noiseSrc(t, heavy ? 0.6 : 0.3), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = heavy ? 700 : 1300; f.Q.value = 0.8;
  g.gain.setValueAtTime(heavy ? 0.7 : 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.55 : 0.25));
  n.connect(f); f.connect(g); g.connect(this.master);
};
Sfx.clang = function (delay = 0) {
  if (!this.ok()) return;
  const c = this.ctx, t = c.currentTime + delay;
  for (const fr of [620, 935, 1480]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = fr; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.8); }
  const n = this.noiseSrc(t, 0.2), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 2500; g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); n.connect(f); f.connect(g); g.connect(this.master);
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
