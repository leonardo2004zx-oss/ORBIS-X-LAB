/* ------------------------------------------------------------------ physics world */
let world, groundBody, eventQueue;
const colliderMap = new Map();
const props = [];        // {kind:'prop', body, obj}
let debrisQueue = [];
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpM = new THREE.Matrix4();
const GROUND_Y = -0.5;

function createWorld() {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, GROUND_Y, 0));
  // land west of the river, land east of it, and the river bed (the channel walls are the land edges)
  const W = (RIVER.x0 + 160) / 2, E = (160 - RIVER.x1) / 2;
  world.createCollider(RAPIER.ColliderDesc.cuboid(W, 0.5, 160).setTranslation(RIVER.x0 - W, 0, 0).setFriction(0.95), groundBody);
  world.createCollider(RAPIER.ColliderDesc.cuboid(E, 0.5, 160).setTranslation(RIVER.x1 + E, 0, 0).setFriction(0.95), groundBody);
  world.createCollider(RAPIER.ColliderDesc.cuboid((RIVER.x1 - RIVER.x0) / 2 + 0.5, 0.5, 160).setTranslation((RIVER.x0 + RIVER.x1) / 2, RIVER.floor, 0).setFriction(0.9), groundBody);
}

function addBlock(x, y, z, sx, sy, sz, color, sleeping = true, pool = blocks, rotY = 0) {
  if (pool.items.length >= pool.cap) return null;
  const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setSleeping(sleeping).setLinearDamping(0.05).setAngularDamping(0.15);
  if (rotY) bd.setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) });
  const body = world.createRigidBody(bd);
  const mass = sx * sy * sz;
  const cd = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setDensity(1).setFriction(0.65).setRestitution(0.02)
    .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(mass * 9.81 * 55);
  const collider = world.createCollider(cd, body);
  const item = { kind: 'block', body, collider, sx, sy, sz, color, breakForce: mass * 9.81 * 55, born: simTime };
  colliderMap.set(collider.handle, item);
  pool.add(item, color);
  return item;
}

function addDebris(p, q, sx, sy, sz, color, v, w) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(q)
    .setLinvel(v.x, v.y, v.z).setAngvel(w).setLinearDamping(0.1).setAngularDamping(0.3));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setDensity(1).setFriction(0.85).setRestitution(0.05), body);
  const item = { kind: 'debris', body, collider, sx, sy, sz, color, born: simTime };
  if (!debris.add(item, color)) { world.removeRigidBody(body); return null; }
  debrisQueue.push(item);
  return item;
}

function removeItem(item) {
  if (item.dead) return;
  item.dead = true;
  if (item.collider) colliderMap.delete(item.collider.handle);
  world.removeRigidBody(item.body);
  if (item.pool) item.pool.remove(item);
  if (item.slots) for (const p of item.slots) p.remove(item);
  if (item.obj) scene.remove(item.obj);
  if (item.kind === 'prop') { const i = props.indexOf(item); if (i >= 0) props.splice(i, 1); }
}

function enforceDebrisCap() {
  while (debris.items.length > settings.maxDebris && debrisQueue.length) {
    const o = debrisQueue.shift();
    if (!o.dead) {
      const t = o.body.translation();
      if (gfx.enhanced) addRubble(o); // keep it on screen as static rubble
      else dust.emit(t.x, t.y, t.z, 0, 0.3, 0, 0.8, 1.2, 0.55, 0.52, 0.48, 0.35, 1.5, 1);
      removeItem(o);
    }
  }
  if (debrisQueue.length > 4 * debris.cap) debrisQueue = debrisQueue.filter((o) => !o.dead);
}

const fragV = new THREE.Vector3(), fragO = new THREE.Vector3();
function fragment(item, origin, vmag) {
  if (item.dead || item.kind !== 'block') return;
  const b = item.body, t = b.translation(), r = b.rotation(), lv = b.linvel();
  const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  const center = new THREE.Vector3(t.x, t.y, t.z);
  removeItem(item);
  const vol = item.sx * item.sy * item.sz;
  const [fx, fy, fz] = vol < 2.5 ? [1, 1, 1] : item.sx > 3.5 || item.sz > 3.5 ? [3, 1, 2] : Q.frag;
  const base = item.color.clone().multiplyScalar(0.92);
  // irregular cut positions so fragments come in different sizes
  const cuts = (n) => { const c = [0]; for (let i = 1; i < n; i++) c.push(i / n + (Math.random() - 0.5) * 0.35 / n); c.push(1); return c; };
  const cx = cuts(fx), cy = cuts(fy), cz = cuts(fz);
  for (let i = 0; i < fx; i++) for (let j = 0; j < fy; j++) for (let k = 0; k < fz; k++) {
    const ux = cx[i + 1] - cx[i], uy = cy[j + 1] - cy[j], uz = cz[k + 1] - cz[k];
    const px = item.sx * ux, py = item.sy * uy, pz = item.sz * uz;
    fragO.set(((cx[i] + cx[i + 1]) / 2 - 0.5) * item.sx, ((cy[j] + cy[j + 1]) / 2 - 0.5) * item.sy, ((cz[k] + cz[k + 1]) / 2 - 0.5) * item.sz).applyQuaternion(q).add(center);
    fragV.copy(fragO).sub(origin || center);
    if (fragV.lengthSq() < 1e-4) fragV.set(rnd(-1, 1), 1, rnd(-1, 1));
    fragV.normalize();
    const s = vmag * rnd(0.5, 1.1);
    const v = { x: lv.x + fragV.x * s + rnd(-1.5, 1.5), y: lv.y + fragV.y * s + Math.abs(s) * 0.25 + rnd(0, 1.5), z: lv.z + fragV.z * s + rnd(-1.5, 1.5) };
    const w = { x: rnd(-4, 4), y: rnd(-4, 4), z: rnd(-4, 4) };
    const shrink = rnd(0.82, 0.96);
    const c = base.clone().multiplyScalar(rnd(0.8, 1.05));
    addDebris(fragO, q, px * shrink, py * rnd(0.8, 0.96), pz * shrink, c, v, w);
  }
  for (let i = 0; i < 5; i++) dust.emit(t.x + rnd(-1, 1), t.y + rnd(-1, 1), t.z + rnd(-1, 1), rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1), rnd(1.8, 3.2), rnd(1.5, 2.6), 0.62, 0.58, 0.53, 0.5, 1.6, 0.9, -0.15);
  for (let i = 0; i < 6; i++) dust.emit(t.x, t.y, t.z, rnd(-5, 5), rnd(1, 7), rnd(-5, 5), rnd(0.7, 1.4), rnd(0.15, 0.3), 0.35, 0.33, 0.3, 1, 0, 0.2, 9.8);
  if (gfx.enhanced) { for (let i = 0; i < 4; i++) sparks.emit(t.x, t.y, t.z, rnd(-5, 5), rnd(0, 7), rnd(-5, 5), rnd(0.3, 0.9)); const g = rnd(0.5, 0.6); for (let i = 0; i < 2; i++) dust.emit(t.x, t.y, t.z, rnd(-1.5, 1.5), rnd(0, 1.5), rnd(-1.5, 1.5), rnd(3, 6), rnd(3, 4.5), g + 0.05, g + 0.03, g, 0.55, 1.2, 0.6, -0.1); }
  Sfx.crumble(vmag / 10);
  enforceDebrisCap();
}

