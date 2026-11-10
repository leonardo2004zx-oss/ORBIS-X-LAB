/* ------------------------------------------------------------------ day/night cycle + storm/ash lighting */
const env = { hour: 15, auto: false, ash: 0, ashTarget: 0, night: 0 };
const C = (h) => new THREE.Color(h);
const LIGHT_PRESETS = {
  night: { top: C(0x060b1a), mid: C(0x1a2540), bot: C(0x0b0f17), fog: C(0x111a2b), sun: 0.45, sunCol: C(0x9fb6e8), hemi: 0.5, sky: C(0x5a6f99), ground: C(0x1a1814), night: 1 },
  dawn: { top: C(0x2d4778), mid: C(0xf2a77a), bot: C(0x5e5050), fog: C(0xd9a588), sun: 1.7, sunCol: C(0xffb27a), hemi: 0.85, sky: C(0xffd2b0), ground: C(0x5a4a40), night: 0.35 },
  day: { top: C(0x3f78c4), mid: C(0xd6e3ee), bot: C(0xa9b4bc), fog: C(0xcbd7e2), sun: 2.7, sunCol: C(0xfff0d8), hemi: 1.15, sky: C(0xe2eeff), ground: C(0x6a5b48), night: 0 },
  dusk: { top: C(0x2a3466), mid: C(0xff8a5a), bot: C(0x4a3a40), fog: C(0xc9876a), sun: 1.5, sunCol: C(0xff9a5a), hemi: 0.75, sky: C(0xffb89a), ground: C(0x4a3a34), night: 0.45 },
};
const LIGHT_KEYS = [[0, 'night'], [5, 'night'], [6.5, 'dawn'], [8.5, 'day'], [16.5, 'day'], [18.5, 'dusk'], [20, 'night'], [24, 'night']];
const ASH = { sky: C(0x4a3a32), fog: C(0x6a5040) };
const FLASH = C(0xdfe6ff);
const cur = { top: C(0), mid: C(0), bot: C(0), fog: C(0), sunCol: C(0), sky: C(0), ground: C(0), sun: 0, hemi: 0, night: 0 };
function sampleLight(h) {
  let i = 0; while (i < LIGHT_KEYS.length - 2 && h >= LIGHT_KEYS[i + 1][0]) i++;
  const [h0, a] = LIGHT_KEYS[i], [h1, b] = LIGHT_KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep(h, h0, h1), A = LIGHT_PRESETS[a], B = LIGHT_PRESETS[b];
  for (const key of ['top', 'mid', 'bot', 'fog', 'sunCol', 'sky', 'ground']) cur[key].copy(A[key]).lerp(B[key], k);
  for (const key of ['sun', 'hemi', 'night']) cur[key] = A[key] + (B[key] - A[key]) * k;
}
// stars, visible at night
const stars = (() => {
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = Math.acos(1 - Math.random() * 0.95); pos.set([Math.sin(e) * Math.cos(a) * 420, Math.cos(e) * 420, Math.sin(e) * Math.sin(a) * 420], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(p); return p;
})();
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();
const DAY_NAMES = [[5, 'Noche'], [7.5, 'Amanecer'], [17, 'Día'], [19.5, 'Atardecer'], [24, 'Noche']];
function hourName(h) { for (const [lim, n] of DAY_NAMES) if (h < lim) return n; return 'Noche'; }
function updateLighting(dt) {
  if (env.auto) { env.hour = (env.hour + dt * 0.1) % 24; if (Math.random() < 0.02) syncHourUI(); }
  sampleLight(env.hour);
  env.ash += (env.ashTarget - env.ash) * Math.min(1, dt * 0.4);
  skyFlash *= Math.exp(-dt * 9);
  const d = storm.dark, ash = env.ash, night = cur.night;
  env.night = night;
  const sky = scene.userData.skyMat.uniforms;
  for (const k of ['top', 'mid', 'bot']) sky[k].value.copy(cur[k]).lerp(SKY1[k], d * (1 - night * 0.6)).lerp(ASH.sky, ash).lerp(FLASH, skyFlash * 0.7);
  scene.fog.color.copy(cur.fog).lerp(SKY1.fog, d * (1 - night * 0.6)).lerp(ASH.fog, ash);
  scene.fog.near = 110 - d * 50 - ash * 50; scene.fog.far = 300 - d * 120 - ash * 110;
  hemi.color.copy(cur.sky); hemi.groundColor.copy(cur.ground);
  hemi.intensity = cur.hemi * (1 - 0.55 * d) * (1 - 0.35 * ash) + skyFlash * 2.5;
  sun.color.copy(cur.sunCol); if (ash > 0.05) sun.color.lerp(C(0xff9a6a), ash * 0.6);
  sun.intensity = cur.sun * (1 - 0.8 * d) * (1 - 0.55 * ash);
  // sun path across the sky; the moon takes over at night
  const a = Math.PI * (env.hour - 6) / 12, e = Math.max(0.28, Math.sin(Math.min(Math.PI, Math.max(0, a))));
  sunDir.set(Math.cos(a) * 0.9, e, 0.45).normalize().lerp(moonDir, night).normalize();
  const lit = Math.max(night, d * 0.55, ash * 0.45);
  nightU.value = lit;
  lampMat.emissiveIntensity = lit * 3;
  stars.material.opacity = night * (1 - d) * (1 - ash);
  stars.position.copy(camera.position);
  waterMat.uniforms.uDark.value = Math.max(d, night * 0.75);
  riverMat.uniforms.uDark.value = Math.max(d * 0.8, night * 0.75);
  riverMat.uniforms.uTime.value += dt;
  const fl = 1 - 0.6 * Math.max(d, night * 0.9);
  for (const m of funnel.children) m.material.uniforms.uLight.value = fl;
  renderer.toneMappingExposure = 1.05 + night * 0.25;
}
