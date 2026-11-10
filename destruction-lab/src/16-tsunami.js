/* ------------------------------------------------------------------ tsunami */
const tsunami = { phase: 'idle', height: 6, front: -200, depth: 0, crest: 0, t: 0, dir: new THREE.Vector2(0, 1), speed: 10, start: -95, end: 95 };
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uDir: { value: tsunami.dir }, uFront: { value: -200 }, uDepth: { value: 0 }, uCrest: { value: 0 }, uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }, uDark: { value: 0 } },
  vertexShader: `uniform vec2 uDir; uniform float uFront, uDepth, uCrest, uTime; varying float vFoam; varying vec3 vW;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); float s = dot(w.xz, uDir);
      float behind = 1.0 - smoothstep(uFront - 1.0, uFront + 2.5, s);
      float crest = uCrest * exp(-pow((s - (uFront - 4.0)) / 6.0, 2.0));
      float rip = sin(w.x * 0.33 + uTime * 1.8) * 0.18 + sin(w.z * 0.27 - uTime * 1.4) * 0.18 + sin((w.x + w.z) * 0.9 + uTime * 3.0) * 0.06;
      float h = behind * (uDepth + rip * min(1.0, uDepth)) + crest;
      w.y = h - (1.0 - behind) * 4.0; vFoam = clamp(crest / max(0.5, uCrest), 0.0, 1.0) + (0.5 + 0.5 * sin(w.x * 1.7 + w.z * 1.3 + uTime * 4.0)) * 0.12;
      vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uSun; uniform float uDark; varying float vFoam; varying vec3 vW;
    void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.0) n = -n;
      float l = clamp(dot(n, uSun), 0.0, 1.0); vec3 deep = vec3(0.10, 0.27, 0.30); vec3 shallow = vec3(0.30, 0.47, 0.44);
      vec3 c = mix(deep, shallow, l); c = mix(c, vec3(0.92, 0.95, 0.96), smoothstep(0.35, 0.95, vFoam));
      vec3 v = normalize(cameraPosition - vW); vec3 hlf = normalize(uSun + v); c += pow(max(dot(n, hlf), 0.0), 60.0) * 0.6;
      c *= 1.0 - uDark * 0.55; gl_FragColor = vec4(c, 0.86); }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 140, 140), waterMat);
water.rotation.x = -Math.PI / 2; water.visible = false; water.renderOrder = 3; scene.add(water);
function waterLevelAt(x, z) {
  const s = x * tsunami.dir.x + z * tsunami.dir.y, F = tsunami.front;
  if (s > F + 2.5) return -10;
  const behind = 1 - THREE.MathUtils.smoothstep(s, F - 1, F + 2.5);
  return behind * tsunami.depth + tsunami.crest * Math.exp(-(((s - (F - 4)) / 6) ** 2));
}
// The wave enters from the edge nearest to where you tap and crosses the whole city.
function launchTsunami(at) {
  if (tsunami.phase !== 'idle') { toast('Ya hay una ola en camino'); return; }
  if (at && Math.hypot(at.x, at.z) > 8) tmpV.set(-at.x, 0, -at.z).normalize();
  else tmpV.set(camera.position.x - controls.target.x, 0, camera.position.z - controls.target.z).normalize();
  tsunami.dir.set(tmpV.x, tmpV.z);
  tsunami.phase = 'advance'; tsunami.front = tsunami.start; tsunami.t = 0;
  tsunami.speed = 9 + tsunami.height * 0.7;
  water.visible = true; toast('¡Tsunami en camino!');
  refreshRunning();
}
function tsunamiUpdate(dt) {
  if (tsunami.phase === 'idle') { Sfx.loop('water', 0); return; }
  tsunami.t += dt;
  const H = tsunami.height;
  if (tsunami.phase === 'advance') {
    tsunami.front += tsunami.speed * dt;
    tsunami.depth += (0.8 + H * 0.45 - tsunami.depth) * Math.min(1, dt * 0.8);
    tsunami.crest += (1 + H * 0.85 - tsunami.crest) * Math.min(1, dt * 1.2);
    if (tsunami.front > tsunami.end) { tsunami.phase = 'recede'; tsunami.t = 0; }
  } else {
    tsunami.depth *= Math.exp(-dt * 0.35); tsunami.crest *= Math.exp(-dt * 1.5);
    if (tsunami.depth < 0.05) { tsunami.phase = 'idle'; water.visible = false; tsunami.front = -200; refreshRunning(); }
  }
  waterMat.uniforms.uFront.value = tsunami.front; waterMat.uniforms.uDepth.value = tsunami.depth;
  waterMat.uniforms.uCrest.value = tsunami.crest; waterMat.uniforms.uTime.value += dt;
  water.position.set(controls.target.x * 0.5, 0, controls.target.z * 0.5);
  // spray along the breaking crest
  if (tsunami.phase === 'advance') {
    const px = -tsunami.dir.y, pz = tsunami.dir.x;
    const n = 4 + Math.round(H * 0.8);
    for (let i = 0; i < n; i++) {
      const u = rnd(-70, 70), s = tsunami.front - rnd(1, 5);
      const x = tsunami.dir.x * s + px * u, z = tsunami.dir.y * s + pz * u;
      const y = waterLevelAt(x, z);
      dust.emit(x, y + rnd(0, 0.8), z, tsunami.dir.x * rnd(4, 9) + rnd(-1, 1), rnd(2, 6 + H * 0.4), tsunami.dir.y * rnd(4, 9) + rnd(-1, 1), rnd(0.8, 1.6), rnd(1, 2.6), 0.9, 0.94, 0.96, 0.75, 1.5, 0.6, 9.8);
    }
  }
  const lvl = tsunami.phase === 'advance' ? 1 : Math.min(1, tsunami.depth);
  Sfx.loop('water', lvl * (0.3 + H * 0.05));
  const dFront = Math.abs(camera.position.x * tsunami.dir.x + camera.position.z * tsunami.dir.y - tsunami.front);
  if (tsunami.phase === 'advance' && dFront < 50) shake = Math.max(shake, 0.04 * H / 5 * (1 - dFront / 50));
}
const waveBreak = [];
function tsunamiForces(dt) {
  if (tsunami.phase === 'idle') return;
  const H = tsunami.height, F = tsunami.front, dx = tsunami.dir.x, dz = tsunami.dir.y;
  const flow = tsunami.phase === 'advance' ? tsunami.speed : -2.5;
  for (const it of dynItems()) {
    if (it.dead) continue;
    const t = it.body.translation();
    const s = t.x * dx + t.z * dz;
    if (s > F + 2.5) continue;
    const level = waterLevelAt(t.x, t.z);
    const hy = it.sy ? it.sy / 2 : 0.8;
    const sub = THREE.MathUtils.clamp((level - (t.y - hy)) / (2 * hy), 0, 1);
    if (sub <= 0) continue;
    const v = it.body.linvel();
    const nearFront = THREE.MathUtils.clamp(1 - (F - s) / 25, 0.25, 1);
    const k = (it.kind === 'block' ? 1.1 : 1.8) * sub;
    const fx = dx * flow * nearFront, fz = dz * flow * nearFront;
    let ax = (fx - v.x) * k, az = (fz - v.z) * k;
    const buoy = 9.81 * sub * (it.kind === 'block' ? 0.6 : it.kind === 'debris' ? 0.85 : 1.35);
    let ay = buoy - v.y * 0.8 * sub;
    if (tsunami.phase === 'advance' && s > F - 9) { const p = (5 + H * 1.6) * sub; ax += dx * p; az += dz * p; if (it.kind === 'block' && Math.random() < H * 0.06 * dt * sub) waveBreak.push(it); }
    const m = it.body.mass() * dt;
    it.body.applyImpulse({ x: ax * m, y: ay * m, z: az * m }, true);
  }
  let n = 0;
  while (waveBreak.length) { const it = waveBreak.pop(); if (n++ < 3) fragment(it, null, 2 + H * 0.3); }
  waveBreak.length = 0;
}

