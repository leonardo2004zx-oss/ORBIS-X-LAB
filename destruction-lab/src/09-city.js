/* ------------------------------------------------------------------ city */
const PALETTE = [0xf1e3cf, 0xd9c2a5, 0xc9d3dc, 0xe6d6c3, 0xbfc7b6, 0xe8cdb8, 0xd4d7de, 0xf0e6d8, 0xc7b8a6, 0xdcc9d0];
const GLASS_TINTS = [0xd8e6f0, 0xc9dccf, 0xe4dccc, 0xc6cfe0, 0xdfe7e9];
const BRICK_TINTS = [0xffffff, 0xf0d8c8, 0xe0c0b0, 0xd8d0c8];
const METAL_TINTS = [0xffffff, 0xdfe6ee, 0xe8dccb, 0xc9d4c8];
let cityRand = 1;
function srand() { cityRand = (cityRand * 16807) % 2147483647; return (cityRand - 1) / 2147483646; }
const pickOf = (arr) => arr[Math.floor(srand() * arr.length)];

// Building types. Every piece is its own rigid body, so all of them can break and fall.
//  tower   – concrete with windows, darker lobby floor, AC units on the roof
//  glass   – curtain-wall skyscraper that narrows in its upper third, antenna on top
//  brick   – low brick building with a water tank
//  stepped – setbacks every few floors (wedding-cake skyline)
//  lshape  – L-shaped footprint
function addBuilding(cx, cz, wMeters, dMeters, floors, colorHex, type = 'tower') {
  const bs = Q.bs, fh = 3, gap = 0.012;
  const nx = Math.max(1, Math.round(wMeters / bs)), nz = Math.max(1, Math.round(dMeters / bs));
  const pool = type === 'glass' ? glassBlocks : type === 'brick' ? brickBlocks : type === 'stepped' ? stoneBlocks : type === 'lshape' || type === 'metal' ? metalBlocks : blocks;
  if (pool.items.length + nx * nz * floors > pool.cap) return false;
  const base = new THREE.Color(colorHex);
  const lobby = base.clone().multiplyScalar(0.62);
  const setbackAt = type === 'glass' ? Math.floor(floors * 0.62) : -1;
  let topF = 0;
  const roofCells = [];
  for (let f = 0; f < floors; f++) {
    let inset = 0;
    if (type === 'glass' && f >= setbackAt && nx >= 3 && nz >= 3) inset = 1;
    if (type === 'stepped') inset = Math.min(Math.floor(f / 4), Math.floor((Math.min(nx, nz) - 1) / 2));
    let placed = 0;
    for (let i = inset; i < nx - inset; i++) for (let k = inset; k < nz - inset; k++) {
      if (type === 'lshape' && i >= Math.ceil(nx / 2) && k >= Math.ceil(nz / 2)) continue;
      const c = (f === 0 && type !== 'brick' ? lobby : base).clone().multiplyScalar(0.94 + srand() * 0.08);
      const x = cx + (i - (nx - 1) / 2) * bs, z = cz + (k - (nz - 1) / 2) * bs;
      addBlock(x, f * fh + fh / 2 + 0.001, z, bs - gap, fh, bs - gap, c, true, pool);
      placed++;
      if (f === floors - 1) roofCells.push([x, z]);
    }
    if (!placed) break;
    topF = f;
    // record the top cells of each step for roof details
    if (type === 'stepped' && f < floors - 1 && Math.floor((f + 1) / 4) !== Math.floor(f / 4) && srand() < 0.6) roofCells.push(['ac', cx + (inset - (nx - 1) / 2) * bs, cz + (inset - (nz - 1) / 2) * bs, (f + 1) * fh]);
  }
  const roofY = (topF + 1) * fh + 0.002;
  const grey = new THREE.Color(0x9a9a98), dark = new THREE.Color(0x55585c);
  for (const cell of roofCells) {
    if (cell[0] === 'ac') { addBlock(cell[1], cell[3] + 0.36, cell[2], 1.2, 0.7, 0.9, grey, true, plainBlocks); continue; }
    if (srand() < (type === 'brick' ? 0.15 : 0.35)) addBlock(cell[0] + rnd(-0.3, 0.3), roofY + 0.35, cell[1] + rnd(-0.3, 0.3), 1.1, 0.7, 0.8, grey.clone().multiplyScalar(0.9 + srand() * 0.2), true, plainBlocks);
  }
  if ((type === 'tower' || type === 'metal') && roofCells.length > 3 && srand() < 0.6) { // elevator / stair housing
    const [x, z] = roofCells[Math.floor(srand() * roofCells.length)];
    addBlock(x, roofY + 1.1, z, Math.min(bs, 2) - 0.1, 2.2, Math.min(bs, 2) - 0.1, grey.clone().multiplyScalar(1.05), true, plainBlocks);
  }
  if (type === 'tower' && roofCells.length > 2 && srand() < 0.5) { const [x, z] = roofCells[roofCells.length - 1]; addBlock(x, roofY + 1.6, z, 0.12, 3.2, 0.12, dark, true, plainBlocks); addBlock(x, roofY + 3.25, z, 0.9, 0.1, 0.9, dark, true, plainBlocks); }
  if (type === 'glass' && roofCells.length) { const [x, z] = roofCells[Math.floor(roofCells.length / 2)]; const h = 3 + srand() * 4; addBlock(x, roofY + h / 2, z, 0.3, h, 0.3, dark, true, plainBlocks); }
  if (type === 'brick' && roofCells.length) { const [x, z] = roofCells[0]; addBlock(x, roofY + 0.9, z, 1.6, 1.8, 1.6, new THREE.Color(0x6e5848), true, plainBlocks); }
  return true;
}

/* small helper: merge simple parts into one vertex-colored mesh (1 draw call per prop) */
const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
const propMatFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
function mergeParts(parts) {
  const geos = parts.map(([g, c]) => [g.index ? g.toNonIndexed() : g, new THREE.Color(c)]);
  let n = 0; for (const [g] of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of geos) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function addProp(body, collider, obj, extra = {}) {
  scene.add(obj);
  const item = Object.assign({ kind: 'prop', body, collider, obj }, extra);
  props.push(item); colliderMap.set(collider.handle, item);
  return item;
}
/* instanced props: every tree / car type / lamp part is ONE draw call for all copies */
let propPoolId = 0;
class PropPool {
  constructor(geo, mat, cap, shadow = true) {
    this.id = 'pp' + (propPoolId++); this.cap = cap; this.items = [];
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); this.mesh.count = 0;
    this.mesh.castShadow = shadow; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  add(item, color) {
    if (this.items.length >= this.cap) return false;
    const i = this.items.length; item[this.id] = i; this.items.push(item);
    this.mesh.setColorAt(i, color || WHITE); this.mesh.instanceColor.needsUpdate = true; this.mesh.count = this.items.length;
    return true;
  }
  remove(item) {
    const i = item[this.id], last = this.items.pop();
    if (last !== item) { this.items[i] = last; last[this.id] = i; last.synced = false; this.mesh.setColorAt(i, last.pcolor || WHITE); this.mesh.instanceColor.needsUpdate = true; }
    this.mesh.count = this.items.length;
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}
const WHITE = new THREE.Color(1, 1, 1);
const PROP_POOLS = [];
function addPropInst(body, collider, pools, color, extra = {}) {
  const item = Object.assign({ kind: 'prop', body, collider, slots: pools, pcolor: color }, extra);
  for (const p of pools) if (!p.add(item, color)) { world.removeRigidBody(body); for (const q of pools) if (q.items[item[q.id]] === item) q.remove(item); return null; }
  props.push(item); colliderMap.set(collider.handle, item);
  return item;
}

const treeGeos = [];
function treeGeo(kind) {
  if (treeGeos[kind]) return treeGeos[kind];
  const trunk = [new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6).translate(0, -0.6, 0), 0x6b4a32];
  let g;
  if (kind === 0) g = mergeParts([trunk, [new THREE.IcosahedronGeometry(1.35, 0).scale(1, 1.15, 1).translate(0, 0.95, 0), 0x56873d]]);
  else if (kind === 1) g = mergeParts([trunk, [new THREE.ConeGeometry(1.4, 2.2, 7).translate(0, 0.6, 0), 0x2f6b3c], [new THREE.ConeGeometry(1.05, 1.8, 7).translate(0, 1.6, 0), 0x357a44]]);
  else g = mergeParts([trunk, [new THREE.IcosahedronGeometry(1.1, 0).translate(-0.5, 0.7, 0.2), 0x6d9440], [new THREE.IcosahedronGeometry(1.0, 0).translate(0.6, 1.0, -0.3), 0x5f8a3a]]);
  return (treeGeos[kind] = g);
}
function addTree(x, z, kind = Math.floor(srand() * 3)) {
  const h = 1.7;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, h, z).setSleeping(true).setAngularDamping(0.4));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, h, 0.55).setDensity(0.35).setFriction(0.8), body);
  if (!TREE_POOLS[kind]) PROP_POOLS.push(TREE_POOLS[kind] = new PropPool(treeGeo(kind), propMatFlat, 220));
  const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.85 + srand() * 0.3);
  addPropInst(body, collider, [TREE_POOLS[kind]], tint, { rotOff: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), srand() * 6), tree: true, sway: srand() * 6 });
}
const TREE_POOLS = [];

const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd28a, emissiveIntensity: 0 });
let lampGeo, lampHeadGeo;
function addLamp(x, z, facing) {
  lampGeo = lampGeo || mergeParts([[box(0.16, 6, 0.16, 0, 0, 0), 0x3a3d42], [box(0.1, 0.1, 1.4, 0, 2.9, 0.65), 0x3a3d42]]);
  lampHeadGeo = lampHeadGeo || box(0.35, 0.18, 0.6, 0, 2.82, 1.25);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 3.01, z).setRotation({ x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) }).setSleeping(true));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.15, 3, 0.15).setDensity(3).setFriction(0.8), body);
  if (!LAMP_POOLS.length) { LAMP_POOLS.push(new PropPool(lampGeo, propMat, 120), new PropPool(lampHeadGeo, lampMat, 120, false)); PROP_POOLS.push(...LAMP_POOLS); }
  const it = addPropInst(body, collider, LAMP_POOLS, WHITE, { lamp: true });
  if (it) addLampFX(it);
}
const LAMP_POOLS = [];

const CAR_COLORS = [0xc8372d, 0x2f5fa8, 0xe3e3e0, 0x2a2d33, 0x3f8f6b, 0x8a99a8, 0x7a3b5c, 0xd9d4c4];
const CAR_TYPES = {
  sedan: { L: 4.1, W: 1.84, H: 1.45, mass: 0.45 },
  taxi: { L: 4.1, W: 1.84, H: 1.45, mass: 0.45 },
  van: { L: 4.8, W: 2.0, H: 2.1, mass: 0.4 },
  bus: { L: 10.5, W: 2.5, H: 3.0, mass: 0.35 },
  truck: { L: 7.2, W: 2.3, H: 2.8, mass: 0.4 },
};
function carGeo(type, paint) {
  const T = CAR_TYPES[type], L = T.L, W = T.W, H = T.H, hy = H / 2;
  const glass = 0x1d2a38, wheel = 0x18191b;
  const parts = [];
  const wr = type === 'bus' || type === 'truck' ? 0.5 : 0.38;
  const wheels = type === 'bus' ? [L / 2 - 1.6, -L / 2 + 2] : type === 'truck' ? [L / 2 - 1.2, -L / 2 + 1.2, -L / 2 + 2.4] : [L / 2 - 0.8, -L / 2 + 0.8];
  for (const wx of wheels) for (const s of [-1, 1]) parts.push([new THREE.CylinderGeometry(wr, wr, 0.3, 10).rotateX(Math.PI / 2).translate(wx, -hy + wr, s * (W / 2 - 0.1)), wheel]);
  if (type === 'sedan' || type === 'taxi') {
    parts.push([box(L, 0.72, W, 0, -hy + 0.62, 0), paint]);
    parts.push([box(L * 0.52, 0.6, W * 0.9, -0.25, -hy + 1.27, 0), glass]);
    parts.push([box(L * 0.48, 0.08, W * 0.86, -0.25, -hy + 1.6, 0), paint]);
    if (type === 'taxi') parts.push([box(0.6, 0.2, 0.3, -0.25, -hy + 1.74, 0), 0xfff4c0]);
  } else if (type === 'van') {
    parts.push([box(L, 1.6, W, 0, -hy + 1.15, 0), paint]);
    parts.push([box(0.06, 0.6, W * 0.9, L / 2, -hy + 1.45, 0), glass]);
    parts.push([box(L * 0.7, 0.4, 0.06, -0.3, -hy + 1.5, W / 2), glass]); parts.push([box(L * 0.7, 0.4, 0.06, -0.3, -hy + 1.5, -W / 2), glass]);
  } else if (type === 'bus') {
    parts.push([box(L, 2.5, W, 0, -hy + 1.65, 0), paint]);
    parts.push([box(L * 0.92, 0.8, W + 0.04, 0, -hy + 2.1, 0), glass]);
    parts.push([box(L, 0.1, W, 0, -hy + 2.95, 0), 0xe8e8e8]);
  } else {
    parts.push([box(2.0, 2.0, W, L / 2 - 1.0, -hy + 1.45, 0), paint]);
    parts.push([box(0.06, 0.8, W * 0.9, L / 2, -hy + 1.8, 0), glass]);
    parts.push([box(L - 2.2, 2.4, W, -1.1, -hy + 1.6, 0), 0xdedcd6]);
  }
  return mergeParts(parts);
}
function addCar(x, z, rotY, type = 'sedan', drive = null) {
  const T = CAR_TYPES[type];
  const paint = type === 'taxi' ? 0xf2c230 : type === 'bus' ? pickOf([0x2f6fb0, 0xc23b2e, 0xe0a526]) : pickOf(CAR_COLORS);
  const q = { x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) };
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, T.H / 2 + 0.02, z).setRotation(q).setSleeping(!drive).setAngularDamping(0.3));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(T.L / 2, T.H / 2, T.W / 2).setDensity(T.mass).setFriction(0.9), body);
  if (!CAR_POOLS[type]) PROP_POOLS.push(CAR_POOLS[type] = new PropPool(carGeo(type, 0xffffff), propMat, 40));
  return addPropInst(body, collider, [CAR_POOLS[type]], new THREE.Color(paint), { car: true, sy: T.H, drive, type });
}
const CAR_POOLS = {};

/* the bridge over the river: deck slabs resting on pillars, all destructible */
function addBridge() {
  const z0 = 0, deckT = 0.6, asphalt = new THREE.Color(0x45484d), concrete = new THREE.Color(0xb9b4aa);
  const pillarH = -deckT - RIVER.floor; // from river bed to underside of deck
  for (const px of [RIVER.x0 + 0.5, (RIVER.x0 * 2 + RIVER.x1) / 3, (RIVER.x0 + RIVER.x1 * 2) / 3, RIVER.x1 - 0.5]) {
    for (const pz of [-3.4, 0, 3.4]) addBlock(px, RIVER.floor + pillarH / 2 + 0.001, z0 + pz, 1, pillarH, 1.2, concrete, true, plainBlocks);
  }
  const seg = (RIVER.x1 - RIVER.x0) / 3;
  for (let i = 0; i < 3; i++) {
    const cx = RIVER.x0 + seg * (i + 0.5);
    addBlock(cx, -deckT / 2 + 0.001, z0, seg - 0.03, deckT, 9, asphalt, true, plainBlocks);
    for (const s of [-1, 1]) addBlock(cx, 0.5, z0 + s * 4.35, seg - 0.05, 1, 0.22, concrete, true, plainBlocks);
  }
}

function populateCity() {
  cityRand = 11;
  const bs = Q.bs;
  const snap = (m) => Math.max(1, Math.round(m / bs)) * bs;
  for (const [x0, x1, z0, z1] of LOTS) {
    const front = z0 > 0 ? z0 : z1;          // side facing the main avenue
    const sgn = z0 > 0 ? 1 : -1;
    let x = x0 + 2.5;
    while (x < x1 - 7) {
      const roll = srand();
      const type = roll < 0.22 ? 'glass' : roll < 0.4 ? 'tower' : roll < 0.58 ? 'brick' : roll < 0.72 ? 'stepped' : roll < 0.86 ? 'metal' : 'lshape';
      let w = snap(type === 'stepped' || (type === 'glass' && srand() < 0.3) ? 8 : 6);
      if (x + w > x1 - 2.5) w = snap(x1 - 2.5 - x);
      if (w < 6) break;
      // small plazas break up the rows
      if (srand() < 0.2 && x1 - x0 > 20) { addTree(x + 2, front + sgn * 4); addTree(x + 4, front + sgn * 8); x += 7; continue; }
      const d = snap(type === 'lshape' || type === 'stepped' ? 8 : 6);
      const floors = type === 'metal' ? 5 + Math.floor(srand() * 5) : type === 'glass' ? 9 + Math.floor(srand() * 6) : type === 'brick' ? 3 + Math.floor(srand() * 3) : type === 'stepped' ? 7 + Math.floor(srand() * 4) : 4 + Math.floor(srand() * 5);
      const color = type === 'glass' ? pickOf(GLASS_TINTS) : type === 'brick' ? pickOf(BRICK_TINTS) : type === 'metal' ? pickOf(METAL_TINTS) : pickOf(PALETTE);
      addBuilding(x + w / 2, front + sgn * (2.5 + d / 2), w, d, floors, color, type);
      // a second, lower row behind on deep lots
      if (Math.abs(z1 - z0) > 22 && srand() < 0.4) {
        const d2 = snap(6), f2 = 2 + Math.floor(srand() * 3);
        addBuilding(x + w / 2, front + sgn * (2.5 + d + 3 + d2 / 2), Math.min(w, snap(6)), d2, f2, pickOf(PALETTE), srand() < 0.5 ? 'brick' : 'tower');
      }
      x += w + 3 + srand() * 3;
    }
  }
  // houses east of the river
  for (const [hx, hz] of [[74, 12], [84, 14], [76, -13], [88, -15]]) addBuilding(hx, hz, 6, 6, 2 + Math.floor(srand() * 2), pickOf(BRICK_TINTS), 'brick');
  addBridge();
  // trees: avenue sidewalks, parks north/south, riverside park
  for (let x = -76; x < 50; x += 11) { if (Math.abs(x) < 6 || Math.abs(x + 40) < 6 || Math.abs(x - 36) < 6) continue; addTree(x, 6.2, 0); addTree(x + 4, -6.2, 0); }
  for (let i = 0; i < 14; i++) addTree(rnd(-78, 48), rnd(35, 48));
  for (let i = 0; i < 10; i++) addTree(rnd(-78, 48), rnd(-55, -44));
  for (let i = 0; i < 10; i++) addTree(rnd(68, 98), rnd(-40, 40));
  // street lamps
  for (let x = -70; x < 50; x += 16) { if (Math.abs(x) < 5 || Math.abs(x + 40) < 5 || Math.abs(x - 36) < 5) continue; addLamp(x, 5.4, Math.PI); addLamp(x + 8, -5.4, 0); }
  // parked cars and moving traffic
  addCar(-60, -38.6, 0, 'van'); addCar(-20, -33.4, Math.PI, 'sedan'); addCar(14, -38.6, 0, 'truck'); addCar(26, -33.4, Math.PI, 'taxi');
  addCar(-40 + 2.2, 18, Math.PI / 2, 'sedan'); addCar(36 - 2.2, -20, -Math.PI / 2, 'van');
  const lanes = [{ z: -2.2, dir: 1 }, { z: 2.2, dir: -1 }];
  for (const L of lanes) for (let i = 0; i < 5; i++) {
    const type = i === 1 ? 'bus' : i === 3 ? 'taxi' : srand() < 0.2 ? 'van' : 'sedan';
    addCar(-90 + i * 38 + (L.dir < 0 ? 19 : 0), L.z, L.dir > 0 ? 0 : Math.PI, type, { dir: L.dir, z: L.z, speed: type === 'bus' ? 8 : 10 });
  }
}

/* moving traffic: lanes, traffic lights, following distance, braking or fleeing near danger.
   A car keeps its lane until something knocks it, then it becomes a free wreck. */
function trafficStep() {
  const drivers = props.filter((it) => it.drive && !it.dead);
  for (const it of drivers) {
    const d = it.drive, b = it.body, v = b.linvel(), r = b.rotation(), t = b.translation();
    const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
    if (d.v === undefined) d.v = d.speed;
    const dev = Math.hypot(v.x - d.dir * d.v, v.z);
    if (upY < 0.96 || (dev > 4 && it.driving) || t.y > 3 || t.y < -0.5) { it.drive = null; if (Math.random() < 0.4) addFire(new THREE.Vector3(t.x, t.y + 0.5, t.z), rnd(6, 12), 0.6); continue; }
    it.driving = true;
    let want = d.speed;
    // red light: stop before the crossing
    if (!LIGHTS.carsGo || (LIGHTS.t > LIGHTS.cycle[0] - 2.5 && !it.emergency)) {
      for (const L of lightXs()) {
        const stop = L.x - d.dir * (L.w / 2 + 4.2), ahead = (stop - t.x) * d.dir;
        if (ahead > -0.5 && ahead < 9 && !it.emergency) want = Math.min(want, Math.max(0, ahead - 1) * 1.2);
      }
    }
    // keep distance from the car in front
    for (const o of drivers) {
      if (o === it) continue;
      const ot = o.body.translation();
      if (Math.abs(ot.z - t.z) > 1.5) continue;
      const gap = (ot.x - t.x) * d.dir - ((CAR_TYPES[o.type] || CAR_TYPES.sedan).L + (CAR_TYPES[it.type] || CAR_TYPES.sedan).L) / 2;
      if (gap > -1 && gap < 10) want = Math.min(want, Math.max(0, gap - 2) * 1.5);
    }
    // danger: brake if it is ahead, speed away if it is behind
    for (const th of threats) {
      threatAt(th);
      const dx = th.x - t.x, dist = Math.hypot(dx, th.z - t.z);
      if (th.kind === 'tsunami' || dist > th.r * 1.2) continue;
      if (dx * d.dir > 0 && dist < th.r) want = Math.min(want, Math.max(0, dist - th.r * 0.6) * 0.4);
      else want = Math.max(want, 17);
    }
    if (d.stopX !== undefined && (d.stopX - t.x) * d.dir < 0) want = 0;   // emergency vehicle arrived
    d.v += Math.max(-9 * DT, Math.min(5 * DT, want - d.v));
    if (d.dir > 0 && t.x > 98) b.setTranslation({ x: -98, y: t.y, z: d.z }, true);
    if (d.dir < 0 && t.x < -98) b.setTranslation({ x: 98, y: t.y, z: d.z }, true);
    b.setLinvel({ x: d.dir * d.v, y: Math.min(v.y, 0), z: (d.z - t.z) * 2 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
