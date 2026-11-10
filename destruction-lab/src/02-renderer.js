/* ------------------------------------------------------------------ renderer */
const app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: !isCoarse, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcbd7e2, 110, 300);
const camera = new THREE.PerspectiveCamera(55, 1, 1, 800);

// sky dome
{
  const g = new THREE.SphereGeometry(450, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f78c4) }, mid: { value: new THREE.Color(0xd6e3ee) }, bot: { value: new THREE.Color(0xa9b4bc) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, min(1.0, -h*4.0)); gl_FragColor = vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(g, m));
  scene.userData.skyMat = m;
}

const hemi = new THREE.HemisphereLight(0xe2eeff, 0x6a5b48, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
sun.position.set(45, 75, 30);
sun.shadow.camera.left = -62; sun.shadow.camera.right = 62;
sun.shadow.camera.top = 62; sun.shadow.camera.bottom = -62;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun);
const flashLight = new THREE.PointLight(0xffa24a, 0, 90, 1.2);
scene.add(flashLight);

function applyRenderQuality() {
  Q = QUALITY[settings.quality];
  renderer.setPixelRatio(Q.dpr);
  const sh = settings.shadows && Q.shadowSize > 0;
  renderer.shadowMap.enabled = sh;
  sun.castShadow = sh;
  if (sh) {
    sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } });
  onResize();
}

