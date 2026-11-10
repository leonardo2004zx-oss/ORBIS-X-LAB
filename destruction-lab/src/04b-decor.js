/* ------------------------------------------------------------------ city dressing for the enhanced look (static, visual only) */
const decor = new THREE.Group(); decor.visible = false; scene.add(decor);
const groundDecor = new THREE.Group(); groundDecor.visible = false; groundGroup.add(groundDecor);
const lamps = [];
let groundSwap = [];
function boxGeoUV(w, h, d, x, y, z, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
function mergeGeos(list) { // position/normal/uv merge
  let n = 0; const gs = list.map((g) => (g.index ? g.toNonIndexed() : g)); for (const g of gs) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
  for (const g of gs) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}
const lampPoolTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,214,150,1)'); r.addColorStop(0.5, 'rgba(255,180,100,0.35)'); r.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const lampPoolMat = new THREE.MeshBasicMaterial({ map: lampPoolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -8 });
const lampConeMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide, fog: false });
const lampConeGeo = new THREE.ConeGeometry(2.6, 5.6, 16, 1, true).translate(0, -2.8, 0);
const lampPoolGeo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
const lampFX = [];
function buildDecor() {
  // curbs around every sidewalk block
  const curbParts = [];
  for (const [x0, x1, z0, z1] of LOTS) {
    curbParts.push(boxGeoUV(x1 - x0, 0.2, 0.32, (x0 + x1) / 2, 0.1, z0, 1), boxGeoUV(x1 - x0, 0.2, 0.32, (x0 + x1) / 2, 0.1, z1, 1));
    curbParts.push(boxGeoUV(0.32, 0.2, z1 - z0, x0, 0.1, (z0 + z1) / 2, 1), boxGeoUV(0.32, 0.2, z1 - z0, x1, 0.1, (z0 + z1) / 2, 1));
  }
  const curb = new THREE.Mesh(mergeGeos(curbParts), new THREE.MeshStandardMaterial({ color: 0xbab5ac, roughness: 0.85 }));
  curb.receiveShadow = true; curb.castShadow = true; groundDecor.add(curb);
  // zebra crossings on every leg of each intersection
  const stripes = [];
  for (const sx of STREETS.filter((s) => s.axis === 'x')) for (const sz of STREETS.filter((s) => s.axis === 'z')) {
    if (sz.c < sx.a || sz.c > sx.b || sx.c < sz.a || sx.c > sz.b) continue;
    for (const side of [-1, 1]) {
      const xc = sz.c + side * (sz.w / 2 + 1.6);
      for (let z = sx.c - sx.w / 2 + 0.8; z < sx.c + sx.w / 2 - 0.5; z += 1.1) stripes.push(new THREE.PlaneGeometry(2.4, 0.55).rotateX(-Math.PI / 2).translate(xc, 0.11, z));
      const zc = sx.c + side * (sx.w / 2 + 1.6);
      for (let x = sz.c - sz.w / 2 + 0.8; x < sz.c + sz.w / 2 - 0.5; x += 1.1) stripes.push(new THREE.PlaneGeometry(0.55, 2.4).rotateX(-Math.PI / 2).translate(x, 0.11, zc));
    }
  }
  if (stripes.length) { const st = new THREE.Mesh(mergeGeos(stripes), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 })); st.receiveShadow = true; groundDecor.add(st); }
  // distant skyline with lit windows at night
  const winT = new Painter(64, 64);
  winT.rect(0, 0, 64, 64, { c: '#59606b', r: 0.7, m: 0.2 });
  for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 16) winT.rect(x, y, 9, 10, { c: '#26303c', r: 0.15, m: 0.5, g: Math.random() < 0.45 ? '#ffd9a0' : '#000' });
  const wt = winT.textures(1);
  for (const k of ['map', 'orm', 'glow']) { wt[k].wrapS = wt[k].wrapT = THREE.RepeatWrapping; }
  const sky = [];
  for (let i = 0; i < 150; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(270, 400), w = rnd(12, 30), d = rnd(12, 30), h = rnd(14, 40) + (Math.random() < 0.25 ? rnd(30, 80) : 0);
    const g = boxGeoUV(w, h, d, 0, h / 2, 0, 12).rotateY(rnd(0, 3)).translate(Math.cos(a) * r, 0, Math.sin(a) * r * 0.85);
    sky.push(g);
  }
  const skyMat = new THREE.MeshStandardMaterial({ map: wt.map, roughnessMap: wt.orm, metalnessMap: wt.orm, roughness: 1, metalness: 1, emissiveMap: wt.glow, emissive: 0xffffff, emissiveIntensity: 0 });
  decor.userData.skyMat = skyMat;
  decor.add(new THREE.Mesh(mergeGeos(sky), skyMat));
  // low hills on the horizon
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x5d6e4c, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(430, 470);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat);
    m.scale.set(rnd(90, 140), rnd(40, 80), rnd(60, 90)); m.position.set(Math.cos(a) * r, -10, Math.sin(a) * r); m.rotation.y = -a;
    decor.add(m);
  }
  // HD ground materials (swapped with the classic ones by applyGfxDecor)
  const asph = asphaltHD(), pav = pavingHD(), grass = grassHD();
  groundSwap = [];
  groundGroup.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.map || o.parent === groundDecor) return;
    const m = o.material, src = m.map.source, rep = m.map.repeat;
    let set = null;
    if (src === grassTex.source) set = grass; else if (src === plazaTex.source) set = pav; else if (src === streetTex.source) set = asph;
    if (!set) return;
    const cl = (t, k) => { const c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.copy(rep).multiplyScalar(k); return c; };
    const k = set === grass ? 0.5 : 1;
    const hd = new THREE.MeshStandardMaterial({ map: cl(set.map, k), normalMap: cl(set.normalMap, k), roughnessMap: cl(set.orm, k), metalnessMap: cl(set.orm, k), roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
    groundSwap.push({ mesh: o, classic: m, hd, street: set === asph });
  });
  // the sky dome must be drawn first so far scenery is not hidden behind it
  for (const o of scene.children) if (o.material === scene.userData.skyMat) o.renderOrder = -10;
}
function addLampFX(item) {
  const pool = new THREE.Mesh(lampPoolGeo, lampPoolMat), cone = new THREE.Mesh(lampConeGeo, lampConeMat);
  scene.add(pool, cone); lampFX.push({ item, pool, cone });
}
const lampHead = new THREE.Vector3();
function updateDecor(night, wet) {
  for (let i = lampFX.length - 1; i >= 0; i--) {
    const L = lampFX[i];
    if (L.item.dead) { scene.remove(L.pool, L.cone); lampFX.splice(i, 1); continue; }
    const o = L.item.obj;
    lampHead.set(0, 2.82, 1.25).applyQuaternion(o.quaternion).add(o.position);
    const up = 1 - 2 * (o.quaternion.x * o.quaternion.x + o.quaternion.z * o.quaternion.z);
    const on = gfx.enhanced && up > 0.9 && night > 0.05;
    L.pool.visible = L.cone.visible = on;
    if (on) { L.pool.position.set(lampHead.x, 0.13, lampHead.z); L.cone.position.copy(lampHead); }
  }
  lampPoolMat.opacity = night * 0.9; lampConeMat.opacity = night * 0.05;
  if (decor.userData.skyMat) decor.userData.skyMat.emissiveIntensity = night * 0.6;
  for (const g of groundSwap) if (g.street) g.hd.roughness = 1 - 0.55 * wet;
}
function applyGfxDecor() {
  decor.visible = groundDecor.visible = gfx.enhanced;
  for (const g of groundSwap) g.mesh.material = gfx.enhanced ? g.hd : g.classic;
}
function clearLampFX() { for (const L of lampFX) scene.remove(L.pool, L.cone); lampFX.length = 0; }
