/* ------------------------------------------------------------------ VEX: giant combat robot (hard-surface model built in code) */
// About 27 m tall. Bevelled and tapered armour plates, bare-metal joints, hydraulic pistons that really extend and
// compress with the joints, cables, a chest reactor, a lit visor and hands with fingers that close into fists.
// Parts are merged per bone and material so the whole robot costs a few dozen draw calls.
const VEXR = {};
function vexTextures() {
  if (VEXR.tex) return VEXR.tex;
  // painted armour: panel seams, rivets, stencils, scratches down to bare metal, grime and chipped edges
  const a = new Painter(512, 512);
  a.rect(0, 0, 512, 512, { c: '#56606b', h: 0.55, r: 0.48, m: 0.55 });
  const seamsX = [0, 96, 230, 330, 512], seamsY = [0, 140, 260, 400, 512];
  for (const x of seamsX) a.rect(x - 2, 0, 4, 512, { c: '#2b3036', h: 0.2, r: 0.7, m: 0.4 });
  for (const y of seamsY) a.rect(0, y - 2, 512, 4, { c: '#2b3036', h: 0.2, r: 0.7, m: 0.4 });
  for (const x of seamsX) for (let y = 10; y < 512; y += 22) a.rect(x - 9, y, 5, 5, { c: '#78818c', h: 0.85, r: 0.35, m: 0.85 });
  for (const y of seamsY) for (let x = 12; x < 512; x += 22) a.rect(x, y + 6, 5, 5, { c: '#78818c', h: 0.85, r: 0.35, m: 0.85 });
  a.rect(250, 160, 70, 40, { c: '#3d454e', h: 0.4, r: 0.6 });   // access hatch
  a.c.font = 'bold 54px Arial, sans-serif'; a.c.fillStyle = 'rgba(225,225,215,0.85)'; a.c.fillText('VX-07', 110, 230);
  a.c.font = 'bold 22px Arial, sans-serif'; a.c.fillText('WARNING · HYDRAULICS', 20, 380);
  for (let i = 0; i < 220; i++) { // scratches showing bare metal
    const x = Math.random() * 512, y = Math.random() * 512, l = 6 + Math.random() * 40, ang = Math.random() * 6.28;
    a.c.strokeStyle = 'rgba(190,198,206,0.55)'; a.ro.strokeStyle = 'rgb(70,70,70)'; a.me.strokeStyle = 'rgb(240,240,240)';
    for (const g of [a.c, a.ro, a.me]) { g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke(); }
  }
  for (let i = 0; i < 160; i++) { const x = Math.random() * 512, y = Math.random() * 512, s = 2 + Math.random() * 6; a.rect(x, y, s, s * 0.7, { c: '#8a929b', h: 0.45, r: 0.3, m: 0.95 }); } // chipped paint
  a.grime(0.32, 707); a.streaks(0, 512, 150, 0.12); a.streaks(0, 512, 410, 0.12);
  // hazard stripes for accents
  const hz = new Painter(256, 256);
  hz.rect(0, 0, 256, 256, { c: '#1b1c1e', h: 0.5, r: 0.5, m: 0.3 });
  hz.c.save(); hz.c.translate(128, 128); hz.c.rotate(-Math.PI / 4); hz.c.fillStyle = '#e0a020'; for (let x = -400; x < 400; x += 64) hz.c.fillRect(x, -400, 32, 800); hz.c.restore();
  hz.grime(0.35, 808);
  for (let i = 0; i < 90; i++) { const x = Math.random() * 256, y = Math.random() * 256; hz.rect(x, y, 3 + Math.random() * 5, 2 + Math.random() * 3, { c: '#7d8288', r: 0.3, m: 0.9 }); }
  // brushed bare metal for pistons, axles, joints
  const mt = new Painter(256, 256);
  mt.rect(0, 0, 256, 256, { c: '#b7bdc4', h: 0.5, r: 0.22, m: 1 });
  for (let y = 0; y < 256; y++) { const v = 150 + Math.random() * 70 | 0; mt.c.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`; mt.c.fillRect(0, y, 256, 1); }
  mt.grime(0.15, 909);
  // dark structural frame
  const fr = new Painter(256, 256);
  fr.rect(0, 0, 256, 256, { c: '#2a2e33', h: 0.5, r: 0.6, m: 0.8 });
  for (let i = 0; i < 40; i++) fr.rect(Math.random() * 256, Math.random() * 256, 30 + Math.random() * 60, 3, { c: '#3a3f46', h: 0.62 });
  fr.grime(0.3, 1010);
  const T = { armor: a.textures(4), hazard: hz.textures(2), metal: mt.textures(1.5), frame: fr.textures(3) };
  for (const s of Object.values(T)) for (const k of ['map', 'normalMap', 'orm']) { s[k].wrapS = s[k].wrapT = THREE.RepeatWrapping; s[k].repeat.set(0.16, 0.16); }
  T.hazard.map.repeat.set(0.3, 0.3); T.hazard.normalMap.repeat.set(0.3, 0.3); T.hazard.orm.repeat.set(0.3, 0.3);
  return (VEXR.tex = T);
}
function vexMaterials() {
  if (VEXR.mats) return VEXR.mats;
  const t = vexTextures();
  const pbr = (s, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ map: s.map, normalMap: s.normalMap, roughnessMap: s.orm, metalnessMap: s.orm, roughness: 1, metalness: 1 }, extra));
  VEXR.mats = {
    armor: pbr(t.armor, { color: 0xd6dde6 }),
    accent: pbr(t.armor, { color: 0x3b5a8a }),
    hazard: pbr(t.hazard),
    metal: pbr(t.metal),
    frame: pbr(t.frame),
    rubber: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9, metalness: 0.1 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x102030, emissive: 0x38c8ff, emissiveIntensity: 4.5, roughness: 0.2, metalness: 0.3 }),
    core: new THREE.MeshStandardMaterial({ color: 0x0a1a28, emissive: 0x60d8ff, emissiveIntensity: 7, roughness: 0.3 }),
    thrust: new THREE.MeshStandardMaterial({ color: 0x101418, emissive: 0xff8a30, emissiveIntensity: 3, roughness: 0.5 }),
    runR: new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff2010, emissiveIntensity: 5 }),
  };
  return VEXR.mats;
}
// --- hard-surface helpers
function chamferShape(w, h, c) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2; c = Math.min(c, x * 0.9, y * 0.9);
  s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c); s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
  return s;
}
// box with chamfered edges and bevelled faces, exact outer size w × h × d, centred
function plate(w, h, d, b = 0.18, ch = 0.35) {
  b = Math.min(b, w / 4, h / 4, d / 3);
  const g = new THREE.ExtrudeGeometry(chamferShape(w - 2 * b, h - 2 * b, ch), { depth: Math.max(0.02, d - 2 * b), bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -Math.max(0.02, d - 2 * b) / 2);
  return g;
}
// narrow the top (t=1) or bottom of a geometry: armour that tapers like real plating
function taper(g, sxTop, szTop = sxTop, sxBot = 1, szBot = 1) {
  g.computeBoundingBox(); const bb = g.boundingBox, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1); p.setX(i, p.getX(i) * (sxBot + (sxTop - sxBot) * t)); p.setZ(i, p.getZ(i) * (szBot + (szTop - szBot) * t)); }
  g.computeVertexNormals(); return g;
}
const cylY = (r1, r2, h, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);
const cylX = (r, h, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg).rotateZ(Math.PI / 2);
const cylZ = (r, h, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2);
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); return g.translate(x, y, z); };

// one bucket per bone: { material: [geometries] }, merged into one mesh per material at the end
function partBucket() { const b = {}; return { add(mat, g) { (b[mat] = b[mat] || []).push(g); return g; }, build(bone, M) { for (const k in b) { const m = new THREE.Mesh(mergeGeos(b[k]), M[k]); m.castShadow = true; m.receiveShadow = true; bone.add(m); } } }; }

/* a hydraulic piston between two bones: the housing stays on A, the polished rod slides out toward B */
class Piston {
  constructor(space, boneA, la, boneB, lb, r, M) {
    this.space = space; this.A = boneA; this.B = boneB; this.la = la; this.lb = lb;
    this.house = new THREE.Mesh(cylY(r, r, 1, 12).translate(0, 0.5, 0), M.frame);
    this.rod = new THREE.Mesh(cylY(r * 0.5, r * 0.5, 1, 10).translate(0, 0.5, 0), M.metal);
    this.cap = new THREE.Mesh(cylY(r * 1.25, r * 1.25, 0.35, 12), M.metal);
    for (const m of [this.house, this.rod, this.cap]) { m.castShadow = true; space.add(m); }
  }
  update() {
    const a = this.space.worldToLocal(this.A.localToWorld(this.la.clone())), b = this.space.worldToLocal(this.B.localToWorld(this.lb.clone()));
    const d = new THREE.Vector3().subVectors(b, a), len = d.length(); d.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UPV, d), hl = Math.min(len * 0.62, len);
    this.house.position.copy(a); this.house.quaternion.copy(q); this.house.scale.set(1, hl, 1);
    this.rod.position.copy(b); this.rod.quaternion.setFromUnitVectors(UPV, d.clone().negate()); this.rod.scale.set(1, len * 0.55, 1);
    this.cap.position.copy(a).addScaledVector(d, hl); this.cap.quaternion.copy(q);
  }
}

function buildVexRobot() {
  const M = vexMaterials();
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const HIP = 13.5, THIGH = 6.6, SHIN = 6.2, UARM = 5.8, FARM = 5.6;
  const hips = new THREE.Group(); hips.position.y = HIP; tilt.add(hips);
  const B = { hips: partBucket(), torso: partBucket(), head: partBucket() };
  // --- pelvis
  B.hips.add('frame', at(taper(plate(6.2, 2.6, 4.2, 0.2), 1.15, 1.05), 0, 0.2, 0));
  B.hips.add('armor', at(taper(plate(3.2, 2.6, 0.7, 0.15), 0.7, 1), 0, -0.6, 2.2, 0.15));            // groin plate
  for (const s of [-1, 1]) {
    B.hips.add('armor', at(taper(plate(1.0, 3.6, 3.6, 0.18), 1, 1, 1, 0.8), s * 3.9, -0.4, 0, 0, 0, s * 0.18)); // hip skirt
    B.hips.add('hazard', at(plate(0.2, 1.2, 2.2, 0.05), s * 4.45, 0.3, 0, 0, 0, s * 0.18));
    B.hips.add('metal', at(new THREE.SphereGeometry(1.25, 14, 10), s * 3.2, 0, 0));                  // hip ball joints
  }
  // --- torso: waist core, abdominal plates, wide chest, reactor, collar, back thrusters
  const torso = new THREE.Group(); hips.add(torso);
  B.torso.add('frame', at(cylY(1.7, 2.1, 3.2, 14), 0, 1.6, 0));
  for (let i = 0; i < 3; i++) B.torso.add(i === 1 ? 'accent' : 'armor', at(taper(plate(4.4 - i * 0.2, 1.05, 1.2, 0.12), 0.92), 0, 0.7 + i * 0.95, 1.65));
  for (const s of [-1, 1]) B.torso.add('metal', at(cylY(0.32, 0.32, 3.6, 10), s * 1.9, 1.7, -1.3, 0, 0, s * 0.1)); // spine side rods
  B.torso.add('armor', at(taper(plate(11.8, 7.0, 6.6, 0.35, 0.9), 1, 1, 0.72, 0.82), 0, 6.6, 0));     // chest block, wider at the top
  for (const s of [-1, 1]) {
    B.torso.add('accent', at(taper(plate(4.6, 4.4, 0.9, 0.2, 0.6), 0.95, 1, 0.8), s * 3.1, 7.2, 3.35, -0.12, s * 0.16));   // pectoral plates
    B.torso.add('hazard', at(plate(1.1, 0.35, 0.3, 0.05), s * 3.6, 9.2, 3.55, -0.12, s * 0.16));
    B.torso.add('armor', at(taper(plate(3.2, 2.6, 2.8, 0.2), 0.8, 0.9), s * 4.6, 9.9, -0.6, 0, 0, -s * 0.18));             // collar / trapezius armour
    B.torso.add('frame', at(plate(0.5, 4.4, 2.2, 0.08), s * 1.2, 11.2, -2.6, 0.25));                                     // back pylons
    B.torso.add('frame', at(cylZ(1.25, 2.4, 16), s * 2.6, 6.8, -3.9));                                                  // thruster housings
    B.torso.add('thrust', at(cylZ(0.85, 0.5, 14), s * 2.6, 6.8, -5.15));
    B.torso.add('metal', at(new THREE.TorusGeometry(1.05, 0.18, 6, 16), s * 2.6, 6.8, -5.1));
    B.torso.add('runR', at(new THREE.SphereGeometry(0.22, 8, 6), s * 5.9, 9.8, 1.4));                                    // running lights
  }
  B.torso.add('frame', at(new THREE.CylinderGeometry(1.95, 2.25, 0.9, 24).rotateX(Math.PI / 2), 0, 6.8, 3.35));        // reactor housing
  B.torso.add('metal', at(new THREE.TorusGeometry(1.65, 0.22, 8, 28), 0, 6.8, 3.85));
  B.torso.add('core', at(new THREE.SphereGeometry(1.25, 20, 14).scale(1, 1, 0.45), 0, 6.8, 3.8));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.torso.add('frame', at(plate(0.35, 1.1, 0.4, 0.05), Math.cos(a) * 1.95, 6.8 + Math.sin(a) * 1.95, 4.05, 0, 0, a + Math.PI / 2)); }
  // cables from the back to the shoulders
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 1.4, 9.4 - k * 0.7, -3.3), new THREE.Vector3(s * 4, 10.6 - k * 0.6, -3.6), new THREE.Vector3(s * 6.8, 9.6 - k * 0.5, -1.6)]);
    B.torso.add('rubber', new THREE.TubeGeometry(c, 14, 0.22, 6, false));
  }
  // --- head: small armoured helmet, visor slit, chin guard, sensor fins
  const head = new THREE.Group(); head.position.set(0, 11.2, 0.4); torso.add(head);
  B.head.add('frame', at(cylY(0.9, 1.1, 1.2, 10), 0, -0.2, -0.2));                                    // neck
  B.head.add('armor', at(taper(plate(2.9, 2.2, 3.0, 0.25, 0.6), 0.82, 0.9), 0, 1.1, 0));
  B.head.add('frame', at(taper(plate(2.5, 0.6, 0.8, 0.1), 0.9), 0, 1.25, 1.35));
  B.head.add('visor', at(plate(2.2, 0.32, 0.25, 0.05, 0.1), 0, 1.25, 1.72));
  B.head.add('accent', at(taper(plate(1.8, 0.8, 1.0, 0.12), 1.2, 1, 1, 1), 0, 0.35, 1.1));            // chin guard
  for (const s of [-1, 1]) B.head.add('armor', at(plate(0.25, 1.4, 1.8, 0.06), s * 1.55, 1.6, -0.3, 0.3, 0, s * 0.25)); // sensor fins
  B.head.add('hazard', at(plate(0.3, 0.9, 1.6, 0.05), 0, 2.35, -0.2, 0.25));
  // --- arms
  const arms = [], elbows = [], hands = [], fing = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 7.4, 9.0, 0); torso.add(sh);
    const bs = partBucket();
    bs.add('metal', new THREE.SphereGeometry(1.6, 16, 12));                                            // shoulder joint
    bs.add('armor', at(taper(plate(4.6, 3.4, 5.2, 0.3, 0.8), 1, 1, 0.85, 0.9), s * 0.6, 0.9, 0, 0, 0, -s * 0.22)); // pauldron
    bs.add('accent', at(plate(4.0, 0.5, 4.6, 0.12), s * 0.9, 2.75, 0, 0, 0, -s * 0.22));
    bs.add('hazard', at(plate(0.25, 1.6, 3.6, 0.05), s * 3.05, 0.6, 0, 0, 0, -s * 0.22));
    bs.add('frame', at(cylY(1.1, 1.0, UARM - 0.6, 12), 0, -UARM / 2, 0));                              // upper-arm core
    bs.add('armor', at(taper(plate(2.6, 3.4, 2.8, 0.2, 0.5), 0.9, 0.9), 0, -2.6, 0.15));
    bs.add('metal', at(cylX(0.95, 2.6, 14), 0, -UARM, 0));                                             // elbow axle
    bs.build(sh, M);
    const el = new THREE.Group(); el.position.y = -UARM; sh.add(el);
    const be = partBucket();
    be.add('armor', at(taper(plate(2.9, FARM - 0.4, 3.1, 0.25, 0.6), 1.12, 1.1), 0, -FARM / 2, 0.1));     // heavy forearm
    be.add('accent', at(plate(3.1, 1.0, 3.3, 0.12), 0, -FARM + 1.1, 0.1));                               // wrist cuff
    be.add('frame', at(plate(0.5, 2.6, 1.8, 0.08), s * 1.6, -2.4, 0));                                   // side vent
    for (let i = 0; i < 4; i++) be.add('thrust', at(plate(0.12, 0.25, 1.4, 0.02), s * 1.88, -1.6 - i * 0.55, 0));
    be.add('metal', at(new THREE.SphereGeometry(0.8, 10, 8), 0, -FARM, 0));
    be.build(el, M);
    // hand: palm + one group for the four proximal phalanges, one for the distal ones, and a thumb
    const hand = new THREE.Group(); hand.position.y = -FARM - 0.5; el.add(hand);
    const bh = partBucket();
    bh.add('frame', at(plate(2.5, 1.9, 1.3, 0.12), 0, -0.9, 0)); bh.add('armor', at(plate(2.6, 1.6, 0.45, 0.1), 0, -0.9, 0.62));
    bh.build(hand, M);
    const prox = new THREE.Group(); prox.position.y = -1.85; hand.add(prox);
    const dist = new THREE.Group(); dist.position.y = -1.05; prox.add(dist);
    const bp = partBucket(), bd = partBucket();
    for (let f = 0; f < 4; f++) { const x = -0.9 + f * 0.6; bp.add('frame', at(plate(0.48, 1.05, 0.62, 0.06), x, -0.5, 0)); bp.add('metal', at(cylX(0.24, 0.5, 8), x, 0, 0)); bd.add('armor', at(taper(plate(0.44, 0.9, 0.58, 0.06), 0.7), x, -0.45, 0)); }
    bp.build(prox, M); bd.build(dist, M);
    const thumb = new THREE.Group(); thumb.position.set(-s * 1.25, -0.9, 0.35); hand.add(thumb);
    const bt = partBucket(); bt.add('frame', at(plate(0.5, 1.4, 0.6, 0.06), 0, -0.6, 0.1, 0.3)); bt.build(thumb, M);
    arms.push(sh); elbows.push(el); hands.push(hand); fing.push({ prox, dist, thumb, s });
  }
  // --- legs: thigh, knee, shin with calf hydraulics, ankle and a big mechanical foot
  const legs = [], knees = [], ankles = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 3.2, 0, 0); hips.add(leg);
    const bl = partBucket();
    bl.add('frame', at(cylY(1.15, 1.0, THIGH, 12), 0, -THIGH / 2, 0));
    bl.add('armor', at(taper(plate(3.7, THIGH - 1.2, 3.9, 0.3, 0.8), 0.85, 0.85), 0, -THIGH / 2 + 0.2, 0.25));
    bl.add('accent', at(plate(0.5, THIGH - 2.6, 3.0, 0.1), s * 1.9, -THIGH / 2, 0.2));
    bl.add('metal', at(cylX(1.15, 3.0, 16), 0, -THIGH, 0));                                             // knee axle
    bl.build(leg, M);
    const knee = new THREE.Group(); knee.position.y = -THIGH; leg.add(knee);
    const bk = partBucket();
    bk.add('armor', at(taper(plate(2.6, 2.0, 1.5, 0.2, 0.5), 0.75, 1), 0, 0.2, 1.55, -0.2));                // knee cap
    bk.add('frame', at(cylY(1.0, 0.85, SHIN, 12), 0, -SHIN / 2, -0.3));
    bk.add('armor', at(taper(plate(3.2, SHIN - 0.8, 2.4, 0.25, 0.6), 0.9, 0.9, 1.1, 1), 0, -SHIN / 2 - 0.1, 0.8)); // shin guard
    bk.add('hazard', at(plate(2.4, 0.5, 0.2, 0.05), 0, -1.6, 2.05));
    bk.add('metal', at(cylX(0.85, 2.4, 14), 0, -SHIN, 0));                                              // ankle axle
    bk.build(knee, M);
    const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle);
    const bf = partBucket();
    bf.add('frame', at(plate(3.6, 0.9, 5.8, 0.15), 0, -0.25, 0.9));
    bf.add('armor', at(taper(plate(3.4, 0.8, 2.4, 0.2, 0.4), 0.8, 1), 0, -0.05, 2.6));                       // toe armour
    bf.add('armor', at(plate(2.6, 0.9, 1.8, 0.15), 0, 0.1, -1.4));                                        // heel
    bf.add('rubber', at(plate(3.7, 0.25, 6.2, 0.05), 0, -0.68, 0.9));                                      // sole
    bf.build(ankle, M);
    legs.push(leg); knees.push(knee); ankles.push(ankle);
  }
  B.hips.build(hips, M); B.torso.build(torso, M); B.head.build(head, M);
  // hydraulics: shoulder→elbow (front), hip→knee (front), knee→ankle (calf, two), neck
  const pistons = [];
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    pistons.push(new Piston(tilt, arms[i], new THREE.Vector3(0, -0.8, 1.1), elbows[i], new THREE.Vector3(0, -1.6, 1.25), 0.38, M));
    pistons.push(new Piston(tilt, hips, new THREE.Vector3(s * 3.2, -0.8, 1.6), knees[i], new THREE.Vector3(0, -1.6, 1.25), 0.45, M));
    pistons.push(new Piston(tilt, knees[i], new THREE.Vector3(s * 0.7, -0.8, -1.3), ankles[i], new THREE.Vector3(s * 0.7, 0.4, -1.4), 0.4, M));
    pistons.push(new Piston(tilt, knees[i], new THREE.Vector3(-s * 0.7, -0.8, -1.3), ankles[i], new THREE.Vector3(-s * 0.7, 0.4, -1.4), 0.4, M));
  }
  const fistL = new THREE.Object3D(), fistR = new THREE.Object3D();
  const rig = new Rig();
  rig.add('tiltX', tilt, 'x', 40, 9); rig.add('hipsY', hips, 'py', 60, 12);
  rig.add('legL', legs[0], 'x', 95, 15); rig.add('legR', legs[1], 'x', 95, 15); rig.add('legLz', legs[0], 'z'); rig.add('legRz', legs[1], 'z');
  rig.add('kneeL', knees[0], 'x', 95, 15); rig.add('kneeR', knees[1], 'x', 95, 15);
  rig.add('torsoX', torso, 'x', 70, 13); rig.add('torsoY', torso, 'y', 70, 12); rig.add('torsoZ', torso, 'z', 60, 12);
  rig.add('armL', arms[0], 'x', 110, 15); rig.add('armR', arms[1], 'x', 110, 15); rig.add('armLz', arms[0], 'z', 95, 14); rig.add('armRz', arms[1], 'z', 95, 14);
  rig.add('elbL', elbows[0], 'x', 120, 15); rig.add('elbR', elbows[1], 'x', 120, 15);
  rig.add('headX', head, 'x', 80, 12); rig.add('headY', head, 'y', 80, 12);
  rig.add('fistL', fistL, 'x', 160, 20); rig.add('fistR', fistR, 'x', 160, 20);
  const visorMat = M.visor, coreMat = M.core;
  // per-frame extras: feet stay flat, fingers follow the fist value, pistons follow the joints, reactor pulses
  const post = (T) => {
    for (let i = 0; i < 2; i++) { ankles[i].rotation.x = -(legs[i].rotation.x + knees[i].rotation.x) * 0.92 - T.rig.j.tiltX.cur * 0; }
    for (let i = 0; i < 2; i++) { const f = fing[i], k = (i ? fistR : fistL).rotation.x; f.prox.rotation.x = k * 1.4; f.dist.rotation.x = k * 1.6; f.thumb.rotation.z = f.s * k * 0.9; }
    root.updateMatrixWorld(true);
    for (const p of pistons) p.update();
    coreMat.emissiveIntensity = 6 + Math.sin(pedTime.value * 3) * 1.2 + T.flash * 6;
    visorMat.emissiveIntensity = T.state === 'ko' || T.state === 'gone' ? 0.3 : 4.5 + T.flash * 3;
  };
  return { root, tilt, rig, hips, legs, knees, torso, arms, elbows, head, mats: [M.armor, M.accent], post, humanoid: true, robot: true,
    height: 27, radius: 6.5, speed: 5.2, colY: 13, colR: 5.8, colH: 7, hipH: HIP, hipBase: 13.2, footX: 3.2 };
}
