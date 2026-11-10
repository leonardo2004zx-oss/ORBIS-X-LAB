/* ------------------------------------------------------------------ animated fireball + shockwave shell (enhanced graphics) */
// The fireball is a sphere displaced by animated 3D noise; color goes white → yellow → orange → red → soot
// and it dissolves from the inside out. It is a visual approximation, not a fluid simulation.
const NOISE_GLSL = `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;
const fireballGeoHD = new THREE.IcosahedronGeometry(1, 4);
function makeFireballMat(seed) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uAge: { value: 0 }, uSeed: { value: seed }, uLight: { value: 1 } },
    vertexShader: `${NOISE_GLSL}
      uniform float uTime, uAge, uSeed; varying float vN; varying vec3 vNormalV; varying vec3 vViewDir;
      void main(){
        vec3 p = position;
        float n = snoise(p * 1.6 + vec3(0.0, -uTime * 1.8, 0.0) + uSeed) * 0.55 + snoise(p * 3.8 + uTime * 1.1 + uSeed) * 0.3 + snoise(p * 8.0 - uTime * 1.5 + uSeed) * 0.12;
        vN = n;
        p *= 1.0 + 0.32 * n + uAge * 0.15 * max(0.0, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormalV = normalize(normalMatrix * normal); vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uAge, uLight; varying float vN; varying vec3 vNormalV; varying vec3 vViewDir;
      void main(){
        float facing = clamp(dot(vNormalV, vViewDir), 0.0, 1.0);
        float heat = clamp(0.3 + vN * 0.95 + facing * 0.3 - uAge * 1.25, 0.0, 1.0);
        float sootPatch = (1.0 - smoothstep(-0.45, -0.05, vN)) * smoothstep(0.05, 0.4, uAge + 0.15);
        if (uAge > 0.5 && heat < (uAge - 0.5) * 0.9 + vN * 0.2) discard;
        vec3 soot = vec3(0.06, 0.05, 0.045) * (0.5 + 0.7 * uLight);
        vec3 col = mix(soot, vec3(0.55, 0.06, 0.01) * 2.2, smoothstep(0.08, 0.32, heat));
        col = mix(col, vec3(1.0, 0.36, 0.04) * 3.2, smoothstep(0.32, 0.6, heat));
        col = mix(col, vec3(1.0, 0.82, 0.45) * 5.5, smoothstep(0.66, 0.95, heat));
        col = mix(col, soot, sootPatch * 0.85);
        float a = clamp(1.3 - uAge * 0.95, 0.0, 1.0) * smoothstep(0.0, 0.45, facing) * mix(0.7, 1.0, smoothstep(0.1, 0.4, heat));
        gl_FragColor = vec4(col, a); }`,
  });
}
function hdFireball(P, radius, power) {
  const n = power >= 7 ? 3 : 2, balls = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(fireballGeoHD, makeFireballMat(Math.random() * 50));
    m.position.set(P.x + rnd(-1, 1) * radius * 0.12, P.y + 0.5, P.z + rnd(-1, 1) * radius * 0.12);
    m.userData.s = radius * (0.38 + Math.random() * 0.2) * (i ? 0.75 : 1); m.userData.rise = rnd(2, 4) + power * 0.25;
    scene.add(m); balls.push(m);
  }
  const dur = 1.7 + power * 0.08;
  effects.push({ t: 0, dur, update(e, k) {
    for (const m of balls) {
      const g = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
      m.scale.setScalar(m.userData.s * (0.25 + 0.75 * g + k * 0.35));
      m.position.y += m.userData.rise * 0.016 * (0.3 + k);
      m.material.uniforms.uTime.value = e.t; m.material.uniforms.uAge.value = k; m.material.uniforms.uLight.value = dust.mat.uniforms.uLight.value;
      m.rotation.y += 0.01;
    }
  }, end() { for (const m of balls) { scene.remove(m); m.material.dispose(); } } });
}
const shellMatHD = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.FrontSide,
  uniforms: { uOpacity: { value: 1 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * 1.6, f * uOpacity); }',
});
