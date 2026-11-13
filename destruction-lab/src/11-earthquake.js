/* ------------------------------------------------------------------ earthquake */
// The ground is a kinematic body that really moves: friction carries the buildings, they rock and topple.
// Cracks and "structural fatigue" are simplified effects layered on top.
const quake = { on: false, intensity: 4, amp: 0, t: 0, wakeT: 0, dur: 20, epi: new THREE.Vector3(0, 0, 0), crackT: 0 };
const cracks = [];
const crackMat = new THREE.MeshBasicMaterial({ color: 0x150f0b, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
const crackEdgeMat = new THREE.MeshBasicMaterial({ color: 0x5a4a3a, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
function setQuakeEpicenter(p) { quake.epi.set(p.x, 0, p.z); }
function newCrack(from, ang, len) {
  if (cracks.length >= 18) return;
  const c = { pts: [new THREE.Vector2(from.x, from.z)], ang, len, grow: 0, w: 0, wMax: 0.25 + quake.intensity * 0.13, mesh: null, edge: null };
  c.mesh = new THREE.Mesh(new THREE.BufferGeometry(), crackMat); c.edge = new THREE.Mesh(new THREE.BufferGeometry(), crackEdgeMat);
  c.mesh.position.y = 0.16; c.edge.position.y = 0.15;
  groundGroup.add(c.edge, c.mesh); cracks.push(c);
}
function crackGeometry(c, mesh, widthMul) {
  const P = c.pts, n = P.length; if (n < 2) return;
  const pos = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.y - a.y; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const taper = Math.min(1, i / 2, (n - 1 - i) / 2 + 0.25);
    const w = c.w * widthMul * (0.5 + 0.5 * taper) * (0.7 + 0.3 * Math.sin(i * 2.3));
    pos.set([P[i].x - dz * w, 0, P[i].y + dx * w, P[i].x + dz * w, 0, P[i].y - dx * w], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  mesh.geometry.dispose();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  mesh.geometry = g;
}
function updateCracks(dt) {
  if (quake.on && quake.intensity >= 5) {
    quake.crackT -= dt;
    if (quake.crackT <= 0) {
      quake.crackT = rnd(0.8, 2.2) * (12 - quake.intensity) / 6;
      const a = rnd(0, Math.PI * 2), r = rnd(0, 10);
      newCrack(new THREE.Vector3(quake.epi.x + Math.cos(a) * r, 0, quake.epi.z + Math.sin(a) * r), a + rnd(-0.6, 0.6), 18 + quake.intensity * 5 + rnd(0, 15));
    }
  }
  for (const c of cracks) {
    let changed = false;
    if (c.w < c.wMax && quake.amp > 0.1) { c.w = Math.min(c.wMax, c.w + dt * 0.5 * quake.amp); changed = true; }
    if (c.grow < c.len && quake.amp > 0.2) {
      c.grow += dt * (6 + quake.intensity * 2);
      const last = c.pts[c.pts.length - 1], want = Math.floor(c.grow / 1.8);
      if (want >= c.pts.length) {
        c.ang += rnd(-0.45, 0.45);
        const p = new THREE.Vector2(last.x + Math.cos(c.ang) * 1.8, last.y + Math.sin(c.ang) * 1.8);
        c.pts.push(p); changed = true;
        dust.emit(p.x, 0.4, p.y, rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(1.2, 2.4), rnd(1.4, 2.4), 0.55, 0.5, 0.44, 0.6, 1.4, 1);
        if (Math.random() < 0.08 && c.pts.length > 3) newCrack(new THREE.Vector3(p.x, 0, p.y), c.ang + (Math.random() < 0.5 ? 1 : -1) * rnd(0.6, 1.1), c.len * 0.4);
        // a crack opening under a building breaks its base
        if (quake.intensity >= 7) {
          let n = 0;
          for (const it of allBlocks()) {
            const t = it.body.translation();
            if (t.y < 3.5 && Math.abs(t.x - p.x) < 2.2 && Math.abs(t.z - p.y) < 2.2 && n++ < 2) fragment(it, null, 2);
          }
        }
      }
    }
    if (changed) { crackGeometry(c, c.mesh, 1); crackGeometry(c, c.edge, 1.9); }
  }
}
function clearCracks() { for (const c of cracks) { groundGroup.remove(c.mesh, c.edge); c.mesh.geometry.dispose(); c.edge.geometry.dispose(); } cracks.length = 0; }

function quakeStep(dt) {
  if (quake.on && quake.t > quake.dur) setQuake(false);
  const target = quake.on ? 1 : 0;
  quake.amp += (target - quake.amp) * Math.min(1, dt * (quake.on ? 1.2 : 2.0));
  if (quake.amp < 0.002 && !quake.on) {
    if (quake.amp !== 0) { quake.amp = 0; groundBody.setNextKinematicTranslation({ x: 0, y: GROUND_Y, z: 0 }); }
    return;
  }
  quake.t += dt;
  // displacement amplitude grows with intensity: 10 → ~0.5 m, peak acceleration ≈ 2 g
  const w1 = 2 * Math.PI * 1.05, w2 = 2 * Math.PI * 2.3;
  const A1 = 0.05 * quake.intensity * (0.6 + quake.intensity * 0.04), A2 = A1 * 0.22;
  const t = quake.t, s = quake.amp;
  // extreme quakes add sudden vertical jolts
  const jolt = quake.intensity >= 8 ? Math.max(0, Math.sin(t * 0.9) - 0.85) * 2.4 * (quake.intensity - 7) * 0.12 : 0;
  const x = s * (A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t + 1.3));
  const z = s * (0.8 * A1 * Math.sin(w1 * 1.13 * t + 0.7) + A2 * Math.sin(w2 * 0.91 * t + 2.1));
  const y = s * (0.25 * A2 * Math.sin(w2 * 1.37 * t) + jolt * Math.sin(t * 40));
  groundBody.setNextKinematicTranslation({ x, y: GROUND_Y + y, z });
  quake.wakeT -= dt;
  if (quake.wakeT <= 0) {
    quake.wakeT = 0.4;
    // structural fatigue: strong shaking breaks pieces (lower floors and pieces near the epicenter first)
    const over = Math.max(0, quake.intensity - 2) * quake.amp;
    const pBase = 0.4 * 0.00045 * over * over;
    const list = allBlocks();
    if (pBase > 0) {
      let n = 0;
      for (const it of list) {
        const p = it.body.translation();
        const near = 1.7 - Math.min(1.4, Math.hypot(p.x - quake.epi.x, p.z - quake.epi.z) / 50);
        if (Math.random() < pBase * near * (1.6 - Math.min(1.2, p.y / 18)) && n++ < 14) fragment(it, null, 1 + quake.intensity * 0.2);
      }
    }
    for (const it of list) if (!it.dead) it.body.wakeUp();
    for (const it of debris.items) it.body.wakeUp();
    for (const it of props) it.body.wakeUp();
  }
}
