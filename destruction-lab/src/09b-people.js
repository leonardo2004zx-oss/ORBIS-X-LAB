/* ------------------------------------------------------------------ threats: what people and drivers react to */
// kind: meteor | blast | tornado | quake | tsunami | volcano | blackhole | storm | evac
// r = distance at which people notice it, core = distance at which they are knocked down (no injuries shown)
const threats = [];
let threatId = 0;
function addThreat(kind, x, z, r, life, opts = {}) {
  const t = Object.assign({ id: ++threatId, kind, x, z, r, core: 0, until: simTime + life, born: simTime }, opts);
  threats.push(t);
  if (t.siren !== false && r > 25) sirenUntil = Math.max(sirenUntil, simTime + Math.min(30, life + 12));
  return t;
}
function threatAt(t) { if (t.follow) { const p = t.follow(); if (p) { t.x = p.x; t.z = p.z; } } return t; }
function pruneThreats() { for (let i = threats.length - 1; i >= 0; i--) if (simTime > threats[i].until) threats.splice(i, 1); }
// an impact: people inside the core fall down for a moment and get up running
function impactAt(x, z, core, alert) {
  for (const p of peds) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < core) knockDown(p, x, z);
    else if (d < alert) scare(p, { x, z, r: alert, kind: 'blast', until: simTime + 6 }, d * 0.012);
  }
}

/* ------------------------------------------------------------------ walkable network: sidewalks, crossings, parks */
const NAV = { nodes: [], safe: [] };
function navNode(x, z, safe = false) { const n = { i: NAV.nodes.length, x, z, nb: [], safe }; NAV.nodes.push(n); if (safe) NAV.safe.push(n); return n; }
function navLink(a, b, cross = null) { a.nb.push({ n: b, cross }); b.nb.push({ n: a, cross }); }
function buildNav() {
  NAV.nodes.length = 0; NAV.safe.length = 0;
  const inset = 1.9, corners = [];
  for (const [x0, x1, z0, z1] of LOTS) {
    // corners plus mid points on long sides so walkers spread out
    const c = [navNode(x0 + inset, z0 + inset), navNode(x1 - inset, z0 + inset), navNode(x1 - inset, z1 - inset), navNode(x0 + inset, z1 - inset)];
    const mids = [];
    for (let k = 0; k < 4; k++) {
      const a = c[k], b = c[(k + 1) % 4], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / 12));
      let prev = a;
      for (let j = 1; j < n; j++) { const m = navNode(a.x + (b.x - a.x) * j / n, a.z + (b.z - a.z) * j / n); navLink(prev, m); prev = m; mids.push(m); }
      navLink(prev, b);
    }
    corners.push(...c);
  }
  // street crossings between aligned corners of neighbouring blocks
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) {
    const a = corners[i], b = corners[j], dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
    if (dx < 0.5 && dz > 6 && dz < 15) navLink(a, b, { axis: 'z', street: STREETS.find((s) => s.axis === 'x' && Math.abs(s.c - (a.z + b.z) / 2) < 3) || null });
    else if (dz < 0.5 && dx > 6 && dx < 15) navLink(a, b, { axis: 'x', street: null });
  }
  // parks north and south are the safe zones
  for (const c of corners) {
    if (Math.abs(c.z - (30 - inset)) < 0.1) { const s = navNode(c.x, 40 + rnd(-2, 2), true); navLink(c, s); }
    if (Math.abs(c.z - (-32 + inset)) < 0.1) { const s = navNode(c.x, -46 + rnd(-2, 2), true); navLink(c, s, { axis: 'z', street: null }); }
  }
  // next hop toward the nearest safe zone (multi-source BFS)
  const dist = new Array(NAV.nodes.length).fill(Infinity), q = [];
  for (const s of NAV.safe) { dist[s.i] = 0; s.toSafe = null; q.push(s); }
  while (q.length) {
    const n = q.shift();
    for (const { n: m } of n.nb) if (dist[m.i] === Infinity) { dist[m.i] = dist[n.i] + 1; m.toSafe = n; q.push(m); }
  }
}

/* ------------------------------------------------------------------ traffic lights on the main avenue */
const LIGHTS = { t: 0, carsGo: true, cycle: [13, 7] };
const signalCarMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x30ff60, emissiveIntensity: 2 });
const signalPedMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff3020, emissiveIntensity: 2 });
const lightXs = () => STREETS.filter((s) => s.axis === 'z').map((s) => ({ x: s.c, w: s.w }));
function buildSignals() {
  const poles = [], carHeads = [], pedHeads = [];
  for (const { x, w } of lightXs()) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = x + sx * (w / 2 + 0.6), pz = sz * 5.2;
    poles.push(box(0.12, 3.2, 0.12, px, 1.6, pz)); poles.push(box(0.1, 0.1, 1.6, px, 3.1, pz - sz * 0.8));
    carHeads.push(box(0.28, 0.7, 0.28, px, 2.75, pz - sz * 1.5));
    pedHeads.push(box(0.22, 0.3, 0.22, px + sx * 0.2, 2.1, pz));
  }
  const g = (list, c) => mergeParts(list.map((x) => [x, c]));
  const pole = new THREE.Mesh(g(poles, 0x34373c), propMat); pole.castShadow = true;
  decor.add(pole, new THREE.Mesh(mergeGeos(carHeads), signalCarMat), new THREE.Mesh(mergeGeos(pedHeads), signalPedMat));
  // benches and street signs
  const benches = [], signs = [];
  for (const [x0, x1, z0, z1] of LOTS) {
    const zEdge = z0 > 0 ? z0 + 0.9 : z1 - 0.9;
    for (let x = x0 + 9; x < x1 - 6; x += 15) benches.push(box(1.6, 0.1, 0.5, x, 0.5, zEdge), box(1.6, 0.5, 0.08, x, 0.75, zEdge + (z0 > 0 ? -0.25 : 0.25)), box(0.08, 0.45, 0.4, x - 0.7, 0.25, zEdge), box(0.08, 0.45, 0.4, x + 0.7, 0.25, zEdge));
    signs.push(box(0.08, 2.6, 0.08, x0 + 0.7, 1.3, z0 > 0 ? z0 + 0.7 : z1 - 0.7), box(1.1, 0.28, 0.04, x0 + 0.7, 2.5, z0 > 0 ? z0 + 0.7 : z1 - 0.7));
  }
  const bm = new THREE.Mesh(g(benches, 0x6b4e33), propMat); bm.castShadow = true; groundDecor.add(bm);
  groundDecor.add(new THREE.Mesh(g(signs, 0x2d6a46), propMat));
}
function updateLights(dt) {
  LIGHTS.t += dt;
  const span = LIGHTS.carsGo ? LIGHTS.cycle[0] : LIGHTS.cycle[1];
  if (LIGHTS.t > span) { LIGHTS.t = 0; LIGHTS.carsGo = !LIGHTS.carsGo; }
  const amber = LIGHTS.carsGo && LIGHTS.t > LIGHTS.cycle[0] - 2.5;
  signalCarMat.emissive.setHex(LIGHTS.carsGo ? (amber ? 0xffa020 : 0x30ff60) : 0xff2a1a);
  signalPedMat.emissive.setHex(LIGHTS.carsGo ? 0xff3020 : 0xf0f6ff);
}
const pedsMayCross = () => !LIGHTS.carsGo && LIGHTS.t < LIGHTS.cycle[1] - 2.5;

/* ------------------------------------------------------------------ people: one instanced mesh, limbs animated in the shader */
// parts: 0 torso, 1/2 legs, 3/4 arms, 5 head, 6 hair. Clothes, skin and hair vary per person.
function personGeo() {
  const parts = [], part = [];
  const add = (g, id) => { const ng = g.toNonIndexed(); parts.push(ng); part.push(...new Array(ng.attributes.position.count).fill(id)); };
  add(new THREE.BoxGeometry(0.42, 0.6, 0.24).translate(0, 1.18, 0), 0);
  add(new THREE.BoxGeometry(0.17, 0.86, 0.19).translate(-0.11, 0.43, 0), 1);
  add(new THREE.BoxGeometry(0.17, 0.86, 0.19).translate(0.11, 0.43, 0), 2);
  add(new THREE.BoxGeometry(0.12, 0.62, 0.14).translate(-0.29, 1.17, 0), 3);
  add(new THREE.BoxGeometry(0.12, 0.62, 0.14).translate(0.29, 1.17, 0), 4);
  add(new THREE.BoxGeometry(0.22, 0.24, 0.22).translate(0, 1.62, 0), 5);
  add(new THREE.BoxGeometry(0.24, 0.08, 0.24).translate(0, 1.77, -0.01), 6);
  const g = mergeGeos(parts);
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(part.length * 3).fill(1), 3));
  return g;
}
const PED_MAX = 260;
const pedTime = { value: 0 };
let pedMesh = null, pedPhase, pedGait, pedPants, pedSkin;
function buildPeople() {
  const g = personGeo();
  pedPhase = new THREE.InstancedBufferAttribute(new Float32Array(PED_MAX), 1);
  pedGait = new THREE.InstancedBufferAttribute(new Float32Array(PED_MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
  pedPants = new THREE.InstancedBufferAttribute(new Float32Array(PED_MAX * 3), 3);
  pedSkin = new THREE.InstancedBufferAttribute(new Float32Array(PED_MAX * 3), 3);
  g.setAttribute('aPhase', pedPhase); g.setAttribute('aGait', pedGait); g.setAttribute('aPants', pedPants); g.setAttribute('aSkin', pedSkin);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = pedTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aPart; attribute float aPhase; attribute vec2 aGait; attribute vec3 aPants; attribute vec3 aSkin; uniform float uT;
      vec3 rotX(vec3 p, float a, float pivot){ p.y -= pivot; float c = cos(a), s = sin(a); p = vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); p.y += pivot; return p; }`)
      .replace('#include <begin_vertex>', `vec3 transformed = position;
        float sw = sin(uT * aGait.y + aPhase) * aGait.x;
        if (aPart > 0.5 && aPart < 1.5) transformed = rotX(transformed, sw, 0.86);
        else if (aPart > 1.5 && aPart < 2.5) transformed = rotX(transformed, -sw, 0.86);
        else if (aPart > 2.5 && aPart < 3.5) transformed = rotX(transformed, -sw * 0.9 - aGait.x * 0.25, 1.46);
        else if (aPart > 3.5 && aPart < 4.5) transformed = rotX(transformed, sw * 0.9 - aGait.x * 0.25, 1.46);
        if (aPart < 0.5 || aPart > 4.5) transformed = rotX(transformed, -aGait.x * 0.18, 0.86);
        transformed.y += abs(sin(uT * aGait.y + aPhase)) * aGait.x * 0.06;`)
      .replace('#include <color_vertex>', `
        #ifdef USE_INSTANCING_COLOR
        vec3 shirt = instanceColor;
        #else
        vec3 shirt = vec3(0.6);
        #endif
        vColor = aPart < 0.5 ? shirt : aPart < 2.5 ? aPants : aPart < 4.5 ? mix(shirt, aSkin, 0.15) : aPart < 5.5 ? aSkin : vec3(0.12, 0.08, 0.06) + aPants * 0.15;`);
  };
  pedMesh = new THREE.InstancedMesh(g, mat, PED_MAX);
  pedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pedMesh.setColorAt(0, WHITE); pedMesh.count = 0; pedMesh.frustumCulled = false; pedMesh.castShadow = false;
  scene.add(pedMesh);
}
const SHIRTS = [0xc8372d, 0x2f5fa8, 0xe8e4da, 0x3f8f6b, 0xe0a526, 0x7a3b5c, 0x2a2d33, 0xd9786a, 0x6aa3c8, 0xb0b53a];
const PANTS = [0x1f2a44, 0x2a2d33, 0x5a4a3a, 0x3d4f6b, 0x7d7468, 0x1d1d1d];
const SKINS = [0xf1c8a8, 0xd9a47c, 0xa8724f, 0x7a4e32, 0xe8b996];
const peds = [];
function spawnPeople() {
  peds.length = 0;
  const n = { bajo: 60, medio: 130, alto: 220 }[settings.quality] || 120;
  const walkable = NAV.nodes.filter((nd) => !nd.safe);
  for (let i = 0; i < n; i++) {
    const a = walkable[Math.floor(Math.random() * walkable.length)];
    const b = a.nb[Math.floor(Math.random() * a.nb.length)].n;
    const k = Math.random();
    const p = { i, from: a, to: b, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dir: 0, lat: rnd(-0.35, 0.35), base: rnd(1.0, 1.6), speed: 1.3,
      state: 'walk', t: 0, react: 0, threat: null, scale: rnd(0.88, 1.08), wait: 0, down: 0, yaw: 0, cross: null };
    peds.push(p);
    pedPhase.setX(i, Math.random() * 6.28);
    pedPants.setXYZ(i, ...new THREE.Color(pickOf(PANTS)).toArray());
    pedSkin.setXYZ(i, ...new THREE.Color(pickOf(SKINS)).toArray());
    pedMesh.setColorAt(i, new THREE.Color(pickOf(SHIRTS)).multiplyScalar(rnd(0.8, 1.05)));
  }
  pedPhase.needsUpdate = pedPants.needsUpdate = pedSkin.needsUpdate = true; pedMesh.instanceColor.needsUpdate = true;
  pedMesh.count = n;
}
function scare(p, th, extraDelay = 0) {
  if (p.state === 'down') return;
  const d = Math.hypot(p.x - th.x, p.z - th.z);
  // closer people notice first; far ones later, so the whole city never reacts at once
  const delay = 0.2 + (d / th.r) * 1.6 + Math.random() * 0.9 + extraDelay;
  if (p.threat === th && (p.state === 'alert' || p.state === 'flee' || p.state === 'safe')) return;   // already reacting to it
  if (p.threat && p.threat !== th && (p.state === 'flee' || p.state === 'alert') && Math.hypot(p.x - p.threat.x, p.z - p.threat.z) < d) return;
  p.threat = th;
  if (p.state === 'flee') return;
  if (p.state === 'alert') { p.react = Math.min(p.react, delay); return; }
  p.state = 'alert'; p.react = delay;
}
function knockDown(p, x, z) { p.state = 'down'; p.down = rnd(1.4, 2.6); p.threat = { x, z, r: 40, kind: 'blast', until: simTime + 5 }; p.yaw = Math.atan2(p.x - x, p.z - z); }
function pickNext(p) {
  const cur = p.to, prev = p.from;
  let opts = cur.nb.filter((e) => e.n !== prev);
  if (!opts.length) opts = cur.nb;
  if (p.state === 'flee' && p.threat) {
    const th = threatAt(p.threat);
    let best = null, bs = -Infinity;
    for (const e of cur.nb) {
      let sc;
      if (th.kind === 'tsunami') sc = e.n.x * th.dx + e.n.z * th.dz;           // run ahead of the water, toward high ground
      else sc = Math.hypot(e.n.x - th.x, e.n.z - th.z);
      if (cur.toSafe === e.n) sc += 6; if (e.n.safe) sc += 10; if (e.n === prev) sc -= 4;
      if (sc > bs) { bs = sc; best = e; }
    }
    return best;
  }
  if (p.state === 'evac') return cur.nb.find((e) => e.n === cur.toSafe) || opts[0];
  if (cur.safe && !p.parkLeft) { opts = cur.nb; }
  return opts[Math.floor(Math.random() * opts.length)];
}
const pedM = new THREE.Matrix4(), pedQ = new THREE.Quaternion(), pedP = new THREE.Vector3(), pedS = new THREE.Vector3(), pedE = new THREE.Euler();
let pedCheck = 0, fleeingNear = 0;
function updatePeople(dt) {
  if (!pedMesh || !pedMesh.count) return;
  pedTime.value += dt;
  pruneThreats();
  // staggered threat checks: a quarter of the crowd per frame
  pedCheck = (pedCheck + 1) % 4;
  fleeingNear = 0;
  const cam = camera.position;
  for (const p of peds) {
    if (p.i % 4 === pedCheck && p.state !== 'down') {
      for (const th of threats) {
        threatAt(th);
        let d;
        if (th.kind === 'tsunami') { const ahead = (p.x * th.dx + p.z * th.dz) - th.front(); d = ahead < 0 ? 0 : ahead; }
        else d = Math.hypot(p.x - th.x, p.z - th.z);
        if (d < th.r) scare(p, th);
      }
      if (evacuation && p.state === 'walk') { p.state = 'evac'; p.react = Math.random() * 2; }
    }
    // state machine
    if (p.state === 'alert') { p.react -= dt; if (p.react <= 0) { p.state = 'flee'; p.cross = null; } }
    if (p.state === 'down') { p.down -= dt; if (p.down <= 0) { p.state = 'flee'; } }
    if ((p.state === 'flee' || p.state === 'safe') && p.threat && simTime > (p.threat.until || 0) + 3) {
      const d = Math.hypot(p.x - p.threat.x, p.z - p.threat.z);
      if (d > (p.threat.r || 30) * 0.8 || p.threat.until) { p.state = evacuation ? 'evac' : 'calm'; p.t = rnd(3, 8); p.threat = null; }
    }
    if (p.state === 'calm') { p.t -= dt; if (p.t <= 0) p.state = 'walk'; }
    const running = p.state === 'flee' || p.state === 'evac';
    const target = p.state === 'down' ? 0 : p.state === 'alert' ? 0.2 : p.state === 'safe' || p.wait > 0 ? 0 : running ? p.base * 3.2 : p.state === 'calm' ? p.base * 0.8 : p.base;
    p.speed += (target - p.speed) * Math.min(1, dt * 3);
    // wait at the avenue for the pedestrian light (people running away ignore it)
    if (p.wait > 0) { p.wait -= dt; if (pedsMayCross() || running) p.wait = 0; }
    // move along the current edge
    const dx = p.to.x - p.x, dz = p.to.z - p.z, dist = Math.hypot(dx, dz);
    const step = p.speed * dt;
    if (dist <= step || dist < 0.05) {
      p.x = p.to.x; p.z = p.to.z;
      if (p.to.safe && (p.state === 'flee' || p.state === 'evac')) {
        if (!p.to.spot) { const a = Math.random() * 6.28, r = rnd(2, 9); p.from = p.to; p.to = { x: p.to.x + Math.cos(a) * r, z: p.to.z + Math.sin(a) * r, nb: p.to.nb, safe: true, spot: true, toSafe: null }; continue; }
        p.state = 'safe'; p.t = rnd(6, 14);
      }
      if (p.state === 'safe') { p.t -= dt; if (p.t <= 0 && !p.threat && !evacuation) p.state = 'walk'; }
      else {
        const e = pickNext(p);
        if (e) {
          if (e.cross && e.cross.street && !running && !pedsMayCross()) { p.wait = 0.5; continue; }
          p.from = p.to; p.to = e.n;
        }
      }
    } else if (p.wait <= 0) { p.x += dx / dist * step; p.z += dz / dist * step; p.dir = Math.atan2(dx, dz); }
    // render
    const yaw = p.state === 'alert' && p.threat ? Math.atan2(p.threat.x - p.x, p.threat.z - p.z) : p.dir;
    p.yaw += Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * Math.min(1, dt * 8);
    const lx = Math.cos(p.dir) * p.lat, lz = -Math.sin(p.dir) * p.lat;
    pedP.set(p.x + lx, 0.1, p.z + lz);
    if (p.state === 'down') { pedE.set(-Math.PI / 2, p.yaw, 0, 'YXZ'); pedP.y = 0.25; } else pedE.set(0, p.yaw, 0);
    pedQ.setFromEuler(pedE); pedS.setScalar(p.scale);
    pedM.compose(pedP, pedQ, pedS);
    pedMesh.setMatrixAt(p.i, pedM);
    const amp = p.state === 'down' ? 0 : Math.min(1.0, p.speed * 0.32), freq = 3.2 + p.speed * 2.1;
    pedGait.setXY(p.i, amp, freq);
    if (running && Math.abs(p.x - cam.x) + Math.abs(p.z - cam.z) < 80) fleeingNear++;
  }
  pedMesh.instanceMatrix.needsUpdate = true; pedGait.needsUpdate = true;
}

/* ------------------------------------------------------------------ evacuation, sirens and emergency vehicles */
let evacuation = false, sirenUntil = 0;
function setEvacuation(on) {
  evacuation = on;
  if (on) { sirenUntil = simTime + 40; toast('Evacuación: todos hacia los parques'); }
  else { for (const p of peds) if (p.state === 'evac' || p.state === 'safe') { p.state = 'calm'; p.t = rnd(1, 4); } toast('Evacuación terminada'); }
  refreshRunning();
}
const emergency = [];
const flashRed = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 3 });
const flashBlue = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2050ff, emissiveIntensity: 3 });
function dispatchEmergency(x, z) {
  if (emergency.length >= 3 || !world) return;
  const dir = x > 0 ? -1 : 1, laneZ = dir > 0 ? -2.2 : 2.2;
  const type = emergency.length % 2 ? 'van' : 'sedan';
  const T = CAR_TYPES[type];
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-dir * 98, T.H / 2 + 0.02, laneZ).setRotation({ x: 0, y: dir > 0 ? 0 : 1, z: 0, w: dir > 0 ? 1 : 0 }).setAngularDamping(0.3));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(T.L / 2, T.H / 2, T.W / 2).setDensity(T.mass).setFriction(0.9), body);
  const obj = new THREE.Group();
  const m = new THREE.Mesh(carGeo(type, type === 'van' ? 0xf2f2ee : 0x1d2b4a), propMat); m.castShadow = true; obj.add(m);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.5), flashRed), b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.5), flashBlue);
  r.position.set(-0.2, T.H / 2 + 0.08, -0.3); b.position.set(-0.2, T.H / 2 + 0.08, 0.3); obj.add(r, b);
  const it = addProp(body, collider, obj, { car: true, sy: T.H, emergency: true, drive: { dir, z: laneZ, speed: 15, v: 15, stopX: x - dir * 18 } });
  emergency.push(it);
}
function updateEmergency(dt) {
  const on = Math.sin(pedTime.value * 14) > 0;
  flashRed.emissiveIntensity = on ? 3.5 : 0.2; flashBlue.emissiveIntensity = on ? 0.2 : 3.5;
  for (let i = emergency.length - 1; i >= 0; i--) if (emergency[i].dead) emergency.splice(i, 1);
  const s = simTime < sirenUntil || emergency.some((e) => e.drive) ? 1 : 0;
  Sfx.siren(s);
}
function clearPeople() { threats.length = 0; evacuation = false; sirenUntil = 0; emergency.length = 0; for (const p of peds) { p.state = 'walk'; p.threat = null; } }
