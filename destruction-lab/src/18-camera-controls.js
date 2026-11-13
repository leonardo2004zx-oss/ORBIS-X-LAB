/* ------------------------------------------------------------------ camera controls (touch + mouse) */
const controls = {
  target: new THREE.Vector3(0, 7, 0), radius: 62, theta: 0.75, phi: 1.02,
  goal: { radius: 62, theta: 0.75, phi: 1.02, target: new THREE.Vector3(0, 7, 0) },
  update(dt) {
    const k = 1 - Math.exp(-dt * 12);
    this.radius += (this.goal.radius - this.radius) * k;
    this.theta += (this.goal.theta - this.theta) * k;
    this.phi += (this.goal.phi - this.phi) * k;
    this.target.lerp(this.goal.target, k);
    const sp = Math.sin(this.phi);
    camera.position.set(this.target.x + this.radius * sp * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * sp * Math.cos(this.theta));
    camera.lookAt(this.target);
  },
  rotate(dx, dy) { this.goal.theta -= dx * 0.006; this.goal.phi = THREE.MathUtils.clamp(this.goal.phi - dy * 0.005, 0.12, 1.5); },
  zoom(f) { this.userZoomed = true; this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * f, 8, 160); },
  pan(dx, dy) {
    const s = this.radius * 0.0016;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); right.y = 0; right.normalize();
    const fwd = new THREE.Vector3(-Math.sin(this.theta), 0, -Math.cos(this.theta));
    this.goal.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
    this.goal.target.x = THREE.MathUtils.clamp(this.goal.target.x, -70, 70);
    this.goal.target.z = THREE.MathUtils.clamp(this.goal.target.z, -70, 70);
  },
};
const pointers = new Map();
let lastCamMove = 0;
let gesture = null;
const el = renderer.domElement;
el.addEventListener('contextmenu', (e) => e.preventDefault());
el.addEventListener('pointerdown', (e) => {
  Sfx.init();
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) gesture = { sx: e.clientX, sy: e.clientY, t: e.timeStamp, moved: 0, multi: false, button: e.button, shift: e.shiftKey };
  else if (gesture) gesture.multi = true;
  if (pointers.size === 2) gesture.pinch = pinchState();
});
function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}
el.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p || !gesture) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy));
  if (pointers.size >= 2) {
    const s = pinchState(), prev = gesture.pinch || s;
    if (prev.d > 0 && s.d > 0) controls.zoom(prev.d / s.d);
    controls.pan(s.cx - prev.cx, s.cy - prev.cy);
    gesture.pinch = s;
  } else if (gesture.moved > 6) {
    if (gesture.button === 2 || gesture.button === 1 || gesture.shift) controls.pan(dx, dy);
    else controls.rotate(dx, dy);
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 1 && gesture) gesture.pinch = null;
  if (pointers.size === 0 && gesture) {
    const g = gesture; gesture = null;
    // a tap only counts if it was short, still, single-finger and not right after moving the camera
    const now = e.timeStamp;
    if (e.type === 'pointerup' && !g.multi && g.moved < 8 && now - g.t < 320 && g.button === 0 && now - lastCamMove > 280) onTap(e.clientX, e.clientY);
    if (g.multi || g.moved >= 8) lastCamMove = now;
  }
}
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', endPointer);
el.addEventListener('wheel', (e) => { e.preventDefault(); controls.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const map = { '1': 'camera', '2': 'meteor', '3': 'blast', '4': 'quake', '5': 'tornado', '6': 'tsunami', '7': 'storm', '8': 'volcano', '9': 'blackhole', 't': 'titans', 'T': 'titans', '0': 'build' };
  if (e.key === 'l' || e.key === 'L') toggleSlowmo();
  if (e.key === 'g' || e.key === 'G') setGfx(!gfx.enhanced);
  if (map[e.key]) setTool(map[e.key]);
  if (e.key === 'r' || e.key === 'R') resetCity();
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pick(cx, cy, groundOnly) {
  const r = el.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!groundOnly) {
    const meshes = BLOCK_POOLS.map((p) => p.mesh).concat(debris.mesh);
    for (const m of meshes) m.boundingSphere = null;
    const hits = raycaster.intersectObjects(volcano.mesh ? meshes.concat(volcano.mesh) : meshes, false);
    if (hits.length) return hits[0].point;
  }
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, p) && Math.abs(p.x) < 150 && Math.abs(p.z) < 150) return p;
  return null;
}

