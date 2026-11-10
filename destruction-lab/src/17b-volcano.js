/* ------------------------------------------------------------------ volcano */
// A cone pushes up through the city (kinematic body), then erupts: ash column, lava fountain,
// lava bombs that are real physical projectiles, and a lava flow that sets things on fire.
const volcano = { phase: 'idle', P: new THREE.Vector3(), t: 0, dur: 30, power: 6, h: 12, R: 16, body: null, mesh: null, lava: null, lavaR: 0, bombT: 0, light: null, bombs: [] };
const volcanoLight = new THREE.PointLight(0xff5a1a, 0, 120, 1.3);
scene.add(volcanoLight);
const lavaMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5,
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec2 vUv;
    float n(vec2 p){ return sin(p.x * 3.1 + sin(p.y * 2.3 + uTime * 0.6)) * sin(p.y * 2.7 + sin(p.x * 1.9 - uTime * 0.5)); }
    void main(){ vec2 c = vUv - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;
      vec2 p = c * 14.0; float v = n(p) * 0.5 + n(p * 2.1 + 3.0) * 0.35 + 0.5;
      float crust = smoothstep(0.35, 0.75, v);
      vec3 hot = mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.3, 0.02), crust);
      vec3 col = mix(hot, vec3(0.09, 0.05, 0.04), smoothstep(0.62, 0.9, v));
      float edge = 1.0 - smoothstep(0.8, 1.0, d);
      gl_FragColor = vec4(col, edge * uOpacity); }`,
});
function volcanoGeo(h, R) {
  const pts = [new THREE.Vector2(0, h * 0.82), new THREE.Vector2(R * 0.16, h * 0.86), new THREE.Vector2(R * 0.2, h), new THREE.Vector2(R * 0.34, h * 0.78),
    new THREE.Vector2(R * 0.55, h * 0.42), new THREE.Vector2(R * 0.8, h * 0.14), new THREE.Vector2(R, 0)];
  const g = new THREE.LatheGeometry(pts, 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { // rough the surface a little
    const y = pos.getY(i); if (y > 0.1 && y < h * 0.95) { const k = 1 + (Math.sin(i * 12.9898) * 0.5) * 0.08; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
  }
  g.computeVertexNormals();
  return g;
}
const volcanoMat = new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: 1, flatShading: true, emissive: 0xff3a00, emissiveIntensity: 0 });
function startVolcano(P) {
  if (volcano.phase === 'rising' || volcano.phase === 'erupt') { toast('El volcán ya está en erupción'); return; }
  clearVolcano();
  const s = volcano.power;
  volcano.h = 8 + s * 1.6; volcano.R = 11 + s * 1.3;
  volcano.P.set(P.x, 0, P.z); volcano.t = 0; volcano.phase = 'rising'; volcano.lavaR = 0; volcano.bombT = 1;
  volcano.mesh = new THREE.Mesh(volcanoGeo(volcano.h, volcano.R), volcanoMat);
  volcano.mesh.castShadow = true; volcano.mesh.receiveShadow = true;
  volcano.mesh.position.set(P.x, -volcano.h, P.z); scene.add(volcano.mesh);
  // physics: a kinematic cone that rises out of the ground and shoves what stands on it
  volcano.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(P.x, -volcano.h * 0.5, P.z));
  world.createCollider(RAPIER.ColliderDesc.cone(volcano.h * 0.5, volcano.R * 0.92).setFriction(0.9), volcano.body);
  volcano.lava = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lavaMat);
  volcano.lava.rotation.x = -Math.PI / 2; volcano.lava.position.set(P.x, 0.22, P.z); volcano.lava.scale.setScalar(0.01); scene.add(volcano.lava);
  toast('El suelo se abre: volcán en formación');
  refreshRunning();
}
function clearVolcano() {
  if (volcano.mesh) { scene.remove(volcano.mesh); volcano.mesh.geometry.dispose(); volcano.mesh = null; }
  if (volcano.lava) { scene.remove(volcano.lava); volcano.lava = null; }
  if (volcano.body && world) { try { world.removeRigidBody(volcano.body); } catch (e) {} }
  volcano.body = null; volcano.phase = 'idle'; volcanoLight.intensity = 0; volcanoMat.emissiveIntensity = 0;
  Sfx.loop('lava', 0);
}
function volcanoStep(dt) {
  if (volcano.phase === 'idle' || !volcano.body) return;
  const v = volcano;
  if (v.phase === 'rising') {
    const k = Math.min(1, v.t / 4);
    const e = 1 - (1 - k) * (1 - k);
    v.body.setNextKinematicTranslation({ x: v.P.x, y: v.h * 0.5 - v.h * (1 - e), z: v.P.z });
  }
  // lava flow: heat breaks pieces and pushes things outward slowly
  if (v.lavaR > 1) {
    for (const it of dynItems()) {
      if (it.dead) continue;
      const t = it.body.translation();
      const d = Math.hypot(t.x - v.P.x, t.z - v.P.z);
      if (d > v.lavaR || t.y > 4 || d < v.R * 0.7) continue;
      if (it.kind === 'block' && Math.random() < 0.25 * dt) fragment(it, null, 1.5);
      else if (Math.random() < 0.05 * dt * 60 && fires.length < 12 && it.kind !== 'debris') addFire(new THREE.Vector3(t.x, t.y, t.z), rnd(5, 9), 0.7);
    }
  }
}
function volcanoUpdate(dt) {
  const v = volcano;
  if (v.phase === 'idle') { env.ashTarget = 0; return; }
  v.t += dt;
  const s = v.power;
  if (v.phase === 'rising') {
    const k = Math.min(1, v.t / 4), e = 1 - (1 - k) * (1 - k);
    v.mesh.position.y = -v.h * (1 - e);
    addShake(0.04 * s * (1 - k * 0.5), v.P);
    Sfx.rumble(0.6 + s * 0.04);
    if (Math.random() < 0.7) { const a = rnd(0, 6.28), r = v.R * rnd(0.6, 1.1); dust.emit(v.P.x + Math.cos(a) * r, 0.5, v.P.z + Math.sin(a) * r, Math.cos(a) * 3, rnd(1, 4), Math.sin(a) * 3, rnd(2, 4), rnd(2.5, 4), 0.42, 0.38, 0.33, 0.7, 1.4, 1); }
    if (k >= 1) { v.phase = 'erupt'; v.t = 0; blast(new THREE.Vector3(v.P.x, v.h, v.P.z), 5 + s * 0.6, 6 + s, { noCrater: true }); toast('¡Erupción!'); refreshRunning(); }
    return;
  }
  const crater = new THREE.Vector3(v.P.x, v.h * 0.95, v.P.z);
  if (v.phase === 'erupt') {
    if (v.t > v.dur) { v.phase = 'dormant'; v.t = 0; refreshRunning(); }
    env.ashTarget = 0.35 + s * 0.05;
    volcanoMat.emissiveIntensity = 0.08 + 0.04 * Math.sin(v.t * 3);
    volcanoLight.position.set(crater.x, crater.y + 4, crater.z);
    volcanoLight.intensity = (350 + s * 60) * (0.8 + 0.3 * Math.sin(v.t * 13) * Math.sin(v.t * 7));
    v.lavaR = Math.min(v.R * 0.9 + 4 + s * 1.6, Math.max(v.lavaR, v.R * 0.7) + dt * (0.5 + s * 0.1));
    v.lava.scale.setScalar(Math.max(0.01, v.lavaR * 2));
    // ash column drifting with the wind
    for (let i = 0; i < 3 + s * 0.6; i++) {
      const g = rnd(0.14, 0.24);
      dust.emit(crater.x + rnd(-1.5, 1.5), crater.y + 1, crater.z + rnd(-1.5, 1.5), rnd(-1.5, 1.5) + 1.5, rnd(10, 16 + s), rnd(-1.5, 1.5) + 0.8, rnd(6, 10), rnd(4, 7), g, g - 0.01, g - 0.02, 0.8, 1.6, 0.35, 0);
    }
    // lava fountain
    for (let i = 0; i < 4 + s * 0.8; i++) fire.emit(crater.x, crater.y, crater.z, rnd(-4, 4), rnd(10, 18 + s), rnd(-4, 4), rnd(1.2, 2.2), rnd(0.8, 1.6), 1, rnd(0.35, 0.6), 0.05, 1, -0.2, 0.1, 9.8);
    // lava bombs (physical)
    v.bombT -= dt;
    if (v.bombT <= 0 && v.bombs.length < 12) {
      v.bombT = rnd(0.4, 1.4) * (11 - s) / 6;
      const r = rnd(0.45, 0.9) + s * 0.04, a = rnd(0, 6.28), sp = rnd(6, 13 + s * 1.2);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(crater.x + Math.cos(a), crater.y + 2, crater.z + Math.sin(a))
        .setLinvel(Math.cos(a) * sp, rnd(16, 24 + s), Math.sin(a) * sp).setCcdEnabled(true));
      const collider = world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(4).setRestitution(0.1), body);
      const obj = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: 0x2a1b12, emissive: 0xff5010, emissiveIntensity: 2.2, flatShading: true }));
      const item = addProp(body, collider, obj, { cool: 1, ttl: simTime + 18, trail: 2, bomb: { armed: simTime + 0.6, lastV: 20 } });
      v.bombs.push(item);
      Sfx.boom(0.25, soundDelay(crater));
    }
    Sfx.loop('lava', 0.35 + s * 0.04);
    if (Math.random() < 0.02) addShake(0.25, crater);
  } else if (v.phase === 'dormant') {
    env.ashTarget = Math.max(0, 0.3 - v.t * 0.02);
    volcanoLight.intensity *= Math.exp(-dt * 0.5);
    volcanoMat.emissiveIntensity *= Math.exp(-dt * 0.4);
    lavaMat.uniforms.uOpacity.value = Math.max(0.35, 1 - v.t * 0.03);
    if (Math.random() < 0.3) { const g = rnd(0.25, 0.35); dust.emit(crater.x, crater.y, crater.z, rnd(-0.5, 0.5) + 0.8, rnd(3, 6), rnd(-0.5, 0.5), rnd(5, 8), rnd(3, 5), g, g, g, 0.5, 1, 0.3, 0); }
    Sfx.loop('lava', Math.max(0, 0.3 - v.t * 0.02));
  }
  lavaMat.uniforms.uTime.value += dt;
  // lava bombs explode when they land
  for (let i = v.bombs.length - 1; i >= 0; i--) {
    const it = v.bombs[i];
    if (it.dead) { v.bombs.splice(i, 1); continue; }
    const lv = it.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), b = it.bomb;
    if (simTime > b.armed && sp < b.lastV * 0.55) {
      const t = it.body.translation();
      blast(new THREE.Vector3(t.x, t.y, t.z), 3 + s * 0.25, 3.5 + s * 0.3, { noCrater: t.y > 1.5 });
      v.bombs.splice(i, 1); it.bomb = null;
      continue;
    }
    b.lastV = sp;
  }
}
