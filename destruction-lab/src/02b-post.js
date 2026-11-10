/* ------------------------------------------------------------------ post-processing + environment reflections */
// "gfx.enhanced" switches between the old look ("antes") and the new one ("después") on the same scene.
const gfx = { enhanced: store.get('gfx', true), post: store.get('post', true), composer: null, bloom: null, grade: null, ready: false, pmrem: null, envRT: null, envKey: '', envAt: -10 };
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uTint: { value: new THREE.Color(1, 1, 1) }, uContrast: { value: 1.06 }, uSat: { value: 1.08 }, uTime: { value: 0 }, uGrain: { value: 0.018 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uContrast, uSat, uTime, uGrain; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0);
      vec3 col = c.rgb * uTint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.18) * uContrast + 0.18;
      vec2 d = vUv - 0.5; col *= 1.0 - uVignette * dot(d, d) * 2.2;
      float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain * max(0.15, l);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};
async function initPost() {
  try {
    const base = 'three/addons/postprocessing/';
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
      import(base + 'EffectComposer.js'), import(base + 'RenderPass.js'), import(base + 'UnrealBloomPass.js'), import(base + 'ShaderPass.js'), import(base + 'OutputPass.js')]);
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: isCoarse ? 0 : 4 });
    gfx.composer = new EffectComposer(renderer, rt);
    gfx.composer.addPass(new RenderPass(scene, camera));
    gfx.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.85);
    gfx.composer.addPass(gfx.bloom);
    gfx.grade = new ShaderPass(GradeShader);
    gfx.composer.addPass(gfx.grade);
    gfx.composer.addPass(new OutputPass());
    gfx.ready = true;
  } catch (e) {
    console.warn('Post-processing unavailable:', e && e.message);
    gfx.ready = false;
  }
}
function renderFrame() {
  if (gfx.enhanced && gfx.post && gfx.ready && Q.post) { gfx.grade.uniforms.uTime.value = (gfx.grade.uniforms.uTime.value + 0.017) % 10; gfx.composer.render(); }
  else renderer.render(scene, camera);
}

// Environment map: a small copy of the sky (plus sun and a horizon skyline) is turned into
// a reflection/ambient map with PMREM. Rebuilt only when the time of day or weather changes.
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: scene.userData.skyMat.uniforms,
  vertexShader: scene.userData.skyMat.vertexShader, fragmentShader: scene.userData.skyMat.fragmentShader,
}));
envScene.add(envSky);
const envSun = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
envScene.add(envSun);
const envGround = new THREE.Mesh(new THREE.CircleGeometry(100, 32), new THREE.MeshBasicMaterial({ color: 0x3a3c3a }));
envGround.rotation.x = -Math.PI / 2; envGround.position.y = -2; envScene.add(envGround);
{
  const g = new THREE.BoxGeometry(1, 1, 1), m = new THREE.MeshBasicMaterial({ color: 0x2c3036 });
  const sk = new THREE.InstancedMesh(g, m, 70), M = new THREE.Matrix4();
  for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2, r = 80, h = 4 + Math.random() * 16, w = 5 + Math.random() * 6; M.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(3, h, w)); sk.setMatrixAt(i, M); }
  envScene.add(sk); envScene.userData.skyline = m;
}
function updateEnvironment(force) {
  if (!gfx.enhanced) { if (scene.environment) scene.environment = null; return; }
  if (!gfx.pmrem) { gfx.pmrem = new THREE.PMREMGenerator(renderer); }
  const key = Math.round(env.hour * 3) + '|' + Math.round(storm.dark * 8) + '|' + Math.round(env.ash * 8);
  const now = performance.now() / 1000;
  if (!force && (key === gfx.envKey || now - gfx.envAt < 1.2)) { if (!scene.environment && gfx.envRT) scene.environment = gfx.envRT.texture; return; }
  gfx.envKey = key; gfx.envAt = now;
  envSun.position.copy(sunDir).multiplyScalar(90);
  envSun.material.color.copy(sun.color).multiplyScalar(2 + sun.intensity * 6);
  envGround.material.color.copy(cur.ground).multiplyScalar(0.35 + 0.4 * (1 - cur.night));
  envScene.userData.skyline.color.setRGB(0.12, 0.13, 0.15).multiplyScalar(1 - cur.night * 0.7);
  const rt = gfx.pmrem.fromScene(envScene, 0.02);
  if (gfx.envRT) gfx.envRT.dispose();
  gfx.envRT = rt;
  scene.environment = rt.texture;
}
