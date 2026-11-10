/* ------------------------------------------------------------------ thunderstorm */
const storm = { on: false, rate: 5, dark: 0, next: 1.5, dur: 45, life: 0 };
const SKY0 = { top: new THREE.Color(0x3f78c4), mid: new THREE.Color(0xd6e3ee), bot: new THREE.Color(0xa9b4bc), fog: new THREE.Color(0xcbd7e2) };
const SKY1 = { top: new THREE.Color(0x1c2129), mid: new THREE.Color(0x4a525d), bot: new THREE.Color(0x30353c), fog: new THREE.Color(0x48505a) };
let skyFlash = 0;
const RAIN_N = 1100;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 6);
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xb8c6d6, transparent: true, opacity: 0, depthWrite: false }));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
for (let i = 0; i < RAIN_N; i++) { rainPos[i * 6] = rnd(-60, 60); rainPos[i * 6 + 1] = rnd(0, 60); rainPos[i * 6 + 2] = rnd(-60, 60); }
function setStorm(on) { storm.on = on; if (on) { storm.next = 1.2; storm.life = 0; toast('Tormenta eléctrica'); } refreshRunning(); }
function strike(P) {
  const top = new THREE.Vector3(P.x + rnd(-12, 12), 85, P.z + rnd(-12, 12));
  const pts = [top];
  const N = 14;
  for (let i = 1; i < N; i++) { const k = i / N; pts.push(new THREE.Vector3().lerpVectors(top, P, k).add(new THREE.Vector3(rnd(-2.2, 2.2), rnd(-1, 1), rnd(-2.2, 2.2)))); }
  pts.push(P.clone());
  const group = new THREE.Group();
  const addBolt = (points, r, glowR) => {
    const path = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
    const core = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 2, r, 4, false), new THREE.MeshBasicMaterial({ color: 0xf4f7ff, transparent: true, fog: false }));
    const glow = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 2, glowR, 6, false), new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    group.add(core, glow);
  };
  addBolt(pts, 0.14, 0.7);
  for (let b = 0; b < 2; b++) {
    const from = pts[3 + Math.floor(Math.random() * 6)];
    const br = [from]; let p = from.clone();
    for (let i = 0; i < 5; i++) { p = p.clone().add(new THREE.Vector3(rnd(-3, 3), -rnd(3, 6), rnd(-3, 3))); br.push(p); }
    addBolt(br, 0.07, 0.35);
  }
  scene.add(group);
  effects.push({ t: 0, dur: 0.45, update(e, k) { const on = k < 0.12 || (k > 0.22 && k < 0.32) || (k > 0.45 && k < 0.5); group.children.forEach((m, i) => (m.material.opacity = (on ? 1 : 0.15) * (i % 2 ? 0.35 : 1) * (1 - k))); }, end() { scene.remove(group); group.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); } });
  skyFlash = 1;
  flashLight.color.setHex(0xc8d8ff);
  blast(P, 2.6 + storm.rate * 0.3, 3 + storm.rate * 0.35, { silent: true, noCrater: P.y > 2.5, noFireball: true });
  flashLight.position.set(P.x, P.y + 6, P.z); flashLight.intensity = 6000;
  addFire(P, rnd(7, 12), 0.9);
  const dist = camera.position.distanceTo(P);
  Sfx.thunder(Math.min(1.5, dist / 340));
  for (let i = 0; i < 20; i++) fire.emit(P.x, P.y + 0.3, P.z, rnd(-6, 6), rnd(2, 9), rnd(-6, 6), rnd(0.2, 0.5), rnd(0.25, 0.5), 0.7, 0.8, 1, 1, 0, 0.5, 9.8);
}
function stormUpdate(dt) {
  storm.dark += ((storm.on ? 1 : 0) - storm.dark) * Math.min(1, dt * 0.8);
  const d = storm.dark;
  if (storm.on && (storm.life += dt) > storm.dur) setStorm(false);
  if (flashLight.intensity < 50 && flashLight.color.getHex() !== 0xffa24a) flashLight.color.setHex(0xffa24a);
  rain.visible = d > 0.02;
  if (rain.visible) {
    rain.material.opacity = 0.45 * d;
    const cx = camera.position.x * 0.6 + controls.target.x * 0.4, cz = camera.position.z * 0.6 + controls.target.z * 0.4;
    for (let i = 0; i < RAIN_N; i++) {
      const j = i * 6;
      rainPos[j + 1] -= 38 * dt; rainPos[j] += 4 * dt;
      if (rainPos[j + 1] < 0 || Math.abs(rainPos[j] - cx) > 60 || Math.abs(rainPos[j + 2] - cz) > 60) { rainPos[j] = cx + rnd(-60, 60); rainPos[j + 1] = rnd(30, 60); rainPos[j + 2] = cz + rnd(-60, 60); }
      rainPos[j + 3] = rainPos[j] - 0.25; rainPos[j + 4] = rainPos[j + 1] + 1.6; rainPos[j + 5] = rainPos[j + 2];
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  Sfx.loop('rain', d * 0.35);
  if (storm.on && d > 0.5) {
    storm.next -= dt;
    if (storm.next <= 0) {
      storm.next = rnd(0.5, 2.2) * (11 - storm.rate) / 5;
      // lightning prefers tall things: sample a few spots, keep the highest
      let best = null;
      for (let i = 0; i < 4; i++) { const p = pickDown(rnd(-40, 40), rnd(-30, 30)); if (!best || p.y > best.y) best = p; }
      strike(best);
    }
  }
}

