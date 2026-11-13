/* ------------------------------------------------------------------ ground, streets, river (visual, follows quake) */
// City layout (meters). The river crosses the main avenue; a destructible bridge spans it.
const RIVER = { x0: 52, x1: 64, floor: -4, water: -1.4 };
const STREETS = [
  { axis: 'x', c: 0, w: 9, a: -100, b: RIVER.x0 }, { axis: 'x', c: 0, w: 9, a: RIVER.x1, b: 100 },
  { axis: 'x', c: -36, w: 8, a: -100, b: RIVER.x0 },
  { axis: 'z', c: -40, w: 8, a: -60, b: 34 }, { axis: 'z', c: 0, w: 8, a: -60, b: 34 }, { axis: 'z', c: 36, w: 8, a: -60, b: 34 },
];
const LOTS = [
  [-80, -44, 4.5, 30], [-36, -4, 4.5, 30], [4, 32, 4.5, 30], [40, 52, 4.5, 30],
  [-80, -44, -32, -4.5], [-36, -4, -32, -4.5], [4, 32, -32, -4.5], [40, 52, -32, -4.5],
];
const groundGroup = new THREE.Group();
scene.add(groundGroup);
const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
function flat(w, d, mat, x, y, z, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.rotation.z = rotZ; m.position.set(x, y, z); m.receiveShadow = true; groundGroup.add(m); return m;
}
const groundMesh = flat(RIVER.x0 + 420, 840, grassMat, (RIVER.x0 - 420) / 2, 0, 0);
flat(420 - RIVER.x1, 840, grassMat, (420 + RIVER.x1) / 2, 0, 0);
grassTex.repeat.set(100, 100);
// river bed, walls and flowing water
flat(RIVER.x1 - RIVER.x0, 320, new THREE.MeshStandardMaterial({ map: mudTex, roughness: 1 }), (RIVER.x0 + RIVER.x1) / 2, RIVER.floor, 0);
mudTex.repeat.set(3, 80);
for (const [x, ry] of [[RIVER.x0, Math.PI / 2], [RIVER.x1, -Math.PI / 2]]) {
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(320, -RIVER.floor), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
  wm.rotation.y = ry; wm.position.set(x, RIVER.floor / 2, 0); wm.receiveShadow = true; groundGroup.add(wm);
}
wallTex.repeat.set(60, 1);
const riverMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uDark: { value: 0 } },
  vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float uTime; uniform float uDark; varying vec2 vP;
    void main(){ float s = sin(vP.y * 0.9 - uTime * 2.2 + sin(vP.x * 1.7) * 1.2) * 0.5 + 0.5; float s2 = sin(vP.y * 2.3 - uTime * 3.1 + vP.x * 0.8) * 0.5 + 0.5;
      vec3 c = mix(vec3(0.13, 0.30, 0.33), vec3(0.32, 0.50, 0.50), s * 0.6 + s2 * 0.25); c += pow(s * s2, 6.0) * 0.35; c *= 1.0 - uDark * 0.7; gl_FragColor = vec4(c, 0.88); }`,
});
const riverWater = flat(RIVER.x1 - RIVER.x0, 320, riverMat, (RIVER.x0 + RIVER.x1) / 2, RIVER.water, 0);
riverWater.receiveShadow = false;
// sidewalks (one slab per city block) and streets
const plazaMat = new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.95 });
plazaTex.repeat.set(1, 1);
for (const [x0, x1, z0, z1] of LOTS) {
  const t = plazaTex.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / 5, (z1 - z0) / 5);
  flat(x1 - x0, z1 - z0, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), (x0 + x1) / 2, 0.04, (z0 + z1) / 2);
}
STREETS.forEach((s, i) => {
  const len = s.b - s.a, t = streetTex.clone(); t.needsUpdate = true; t.repeat.set(len / 12, 1);
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  if (s.axis === 'x') flat(len, s.w, mat, (s.a + s.b) / 2, 0.08 - i * 0.004, s.c);
  else flat(len, s.w, mat, s.c, 0.06 - i * 0.004, (s.a + s.b) / 2, Math.PI / 2);
});
const craters = [];
