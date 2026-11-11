/* ------------------------------------------------------------------ tornado */
const tornado = { on: false, strength: 6, dur: 40, life: 0, pos: new THREE.Vector3(-45, 0, -25), target: null, vel: new THREE.Vector3(), t: 0, fade: 0 };
function makeFunnelMat(speed, color, op) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uSpeed: { value: speed }, uColor: { value: new THREE.Color(color) }, uMax: { value: op }, uLight: { value: 1 } },
    vertexShader: `varying vec2 vUv; uniform float uTime;
      void main(){ vUv = uv; vec3 p = position; float h = uv.y;
        p.x += sin(h * 5.0 + uTime * 1.9) * 1.4 * h; p.z += cos(h * 4.3 + uTime * 1.5) * 1.2 * h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uOpacity; uniform float uSpeed; uniform vec3 uColor; uniform float uMax; uniform float uLight;
      void main(){ float a1 = sin(vUv.x * 31.4159 + vUv.y * 16.0 - uTime * uSpeed) * 0.5 + 0.5;
        float a2 = sin(vUv.x * 56.5487 - vUv.y * 23.0 - uTime * uSpeed * 1.4) * 0.5 + 0.5;
        float edge = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
        float a = (0.3 + 0.55 * a1 * a2) * edge * uMax * uOpacity;
        gl_FragColor = vec4(uColor * (0.7 + 0.4 * a1) * uLight, a); }`,
  });
}
const funnel = new THREE.Group();
{
  const g1 = new THREE.CylinderGeometry(11, 1.6, 48, 40, 16, true); g1.translate(0, 24, 0);
  const g2 = new THREE.CylinderGeometry(7, 0.9, 46, 32, 16, true); g2.translate(0, 23, 0);
  funnel.add(new THREE.Mesh(g1, makeFunnelMat(7, 0x7d8085, 0.8)));
  funnel.add(new THREE.Mesh(g2, makeFunnelMat(11, 0x5f6266, 0.9)));
  const cloud = new THREE.Mesh(new THREE.CylinderGeometry(26, 14, 5, 40, 1, false), makeFunnelMat(2.5, 0x4c5058, 0.9));
  cloud.position.y = 49; funnel.add(cloud);
  funnel.children.forEach((m) => (m.renderOrder = 2));
  funnel.visible = false; scene.add(funnel);
}
function tornadoRadius() { return 6 + tornado.strength * 1.6; }
function setTornado(on, at) {
  tornado.on = on;
  if (!on && tornado.threat) { tornado.threat.until = simTime + 2; tornado.threat = null; }
  if (on) {
    if (at) tornado.pos.set(at.x, 0, at.z);
    else if (tornado.fade < 0.05) { const a = rnd(0, Math.PI * 2); tornado.pos.set(Math.cos(a) * 50, 0, Math.sin(a) * 34); }
    tornado.target = null; tornado.life = 0;
    tornado.threat = addThreat('tornado', tornado.pos.x, tornado.pos.z, tornadoRadius() * 3.2, tornado.dur + 2, { follow: () => funnel.position }); toast(tornado.strength >= 8 ? 'Tornado gigante en curso' : 'Tornado en curso');
  }
  refreshRunning();
}
function tornadoUpdate(dt) {
  tornado.fade += ((tornado.on ? 1 : 0) - tornado.fade) * Math.min(1, dt * (tornado.on ? 0.9 : 1.6));
  funnel.visible = tornado.fade > 0.01;
  if (!funnel.visible) { Sfx.loop('wind', 0); return; }
  tornado.t += dt;
  if (tornado.on && (tornado.life += dt) > tornado.dur) setTornado(false);
  if (!tornado.target || Math.hypot(tornado.target.x - tornado.pos.x, tornado.target.z - tornado.pos.z) < 3) tornado.target = new THREE.Vector3(rnd(-42, 42), 0, rnd(-30, 30));
  tmpV.set(tornado.target.x - tornado.pos.x, 0, tornado.target.z - tornado.pos.z).normalize().multiplyScalar(3 + tornado.strength * 0.3);
  tornado.vel.lerp(tmpV, Math.min(1, dt * 0.7));
  tornado.pos.addScaledVector(tornado.vel, dt);
  const sc = 0.55 + tornado.strength * 0.12;
  funnel.position.set(tornado.pos.x + Math.sin(tornado.t * 1.3) * 0.7, 0, tornado.pos.z + Math.cos(tornado.t * 1.1) * 0.7);
  funnel.scale.set(sc, 0.8 + tornado.strength * 0.07, sc);
  funnel.children.forEach((m, i) => { m.material.uniforms.uTime.value = tornado.t; m.material.uniforms.uOpacity.value = tornado.fade; m.rotation.y -= dt * (i === 2 ? 0.4 : 2.5 + i); });
  const R = tornadoRadius(), n = Math.round((4 + tornado.strength * 0.5) * tornado.fade);
  for (let i = 0; i < 2 * tornado.fade; i++) dust.emitOrbit(rnd(0.3, 0.8) * R, rnd(0, 6.28), rnd(2, 3.5), rnd(5, 14), rnd(2, 4), rnd(0.25, 0.5), 0.2, 0.18, 0.16, 1);
  for (let i = 0; i < n; i++) {
    const g = rnd(0.38, 0.5);
    dust.emitOrbit(rnd(0.25, 0.7) * R, rnd(0, 6.28), rnd(2.5, 4.5), rnd(4, 11 + tornado.strength), rnd(2.5, 4.5), rnd(1.6, 3.2) * (0.7 + tornado.strength * 0.08), g + 0.05, g + 0.02, g - 0.02, 0.6);
  }
  if (Math.random() < tornado.fade) {
    const a = rnd(0, 6.28), r = rnd(1, R * 0.8), g = rnd(0.42, 0.52);
    dust.emit(funnel.position.x + Math.cos(a) * r, 0.5, funnel.position.z + Math.sin(a) * r, Math.cos(a) * 4, rnd(0.5, 2), Math.sin(a) * 4, rnd(1.5, 3), rnd(2.5, 4), g + 0.06, g + 0.03, g, 0.5, 1.6, 1);
  }
  Sfx.loop('wind', tornado.fade * (0.3 + tornado.strength * 0.06));
  const dCam = camera.position.distanceTo(funnel.position);
  if (dCam < 60) shake = Math.max(shake, tornado.fade * 0.08 * (1 - dCam / 60) * tornado.strength / 5);
}
const tornadoBreak = [];
function tornadoForces(dt) {
  if (tornado.fade < 0.05) return;
  const s = tornado.strength, R = tornadoRadius(), core = R * 0.4;
  const px = funnel.position.x, pz = funnel.position.z;
  for (const it of dynItems()) {
    if (it.dead) continue;
    const t = it.body.translation();
    const dx = t.x - px, dz = t.z - pz, d = Math.hypot(dx, dz);
    if (d > R || t.y > 50) continue;
    const f = (1 - d / R) * tornado.fade, inv = 1 / Math.max(0.3, d);
    const tx = -dz * inv, tz = dx * inv, ix = -dx * inv, iz = -dz * inv;
    const heavy = it.kind === 'block' ? 0.75 : it.car ? 1.7 : 1.3;
    const at = (9 + s * 2.4) * f * heavy, ar = (4 + s * 0.9) * f * heavy * (t.y > 25 ? -0.6 : 1);
    const lift = 9.81 * (0.45 + s * 0.1) * f * f * heavy * (t.y < 18 + s * 3 ? 1 : 0.2);
    if (it.drive) it.drive = null;
    const m = it.body.mass() * dt;
    it.body.applyImpulse({ x: (tx * at + ix * ar) * m, y: lift * m, z: (tz * at + iz * ar) * m }, true);
    if (it.kind === 'block' && d < core && Math.random() < 0.05 * s * dt * f * 6) tornadoBreak.push(it);
  }
  let n = 0;
  while (tornadoBreak.length) { const it = tornadoBreak.pop(); if (n++ < 3) fragment(it, funnel.position, 3 + s * 0.4); }
  tornadoBreak.length = 0;
}

