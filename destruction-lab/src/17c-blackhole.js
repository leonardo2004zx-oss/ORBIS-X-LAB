/* ------------------------------------------------------------------ black hole */
// Not real relativity: a strong pull toward a point plus a swirl, pieces that cross the horizon are swallowed.
const blackhole = { phase: 'idle', P: new THREE.Vector3(0, -100, 0), t: 0, dur: 15, power: 6, rh: 1.5, eaten: 0, group: null };
const diskMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec2 vUv;
    void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; if (r > 1.0 || r < 0.3) discard;
      float a = atan(c.y, c.x);
      float band = sin(a * 3.0 + r * 18.0 - uTime * 6.0) * 0.5 + 0.5;
      float band2 = sin(a * 7.0 - r * 30.0 - uTime * 9.0) * 0.5 + 0.5;
      float fall = (1.0 - smoothstep(0.45, 1.0, r)) * smoothstep(0.3, 0.38, r);
      vec3 col = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.92, 0.75), (1.0 - smoothstep(0.35, 0.6, r)));
      col = mix(col, vec3(0.55, 0.3, 1.0), (1.0 - band) * 0.25);
      gl_FragColor = vec4(col * (0.55 + 0.6 * band * band2), fall * uOpacity); }`,
});
const haloTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.35, 'rgba(0,0,0,0.85)'); r.addColorStop(0.5, 'rgba(255,220,180,0.55)'); r.addColorStop(0.62, 'rgba(40,20,60,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
function startBlackHole(P) {
  if (blackhole.phase !== 'idle') { toast('Ya hay un agujero negro activo'); return; }
  const s = blackhole.power;
  blackhole.rh = 0.9 + s * 0.18;
  blackhole.P.set(P.x, Math.max(P.y, 0) + 10 + s, P.z);
  blackhole.t = 0; blackhole.eaten = 0; blackhole.phase = 'grow';
  const g = new THREE.Group(); g.position.copy(blackhole.P);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
  const disk = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), diskMat);
  disk.rotation.x = -Math.PI / 2 + 0.35;
  g.add(halo, disk, core); g.userData = { core, halo, disk };
  scene.add(g); blackhole.group = g;
  toast('Agujero negro abierto');
  addThreat('blackhole', P.x, P.z, 32 + s * 5, blackhole.dur + 4);
  refreshRunning();
}
function clearBlackHole() {
  if (blackhole.group) { scene.remove(blackhole.group); blackhole.group.userData.halo.material.dispose(); blackhole.group = null; }
  blackhole.phase = 'idle'; blackhole.P.set(0, -100, 0); diskMat.uniforms.uOpacity.value = 0; Sfx.loop('hum', 0);
}
function blackholeScale() { const b = blackhole; return b.phase === 'grow' ? Math.min(1, b.t / 1.5) : b.phase === 'collapse' ? Math.max(0.02, 1 - b.t / 0.8) : 1; }
const bhEat = [], bhTear = [];
function blackholeStep(dt) {
  const b = blackhole;
  if (b.phase === 'idle' || b.phase === 'collapse') return;
  const s = b.power, k = blackholeScale();
  const G = (18 + s * 9) * k, reach = 22 + s * 5;
  for (const it of dynItems()) {
    if (it.dead) continue;
    const t = it.body.translation();
    const dx = b.P.x - t.x, dy = b.P.y - t.y, dz = b.P.z - t.z, d = Math.hypot(dx, dy, dz);
    if (d > reach) continue;
    if (d < b.rh * 1.6) { bhEat.push(it); continue; }
    const a = G / (1 + (d / 9) * (d / 9));
    const nx = dx / d, ny = dy / d, nz = dz / d;
    // swirl around the vertical axis so things orbit before falling in
    const sx = -nz, sz = nx, sw = 0.45 * a;
    const v = it.body.linvel(), m = it.body.mass() * dt, damp = d < 8 ? 0.6 : 0.1;
    it.body.applyImpulse({ x: (nx * a + sx * sw - v.x * damp) * m, y: (ny * a + 9.81 * 0.3 * k - v.y * damp * 0.5) * m, z: (nz * a + sz * sw - v.z * damp) * m }, true);
    if (it.kind === 'block' && d < 9 + s && Math.random() < 0.8 * dt) bhTear.push(it);
    if (it.drive) it.drive = null;
  }
  let n = 0;
  while (bhTear.length) { const it = bhTear.pop(); if (!it.dead && n++ < 3) fragment(it, b.P, 2); }
  while (bhEat.length) {
    const it = bhEat.pop(); if (it.dead) continue;
    const t = it.body.translation();
    for (let j = 0; j < 4; j++) fire.emit(t.x, t.y, t.z, (b.P.x - t.x) * 3, (b.P.y - t.y) * 3, (b.P.z - t.z) * 3, 0.3, rnd(0.4, 0.8), 1, 0.85, 0.6, 1, -1, 0, 0);
    removeItem(it); b.eaten++;
  }
}
function blackholeUpdate(dt) {
  const b = blackhole;
  if (b.phase === 'idle') return;
  b.t += dt;
  const s = b.power, g = b.group, k = blackholeScale();
  diskMat.uniforms.uTime.value += dt;
  g.userData.core.scale.setScalar(b.rh * k);
  g.userData.halo.scale.setScalar(b.rh * 7 * k);
  g.userData.disk.scale.setScalar(b.rh * 11 * k);
  g.userData.disk.rotation.z += dt * 0.6;
  diskMat.uniforms.uOpacity.value = k;
  if (b.phase === 'grow' && b.t > 1.5) { b.phase = 'active'; b.t = 0; }
  if (b.phase === 'active') {
    for (let i = 0; i < 3 + s * 0.4; i++) {
      const warm = Math.random() < 0.6;
      (warm ? fire : dust).emitOrbit(b.rh * rnd(4, 9 + s), rnd(0, 6.28), rnd(1.5, 3), rnd(-1.5, 1.5), rnd(1.5, 3), warm ? rnd(0.5, 1.1) : rnd(1.2, 2), warm ? 1 : 0.3, warm ? rnd(0.5, 0.75) : 0.28, warm ? 0.25 : 0.3, 0.9, 2);
    }
    // dust sucked up from the ground below
    if (Math.random() < 0.8) { const a = rnd(0, 6.28), r = rnd(4, 18); dust.emit(b.P.x + Math.cos(a) * r, 0.4, b.P.z + Math.sin(a) * r, -Math.cos(a) * 3, rnd(6, 12), -Math.sin(a) * 3, rnd(1.2, 2), rnd(1.5, 2.5), 0.5, 0.46, 0.4, 0.5, -0.3, 0.2, -2); }
    addShake(0.015 * s, b.P);
    Sfx.loop('hum', 0.5 + s * 0.05);
    flashLight.position.copy(b.P); flashLight.color.setHex(0xffb070); flashLight.intensity = Math.max(flashLight.intensity, 500 + s * 80);
    if (b.t > b.dur) { b.phase = 'collapse'; b.t = 0; refreshRunning(); }
  } else if (b.phase === 'collapse') {
    Sfx.loop('hum', 0);
    if (b.t >= 0.8) {
      const P = b.P.clone();
      clearBlackHole();
      blast(P, 6 + s * 0.6, 8 + s, { noCrater: true });
      skyFlash = 1;
      toast(`El agujero negro colapsó: tragó ${b.eaten} piezas`);
    }
  }
}
