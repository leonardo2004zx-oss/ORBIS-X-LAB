/* DUAL PROJECTOR LAB — simulador de Edge Blending con dos proyectores.
 * Three.js r147 (script clásico: funciona abriendo index.html con doble clic, sin servidor).
 *
 * Idea central: UNA sola imagen fuente (panorama, patrón o video) se reparte entre
 * dos proyectores virtuales. Un shader calcula, para cada punto de la pantalla,
 * cuánta luz llega de A y de B (en luz lineal), con rampa de fusión, brillo,
 * color, nivel de negro y geometría de cada proyector. La vista 2D y la 3D
 * usan exactamente el mismo shader, así que muestran el mismo resultado.
 */
(function () {
  'use strict';

  /* ======================= Estado ======================= */
  const SIZES = [100, 150, 200, 250, 300];
  const NATIVE_W = 1920, NATIVE_H = 1080;      // "Full HD" nominal (supuesto)
  const SCREEN_BOTTOM = 0.9;                    // m: altura del borde inferior de la imagen
  const SEAT_EYE = 1.15;                        // m: altura de ojos sentado (aprox.)
  const PERSON_H = 1.75;                        // m

  function defaultProj() {
    return { on: true, dx: 0, dy: 0, dist: 3, zoom: 1, rot: 0, key: 0, bright: 1, r: 1, g: 1, b: 1 };
  }

  const S = {
    mode: 'C',
    view: '3d',            // '3d' | '2d'
    cam: 'front',          // 'front' | 'tech' | 'seat'
    quality: 'medium',
    sizeIn: 150,
    throwRatio: 1.4,       // SUPUESTO editable (no es dato del Gadnic C45N)
    overlap: 0.15,         // fracción del ancho de UN proyector compartida por ambos
    blend: 1,              // intensidad de la rampa (0 = sin fusión)
    gamma: 2.2,            // gamma de compensación de la rampa
    curve: 1,              // 0 = rampa lineal, 1 = curva suave (smoothstep)
    black: 0.003,          // nivel de negro relativo (aproximación visual)
    edges: false,
    showRef: true,
    beams: true,
    source: 'sunset',
    fit: 'cover',
    P: [defaultProj(), defaultProj()],
    tab: 0
  };

  /* ======================= Geometría (cálculo exacto) ======================= */
  function screen169(diagIn) {
    const k = Math.sqrt(16 * 16 + 9 * 9);
    const d = diagIn * 0.0254;
    return { d: d, w: d * 16 / k, h: d * 9 / k };
  }
  function ref() { return screen169(S.sizeIn); }
  function requiredDist() { return ref().w * S.throwRatio; }
  function centerY() { return SCREEN_BOTTOM + ref().h / 2; }

  // Geometría física de cada proyector en la pantalla (m, coordenadas del mundo)
  function projGeo(i) {
    const p = S.P[i], R = ref(), o = S.overlap;
    const baseX = (i ? 1 : -1) * R.w * (1 - o) / 2;
    const w = p.dist / S.throwRatio * p.zoom;
    return {
      lensX: baseX + p.dx, lensY: centerY() + p.dy, lensZ: p.dist,
      cx: baseX + p.dx, cy: centerY() + p.dy, w: w, h: w * 9 / 16,
      rot: p.rot * Math.PI / 180, key: p.key
    };
  }
  function planeSize() {
    const R = ref(), Wc = R.w * (2 - S.overlap);
    return { w: Wc * 1.12 + 0.8, h: R.h * 1.22 + 0.4 };
  }

  /* ======================= Three.js básico ======================= */
  const canvas = document.getElementById('gl');
  const stage = document.getElementById('stage');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'low-power', alpha: false });
  } catch (e) {
    document.getElementById('nogl').hidden = false;
    console.error(e);
    return;
  }
  renderer.setClearColor(0x050509);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050509, 14, 60);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI * 0.95;
  controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.zoomSpeed = 1.1;

  const scene2d = new THREE.Scene();
  const cam2d = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

  /* ---------- Fuente de imagen ---------- */
  const srcCanvas = document.createElement('canvas');
  const canvasTex = new THREE.CanvasTexture(srcCanvas);
  [canvasTex].forEach(prepTex);
  function prepTex(t) {
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }
  const video = document.getElementById('vid');
  let videoTex = null, imageTex = null, imageAspect = 16 / 9, videoName = '', imageName = '';

  /* ---------- Shader de la pantalla (compartido 2D/3D) ---------- */
  const uniforms = {
    uSrc: { value: canvasTex }, uScale: { value: new THREE.Vector2(1, 1) }, uOff: { value: new THREE.Vector2(0, 0) },
    uPlane: { value: new THREE.Vector2(1, 1) }, uO: { value: 0.15 }, uT: { value: 1.85 },
    uGA: { value: new THREE.Vector4() }, uGB: { value: new THREE.Vector4() }, uKey: { value: new THREE.Vector2() },
    uCA: { value: new THREE.Vector4(1, 1, 1, 1) }, uCB: { value: new THREE.Vector4(1, 1, 1, 1) }, uOn: { value: new THREE.Vector2(1, 1) },
    uBlend: { value: 1 }, uGam: { value: 2.2 }, uCurve: { value: 1 }, uBlack: { value: 0.003 },
    uEdges: { value: 0 }, uRef: { value: new THREE.Vector3(1, 1, 1) }, uAmb: { value: 0.0015 }
  };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: uniforms, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D uSrc; uniform vec2 uScale; uniform vec2 uOff; uniform vec2 uPlane;',
      'uniform float uO; uniform float uT; uniform vec4 uGA; uniform vec4 uGB; uniform vec2 uKey;',
      'uniform vec4 uCA; uniform vec4 uCB; uniform vec2 uOn;',
      'uniform float uBlend; uniform float uGam; uniform float uCurve; uniform float uBlack;',
      'uniform float uEdges; uniform vec3 uRef; uniform float uAmb;',
      'varying vec2 vUv;',
      'float inUnit(vec2 p){ return step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0); }',
      // luz (lineal) que aporta un proyector al punto P de la pantalla
      'vec3 proj(vec2 P, vec4 g, float key, vec4 c, float isB, out vec2 uv, out float ins, out vec2 sz){',
      '  vec2 d = P - g.xy; float cs = cos(g.w), sn = sin(g.w);',
      '  d = vec2(cs*d.x + sn*d.y, -sn*d.x + cs*d.y);',
      '  float h = g.z * 0.5625; float v = d.y / h + 0.5;',
      '  float wk = g.z * (1.0 + key * (v - 0.5)); float u = d.x / wk + 0.5;',
      '  uv = vec2(u, v); sz = vec2(wk, h); ins = inUnit(uv);',
      '  if (ins < 0.5) return vec3(0.0);',
      '  vec2 s = vec2((u + isB * (1.0 - uO)) / uT, v);',          // porción de la fuente que le toca
      '  vec2 m = s * uScale + uOff;',
      '  vec3 enc = texture2D(uSrc, m).rgb * inUnit(m);',
      '  float t = isB > 0.5 ? u / max(uO, 1e-4) : (1.0 - u) / max(uO, 1e-4);',
      '  t = clamp(t, 0.0, 1.0);',
      '  float w = mix(t, t*t*(3.0-2.0*t), uCurve);',
      '  w = uO > 0.0005 ? w : 1.0;',
      '  w = mix(1.0, w, uBlend);',
      '  float re = pow(max(w, 1e-5), 1.0 / uGam);',                  // rampa aplicada a la señal
      '  vec3 sig = max(clamp(enc * c.rgb, 0.0, 1.0) * re, vec3(1e-5));',
      '  vec3 L = pow(sig, vec3(2.2)) + uBlack;',                      // el negro NO se puede atenuar
      '  return L * c.a;',
      '}',
      'void main(){',
      '  vec2 P = (vUv - 0.5) * uPlane;',
      '  vec2 uva = vec2(0.0), uvb = vec2(0.0), sza = vec2(1.0), szb = vec2(1.0); float ia = 0.0, ib = 0.0;',
      '  vec3 L = vec3(0.0);',
      '  if (uOn.x > 0.5) L += proj(P, uGA, uKey.x, uCA, 0.0, uva, ia, sza);',
      '  if (uOn.y > 0.5) L += proj(P, uGB, uKey.y, uCB, 1.0, uvb, ib, szb);',
      '  vec3 col = L * 0.9 + uAmb;',
      '  col = 1.0 - exp(-col * 1.7);',                                // curva de exposición (aprox. visual)
      '  col = pow(col, vec3(1.0/2.2));',
      '  float th = uPlane.x * 0.0018;',
      '  if (uEdges > 0.5) {',
      '    if (ia > 0.5) { float e = min(min(uva.x*sza.x,(1.0-uva.x)*sza.x), min(uva.y*sza.y,(1.0-uva.y)*sza.y));',
      '      if (e < th) col = mix(col, vec3(1.0,0.55,0.15), 0.9);',
      '      if (uO > 0.0005 && abs((1.0 - uO - uva.x) * sza.x) < th*0.6) col = mix(col, vec3(1.0,0.55,0.15), 0.6); }',
      '    if (ib > 0.5) { float e = min(min(uvb.x*szb.x,(1.0-uvb.x)*szb.x), min(uvb.y*szb.y,(1.0-uvb.y)*szb.y));',
      '      if (e < th) col = mix(col, vec3(0.2,0.8,1.0), 0.9);',
      '      if (uO > 0.0005 && abs((uO - uvb.x) * szb.x) < th*0.6) col = mix(col, vec3(0.2,0.8,1.0), 0.6); }',
      '  }',
      '  if (uRef.z > 0.5) { float b = max(abs(P.x) - uRef.x*0.5, abs(P.y) - uRef.y*0.5);',
      '    if (abs(b) < th*0.7 && mod(P.x + P.y, 0.25) < 0.14) col = mix(col, vec3(1.0,0.85,0.2), 0.65); }',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  /* ======================= Escena 3D ======================= */
  let roomGroup = null;
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  scene.add(screenMesh);
  const screen2d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  scene2d.add(screen2d);
  const group2d = new THREE.Group(); scene2d.add(group2d);

  scene.add(new THREE.AmbientLight(0x8890b0, 0.32));
  const hemi = new THREE.HemisphereLight(0x6070a0, 0x201014, 0.35); scene.add(hemi);
  const screenLight = new THREE.PointLight(0xfff0e0, 1.1, 30, 1.6); scene.add(screenLight);

  function lambert(c, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {})); }
  function basic(c, extra) { return new THREE.MeshBasicMaterial(Object.assign({ color: c }, extra || {})); }

  function disposeGroup(g) {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }

  function textSprite(txt, color, scale) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = color; x.font = 'bold 72px Segoe UI, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, 128, 68);
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(scale * 2, scale, 1);
    return s;
  }

  // Sillón (recliner) simple a partir de cajas
  function makeArmchair(color) {
    const g = new THREE.Group(), m = lambert(color);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.6), m); seat.position.set(0, 0.42, 0); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.16), m); back.position.set(0, 0.78, 0.3); back.rotation.x = -0.18; g.add(back);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.6), lambert(0x15151a)); base.position.set(0, 0.17, 0); g.add(base);
    [-1, 1].forEach(function (s) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.66), m); arm.position.set(s * 0.38, 0.55, 0.02); g.add(arm);
    });
    return g; // ancho total ≈ 0.9 m, alto ≈ 1.1 m
  }

  function makePerson() {
    const g = new THREE.Group(), m = lambert(0xc9cfdb), d = lambert(0x3a4256);
    [-0.1, 0.1].forEach(function (x) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.85, 8), d); leg.position.set(x, 0.425, 0); g.add(leg);
    });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.62, 10), m); torso.position.y = 1.16; g.add(torso);
    [-0.25, 0.25].forEach(function (x) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.6, 6), m); arm.position.set(x, 1.13, 0); arm.rotation.z = x > 0 ? 0.08 : -0.08; g.add(arm);
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); head.position.y = 1.6; g.add(head);
    return g; // 1,71 m + pelo ≈ 1,75 m
  }

  function makeProjector(label, color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.24), lambert(0x2a2d36)); g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.012, 0.25), lambert(color)); top.position.y = 0.066; g.add(top);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 16), lambert(0x111111));
    lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, -0.14); g.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), basic(0xfff6e0));
    glass.position.set(0, 0, -0.166); glass.rotation.y = Math.PI; g.add(glass);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), lambert(0x3a3a44)); pole.name = 'pole'; g.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 16), lambert(0x22222a)); foot.name = 'foot'; g.add(foot);
    const spr = textSprite(label, color === 0xff9a3c ? '#ffb070' : '#7fd4ff', 0.22); spr.position.set(0, 0.26, 0); g.add(spr);
    g.userData = { glass: glass };
    return g;
  }

  const projMeshes = [makeProjector('A', 0xff9a3c), makeProjector('B', 0x3cb8ff)];
  projMeshes.forEach(function (m) { scene.add(m); });

  // Haces de luz: pirámide (lente → 4 esquinas de la imagen)
  function makeBeam() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    // el haz se desvanece hacia la pantalla para no "lavar" la imagen proyectada
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false
    }));
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, fog: false }));
    mesh.frustumCulled = false; lines.frustumCulled = false;
    scene.add(mesh); scene.add(lines);
    return { mesh: mesh, lines: lines };
  }
  const beams = [makeBeam(), makeBeam()];

  function imageCorners(G) {
    const out = [];
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(function (c) {
      const v = c[1], wk = G.w * (1 + G.key * (v - 0.5));
      const lx = (c[0] - 0.5) * wk, ly = (v - 0.5) * G.h;
      const cs = Math.cos(G.rot), sn = Math.sin(G.rot);
      out.push([G.cx + cs * lx - sn * ly, G.cy + sn * lx + cs * ly, 0.003]);
    });
    return out;
  }

  let seatZ = 5, roomDepth = 10, roomW = 10, roomH = 4;
  function buildRoom() {
    if (roomGroup) { scene.remove(roomGroup); disposeGroup(roomGroup); }
    roomGroup = new THREE.Group();
    const R = ref(), Wc = R.w * (2 - S.overlap), cy = centerY(), dist = requiredDist();
    const pl = planeSize();
    roomW = Math.max(Wc + 5, 10);
    roomH = Math.max(cy + R.h / 2 + 1.3, 4);
    seatZ = dist + 1.1;
    roomDepth = Math.max(seatZ + 5, 10);
    const lowQ = S.quality === 'low';

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomDepth + 0.5, lowQ ? 8 : 24, lowQ ? 8 : 24), lambert(0x241a1f));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, roomDepth / 2 - 0.25); roomGroup.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomDepth + 0.5), lambert(0x0c0c12));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, roomH, roomDepth / 2 - 0.25); roomGroup.add(ceil);
    const wallM = lambert(0x16141c);
    [-1, 1].forEach(function (s) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(roomDepth + 0.5, roomH, lowQ ? 6 : 16, 4), wallM);
      w.rotation.y = -s * Math.PI / 2; w.position.set(s * roomW / 2, roomH / 2, roomDepth / 2 - 0.25); roomGroup.add(w);
      // tiras LED (estética de cine)
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, roomDepth), basic(s < 0 ? 0x4a6bff : 0xff3d7f, { fog: false }));
      led.position.set(s * (roomW / 2 - 0.03), 0.12, roomDepth / 2); roomGroup.add(led);
      const led2 = led.clone(); led2.position.y = roomH - 0.1; roomGroup.add(led2);
      // paneles acústicos
      for (let z = 1.5; z < roomDepth - 1; z += 2.2) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, roomH * 0.5, 1.6), lambert(0x221d2a));
        p.position.set(s * (roomW / 2 - 0.05), roomH * 0.52, z); roomGroup.add(p);
      }
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallM);
    back.rotation.y = Math.PI; back.position.set(0, roomH / 2, roomDepth); roomGroup.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), lambert(0x07070a));
    front.position.set(0, roomH / 2, -0.06); roomGroup.add(front);
    // marco negro (terciopelo) detrás del lienzo
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(pl.w + 0.3, pl.h + 0.3), basic(0x020203));
    frame.position.set(0, cy, -0.02); roomGroup.add(frame);
    // escenario
    const stg = new THREE.Mesh(new THREE.BoxGeometry(Math.min(roomW - 0.4, pl.w + 1), 0.35, 1.2), lambert(0x111018));
    stg.position.set(0, 0.175, 0.6); roomGroup.add(stg);
    const stgLed = new THREE.Mesh(new THREE.BoxGeometry(Math.min(roomW - 0.4, pl.w + 1), 0.02, 0.02), basic(0xffb070, { fog: false }));
    stgLed.position.set(0, 0.34, 1.21); roomGroup.add(stgLed);

    // butacas (InstancedMesh: barato aunque haya muchas)
    const rows = lowQ ? 2 : 4, perRow = Math.floor((roomW - 2) / 0.75);
    const seatGeo = new THREE.BoxGeometry(0.62, 0.45, 0.6), backGeo = new THREE.BoxGeometry(0.62, 0.65, 0.12);
    const seatIM = new THREE.InstancedMesh(seatGeo, lambert(0x5a1220), rows * perRow);
    const backIM = new THREE.InstancedMesh(backGeo, lambert(0x6e1626), rows * perRow);
    const mtx = new THREE.Matrix4(); let n = 0;
    for (let r = 0; r < rows; r++) {
      const z = seatZ + 1.3 + r * 1.1, y = r * 0.18;
      for (let k = 0; k < perRow; k++) {
        const x = (k - (perRow - 1) / 2) * 0.75;
        if (Math.abs(x) < 0.5 && r === 0) continue;
        mtx.makeTranslation(x, y + 0.225, z); seatIM.setMatrixAt(n, mtx);
        mtx.makeTranslation(x, y + 0.75, z + 0.3); backIM.setMatrixAt(n, mtx); n++;
      }
      if (r > 0) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(roomW, y, 1.1), lambert(0x1c1418));
        step.position.set(0, y / 2, z); roomGroup.add(step);
      }
    }
    seatIM.count = backIM.count = n;
    roomGroup.add(seatIM); roomGroup.add(backIM);

    // sillón protagonista (desde donde se mira) y persona de referencia
    const chair = makeArmchair(0xb3202e); chair.position.set(0, 0, seatZ); roomGroup.add(chair);
    const person = makePerson(); person.position.set(-Wc / 2 - 0.45, 0, 1.0); roomGroup.add(person);
    const pLabel = textSprite('1,75 m', '#ffffff', 0.18); pLabel.position.set(person.position.x, 2.0, 1.0); roomGroup.add(pLabel);
    scene.add(roomGroup);

    screenLight.position.set(0, cy, 2.2);
    scene.fog.near = roomDepth * 0.9; scene.fog.far = roomDepth * 3;
  }

  /* ======================= 2D (vista de calibración) ======================= */
  function build2D() {
    disposeGroup(group2d); group2d.clear();
    const pl = planeSize(), cy = centerY();
    const floorY = -cy;
    const mk = function (w, h, x, y, c) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic(c)); m.position.set(x, y, 0.01); group2d.add(m); return m; };
    mk(pl.w + 4, 0.02, -1, floorY, 0x555566);              // piso
    const px = -pl.w / 2 - 1.9;                              // persona (silueta 1,75 m)
    mk(0.38, 0.62, px, floorY + 1.16, 0x8a93a8);
    mk(0.12, 0.85, px - 0.1, floorY + 0.425, 0x5b6378); mk(0.12, 0.85, px + 0.1, floorY + 0.425, 0x5b6378);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), basic(0x8a93a8)); head.position.set(px, floorY + 1.62, 0.01); group2d.add(head);
    const cx = -pl.w / 2 - 0.75;                             // sillón ≈ 0,9 × 1,1 m
    mk(0.9, 0.45, cx, floorY + 0.4, 0xb3202e); mk(0.62, 0.62, cx + 0.02, floorY + 0.85, 0x8e1824);
    mk(0.14, 0.3, cx - 0.38, floorY + 0.6, 0xb3202e); mk(0.14, 0.3, cx + 0.38, floorY + 0.6, 0xb3202e);
    for (let i = 0; i < 2; i++) mk(0.5, 0.03, -pl.w / 2 + 0.3 + i * 0.5 + 0.25, floorY + 0.12, i ? 0xffffff : 0x888888); // regla 1 m
  }
  function fit2D() {
    const pl = planeSize(), cy = centerY();
    const x0 = -pl.w / 2 - 2.4, x1 = pl.w / 2 + 0.3, y0 = -cy - 0.25, y1 = pl.h / 2 + 0.15;
    const a = stage.clientWidth / Math.max(1, stage.clientHeight);
    let w = x1 - x0, h = y1 - y0;
    if (w / h > a) h = w / a; else w = h * a;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    cam2d.left = mx - w / 2 * 1.03; cam2d.right = mx + w / 2 * 1.03; cam2d.top = my + h / 2 * 1.03; cam2d.bottom = my - h / 2 * 1.03;
    cam2d.updateProjectionMatrix();
  }

  /* ======================= Aplicar estado → escena ======================= */
  let lastLayoutKey = '';
  function applyState() {
    const pl = planeSize(), cy = centerY(), R = ref();
    const layoutKey = S.sizeIn + '|' + S.overlap.toFixed(3) + '|' + S.throwRatio + '|' + S.quality;
    if (layoutKey !== lastLayoutKey) {
      lastLayoutKey = layoutKey;
      screenMesh.geometry.dispose(); screenMesh.geometry = new THREE.PlaneGeometry(pl.w, pl.h);
      screen2d.geometry.dispose(); screen2d.geometry = new THREE.PlaneGeometry(pl.w, pl.h);
      screenMesh.position.set(0, cy, 0);
      buildRoom(); build2D(); fit2D();
    }
    uniforms.uPlane.value.set(pl.w, pl.h);
    uniforms.uO.value = S.overlap; uniforms.uT.value = 2 - S.overlap;
    [0, 1].forEach(function (i) {
      const p = S.P[i], G = projGeo(i);
      (i ? uniforms.uGB : uniforms.uGA).value.set(G.cx, G.cy - cy, G.w, G.rot);
      (i ? uniforms.uCB : uniforms.uCA).value.set(p.r, p.g, p.b, p.bright);
      if (i) uniforms.uKey.value.y = G.key; else uniforms.uKey.value.x = G.key;
      // modelo del proyector
      const m = projMeshes[i];
      m.position.set(G.lensX, G.lensY, G.lensZ + 0.14);
      const pole = m.getObjectByName('pole'), foot = m.getObjectByName('foot');
      const hh = Math.max(0.05, G.lensY - 0.06);
      pole.scale.y = hh; pole.position.y = -0.06 - hh / 2; foot.position.y = -G.lensY + 0.02;
      m.userData.glass.material.color.setHex(p.on ? 0xfff6e0 : 0x222222);
      // haz
      const b = beams[i], c = imageCorners(G), apex = [G.lensX, G.lensY, G.lensZ - 0.03];
      const pa = b.mesh.geometry.attributes.position;
      pa.setXYZ(0, apex[0], apex[1], apex[2]);
      for (let k = 0; k < 4; k++) pa.setXYZ(k + 1, c[k][0], c[k][1], c[k][2]);
      pa.needsUpdate = true; b.mesh.geometry.computeBoundingSphere();
      const la = b.lines.geometry.attributes.position; let q = 0;
      for (let k = 0; k < 4; k++) {
        la.setXYZ(q++, apex[0], apex[1], apex[2]); la.setXYZ(q++, c[k][0], c[k][1], c[k][2]);
        la.setXYZ(q++, c[k][0], c[k][1], c[k][2]); la.setXYZ(q++, c[(k + 1) % 4][0], c[(k + 1) % 4][1], c[(k + 1) % 4][2]);
      }
      la.needsUpdate = true;
      const tech = S.cam === 'tech';
      const col = tech ? (i ? 0x5ab8ff : 0xffa050) : 0xfff2dc;
      b.mesh.material.color.setHex(col); b.lines.material.color.setHex(col);
      b.mesh.material.opacity = (tech ? 0.14 : (S.quality === 'low' ? 0.06 : 0.08)) * Math.min(1.5, p.bright);
      b.lines.material.opacity = tech ? 0.55 : 0.18;
      b.mesh.visible = p.on && S.beams; b.lines.visible = b.mesh.visible && tech; // contornos solo en la vista técnica
    });
    uniforms.uOn.value.set(S.P[0].on ? 1 : 0, S.P[1].on ? 1 : 0);
    uniforms.uBlend.value = S.blend; uniforms.uGam.value = S.gamma; uniforms.uCurve.value = S.curve; uniforms.uBlack.value = S.black;
    uniforms.uEdges.value = S.edges ? 1 : 0;
    uniforms.uRef.value.set(R.w, R.h, S.showRef ? 1 : 0);
    screenLight.intensity = 0.25 + 0.45 * ((S.P[0].on ? S.P[0].bright : 0) + (S.P[1].on ? S.P[1].bright : 0));
    updateSourceTransform();
    requestRender();
    scheduleInfo();
  }

  /* ======================= Fuente: canvas / imagen / video ======================= */
  let lastSrcKey = '';
  function srcMaxW() { return S.quality === 'low' ? 1536 : S.quality === 'medium' ? 2560 : 3840; }
  function refreshSource(force) {
    const D = window.DPLContent.SOURCES;
    if (D[S.source]) {
      const key = S.source + '|' + S.overlap.toFixed(3) + '|' + srcMaxW();
      if (force || key !== lastSrcKey) {
        lastSrcKey = key;
        window.DPLContent.render(srcCanvas, S.source, S.overlap, srcMaxW());
        canvasTex.needsUpdate = true;
      }
      uniforms.uSrc.value = canvasTex;
    } else if (S.source === 'video' && videoTex) {
      uniforms.uSrc.value = videoTex;
    } else if (S.source === 'image' && imageTex) {
      uniforms.uSrc.value = imageTex;
    }
    updateSourceTransform();
    updateMediaUI();
    requestRender();
  }
  function updateSourceTransform() {
    const As = (2 - S.overlap) * 16 / 9;
    let Am = As;
    if (S.source === 'video' && video.videoWidth) Am = video.videoWidth / video.videoHeight;
    else if (S.source === 'image') Am = imageAspect;
    const sc = uniforms.uScale.value.set(1, 1), of = uniforms.uOff.value.set(0, 0);
    if (S.fit === 'stretch' || Math.abs(Am - As) < 1e-6) return;
    if (S.fit === 'cover') {
      if (Am > As) { sc.x = As / Am; of.x = (1 - sc.x) / 2; } else { sc.y = Am / As; of.y = (1 - sc.y) / 2; }
    } else { // contain
      if (Am > As) { const f = As / Am; sc.y = 1 / f; of.y = -(1 - f) / (2 * f); }
      else { const f = Am / As; sc.x = 1 / f; of.x = -(1 - f) / (2 * f); }
    }
  }

  /* ======================= Cámara ======================= */
  let tween = null;
  function camPreset(name, instant) {
    S.cam = name;
    const R = ref(), cy = centerY(), Wc = R.w * (2 - S.overlap);
    let pos, tgt;
    if (name === 'seat') {
      pos = new THREE.Vector3(0, SEAT_EYE, seatZ + 0.05); tgt = new THREE.Vector3(0, cy, 0);
    } else if (name === 'tech') {
      pos = new THREE.Vector3(roomW * 0.42, roomH * 0.92, seatZ * 0.95 + 1.5);
      tgt = new THREE.Vector3(0, cy * 0.75, seatZ * 0.32);
    } else {
      const a = camera.aspect, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = Math.max((Wc * 0.58) / (t * a), (R.h * 0.62) / t);
      pos = new THREE.Vector3(0, cy, Math.min(d, roomDepth - 0.3)); tgt = new THREE.Vector3(0, cy, 0);
    }
    if (instant) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); }
    else tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: tgt };
    applyState(); updateTopbar();
  }

  /* ======================= Bucle de render bajo demanda ======================= */
  let dirty = true, frames = 0, fpsT = performance.now(), fps = 0, lastVideoT = 0, lastRenderMs = 0;
  function requestRender() { dirty = true; }
  controls.addEventListener('change', requestRender);

  function pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return S.quality === 'low' ? Math.min(dpr, 1) * 0.6 : S.quality === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 2);
  }
  let lastPortrait = null;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 1 ? 72 : 50;   // en vertical se abre el ángulo en vez de alejar la cámara
    camera.updateProjectionMatrix();
    // al girar el teléfono, se vuelve a encuadrar la pantalla para la nueva orientación
    const portrait = h > w;
    if (lastPortrait !== null && portrait !== lastPortrait && typeof camPreset === 'function' && document.body.classList.contains('ready')) camPreset(S.cam, true);
    lastPortrait = portrait;
    fit2D(); requestRender();
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function renderNow() {
    const t0 = performance.now();
    if (S.view === '2d') renderer.render(scene2d, cam2d); else renderer.render(scene, camera);
    lastRenderMs = performance.now() - t0;
    if (S.view === '2d') place2DLabels();
  }

  const keys = {};
  function loop(now) {
    requestAnimationFrame(loop);
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / 650), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e);
      if (k >= 1) tween = null;
      dirty = true;
    }
    if (S.view === '3d') { if (controls.update()) dirty = true; if (walk(now)) dirty = true; }
    const playing = S.source === 'video' && !video.paused && !video.ended;
    const vInterval = S.quality === 'low' ? 1000 / 24 : 1000 / 30;
    if (playing && now - lastVideoT >= vInterval) { lastVideoT = now; dirty = true; drawVideoFrame(); updateVideoTime(); }
    if (!dirty) return;
    dirty = false;
    renderNow();
    frames++;
    adaptQuality(now);
  }
  // Calidad adaptable: si durante una interacción continua los cuadros tardan > 50 ms, baja un nivel
  let lastFrameT = 0, slow = 0, fast = 0, adaptOn = true;
  function adaptQuality(now) {
    const dt = now - lastFrameT; lastFrameT = now;
    if (!adaptOn || dt > 250) return;            // solo cuenta cuadros seguidos (girando, video)
    if (dt > 50) { slow++; fast = 0; } else { fast++; if (fast > 30) slow = Math.max(0, slow - 1); }
    if (slow >= 25 && S.quality !== 'low') {
      slow = 0; setQuality(S.quality === 'high' ? 'medium' : 'low');
      toast('Calidad reducida automáticamente para que vaya más fluido (' + (S.quality === 'low' ? 'Baja' : 'Media') + ').');
    }
  }
  function setQuality(q) {
    S.quality = q; $('quality').value = q; $('quality2').value = q;
    resize(); refreshSource(); applyState();
  }
  // indicador de rendimiento: en reposo no se dibuja nada (0 % de GPU)
  setInterval(function () {
    const now = performance.now();
    fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    document.getElementById('fps').textContent = (fps < 0.5 ? 'en reposo' : fps.toFixed(0) + ' fps') + ' · ' + lastRenderMs.toFixed(1) + ' ms/cuadro';
  }, 1000);

  // Recorrido con teclado (WASD / flechas, Q/E sube/baja) — sin bloqueo del puntero
  let lastWalk = 0;
  function walk(now) {
    const dt = Math.min(0.05, (now - (lastWalk || now)) / 1000); lastWalk = now;
    let f = 0, s = 0, u = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
    if (keys.KeyE) u += 1; if (keys.KeyQ) u -= 1;
    if (!f && !s && !u) return false;
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 6 : 2.5) * dt;
    const dir = new THREE.Vector3().subVectors(controls.target, camera.position); dir.y = 0; dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const mv = dir.multiplyScalar(f * sp).add(right.multiplyScalar(s * sp)); mv.y = u * sp;
    camera.position.add(mv); controls.target.add(mv);
    return true;
  }
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', function (e) { keys[e.code] = true; if (/Arrow/.test(e.code)) e.preventDefault(); });
  canvas.addEventListener('keyup', function (e) { keys[e.code] = false; });
  canvas.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('pointerdown', function () { canvas.focus({ preventScroll: true }); });

  /* ======================= Etiquetas 2D ======================= */
  const lbl2d = document.getElementById('labels2d');
  function place2DLabels() {
    const R = ref(), cy = centerY(), pl = planeSize();
    const W = stage.clientWidth, H = stage.clientHeight;
    const toPx = function (x, y) {
      return [(x - cam2d.left) / (cam2d.right - cam2d.left) * W, (cam2d.top - y) / (cam2d.top - cam2d.bottom) * H];
    };
    const items = [
      ['A', projGeo(0).cx, projGeo(0).cy - cy + projGeo(0).h / 2 + 0.12, 'la'],
      ['B', projGeo(1).cx, projGeo(1).cy - cy + projGeo(1).h / 2 + 0.12, 'lb'],
      ['Persona 1,75 m', -pl.w / 2 - 1.9, -cy + 1.95, ''],
      ['Sillón ≈ 0,9 m', -pl.w / 2 - 0.75, -cy + 1.35, ''],
      ['1 m', -pl.w / 2 + 0.8, -cy + 0.3, ''],
      ['16:9 ' + S.sizeIn + '″ = ' + (R.w * 100).toFixed(0) + ' × ' + (R.h * 100).toFixed(0) + ' cm', 0, -R.h / 2 - 0.12, 'lref']
    ];
    lbl2d.innerHTML = items.map(function (it) {
      const p = toPx(it[1], it[2]);
      return '<span class="l2 ' + it[3] + '" style="left:' + p[0].toFixed(0) + 'px;top:' + p[1].toFixed(0) + 'px">' + it[0] + '</span>';
    }).join('');
  }

  /* ======================= Modos A / B / C ======================= */
  const MODES = {
    A: {
      title: 'Modo A — Sin calibración',
      desc: 'Los dos proyectores se superponen sin rampa de fusión, con un pequeño error de posición, de giro y de color, como dos equipos recién puestos. La zona compartida se ve el doble de brillante y la unión se nota.'
    },
    B: {
      title: 'Modo B — Calibración manual',
      desc: 'Arranca con una rampa lineal sin compensación gamma y con los errores del modo A. Ajustá vos la geometría de B, la superposición, la gamma y el brillo hasta que desaparezca la banda. Cualquier ajuste manual te trae a este modo.'
    },
    C: {
      title: 'Modo C — Fusión optimizada',
      desc: 'Geometría alineada para que la superposición física coincida con la del contenido, colores y brillo igualados, y rampa suave compensada en gamma 2,2 (la suma de luz da 1 en toda la zona). Lo que no se puede corregir es el nivel de negro: en escenas oscuras la franja sigue apareciendo.'
    }
  };
  function misalign(p) {
    Object.assign(p, { dx: 0.035, dy: -0.022, rot: 0.35, key: 0.012, zoom: 1.006, bright: 0.86, r: 1.07, g: 0.99, b: 0.88 });
  }
  function setMode(m) {
    S.mode = m;
    const d = requiredDist();
    S.P.forEach(function (p) { Object.assign(p, { dx: 0, dy: 0, rot: 0, key: 0, zoom: 1, dist: d, bright: 1, r: 1, g: 1, b: 1 }); });
    if (m === 'A') { misalign(S.P[1]); S.blend = 0; S.gamma = 1; S.curve = 0; }
    if (m === 'B') { misalign(S.P[1]); S.blend = 1; S.gamma = 1; S.curve = 0; }
    if (m === 'C') { S.blend = 1; S.gamma = 2.2; S.curve = 1; if (S.overlap < 0.08) S.overlap = 0.15; }
    refreshSource(); refreshUI(); applyState();
  }
  function autoAlign() {
    const d = requiredDist();
    S.P.forEach(function (p) { Object.assign(p, { dx: 0, dy: 0, rot: 0, key: 0, zoom: 1, dist: d }); });
    touchManual(); refreshUI(); applyState();
  }
  function touchManual() { if (S.mode !== 'B') { S.mode = 'B'; updateModeUI(); } }

  /* ======================= Interfaz ======================= */
  const $ = function (id) { return document.getElementById(id); };
  const sliders = [];
  function slider(parent, o) {
    const row = document.createElement('div'); row.className = 'ctl';
    row.innerHTML = '<label><span>' + o.label + '</span><output></output></label><input type="range">';
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.min = o.min; inp.max = o.max; inp.step = o.step;
    if (o.title) row.title = o.title;
    if (o.id) inp.id = o.id;
    const ref = { refresh: function () { const v = o.get(); inp.value = v; out.textContent = o.fmt(v); } };
    inp.addEventListener('input', function () {
      o.set(parseFloat(inp.value)); out.textContent = o.fmt(o.get());
      if (o.calib) touchManual();
      if (o.after) o.after();
      applyState();
    });
    inp.addEventListener('dblclick', function () { if (o.reset !== undefined) { o.set(o.reset); ref.refresh(); if (o.calib) touchManual(); if (o.after) o.after(); applyState(); } });
    parent.appendChild(row); sliders.push(ref); ref.refresh();
    return ref;
  }
  function pct(v) { return Math.round(v * 100) + ' %'; }
  function cm(v) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' cm'; }

  function buildUI() {
    // modos
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });
    // vista / cámara / calidad
    $('btn2d').addEventListener('click', function () { setView(S.view === '3d' ? '2d' : '3d'); });
    $('btnFT').addEventListener('click', function () { if (S.view === '2d') setView('3d'); camPreset(S.cam === 'tech' ? 'front' : 'tech'); });
    $('btnSeat').addEventListener('click', function () { if (S.view === '2d') setView('3d'); camPreset('seat'); });
    $('quality').value = S.quality; $('quality2').value = S.quality;
    $('quality').addEventListener('change', function () { setQuality($('quality').value); });
    $('quality2').addEventListener('change', function () { setQuality($('quality2').value); });
    $('autoQ').addEventListener('change', function () { adaptOn = $('autoQ').checked; });
    // Vista inicial
    function resetView() { setView('3d'); camPreset('front'); }
    $('btnReset').addEventListener('click', resetView);
    // Barra táctil del celular
    $('mReset').addEventListener('click', resetView);
    $('mView').addEventListener('click', function () { setView(S.view === '3d' ? '2d' : '3d'); });
    $('mTech').addEventListener('click', function () { if (S.view === '2d') setView('3d'); camPreset(S.cam === 'tech' ? 'front' : 'tech'); });
    $('mPanel').addEventListener('click', function () { setSheet(!document.body.classList.contains('sheet-open')); });
    $('panelClose').addEventListener('click', function () { setSheet(false); });
    $('mFull').addEventListener('click', toggleFullscreen);
    $('wvClose').addEventListener('click', function () { $('wvBanner').hidden = true; });
    $('wvCopy').addEventListener('click', function () {
      const u = location.href.split('#')[0];
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(function () { toast('Enlace copiado. Pegalo en Chrome.'); }, function () { toast(u); });
      else toast(u);
    });
    $('btnPanel').addEventListener('click', function () { document.body.classList.toggle('panel-hidden'); setTimeout(resize, 50); });

    // contenido
    const sel = $('source');
    const D = window.DPLContent.SOURCES;
    sel.innerHTML = '<optgroup label="Imágenes panorámicas">' + ['sunset', 'city'].map(function (k) { return '<option value="' + k + '">' + D[k].label.replace('Panorama: ', '') + '</option>'; }).join('') +
      '<option value="image">Imagen propia (cargá un archivo)</option></optgroup>' +
      '<optgroup label="Patrones de calibración">' + ['grid', 'bars', 'gray50', 'white', 'black'].map(function (k) { return '<option value="' + k + '">' + D[k].label.replace('Patrón: ', '') + '</option>'; }).join('') + '</optgroup>' +
      '<optgroup label="Video"><option value="video">Video local (cargá un archivo)</option></optgroup>';
    sel.value = S.source;
    sel.addEventListener('change', function () {
      const v = sel.value;
      if (v === 'video' && !videoTex) { sel.value = S.source; toast('Primero tocá “Cargar video local…” (o arrastrá un video sobre la vista).'); return; }
      if (v === 'image' && !imageTex) { sel.value = S.source; toast('Primero tocá “Cargar imagen…” o arrastrá una imagen sobre la vista.'); return; }
      if (S.source === 'video' && v !== 'video') video.pause();
      S.source = v; refreshSource();
    });
    // Botones de archivo: el <input type="file"> real cubre el botón, así que el clic del usuario
    // lo activa directamente (no hay .click() por código, que algunos marcos protegidos bloquean).
    document.querySelectorAll('input[type=file][data-kind]').forEach(function (inp) {
      const kind = inp.dataset.kind;
      inp.addEventListener('click', function () { watchPicker(inp); setFileStatus('Abriendo ' + (kind === 'image' ? 'la galería / selector de imágenes…' : 'el selector de videos…')); });
      inp.addEventListener('change', function () { pickerDone(); const f = inp.files && inp.files[0]; if (f) handleFile(f, kind); inp.value = ''; });
      inp.addEventListener('cancel', function () { pickerDone(); setFileStatus('Selección cancelada.'); });
    });
    $('pickBlockedClose').addEventListener('click', function () { $('pickBlocked').hidden = true; });
    // Arrastrar y soltar un archivo sobre la vista
    let dragDepth = 0;
    stage.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; $('dropZone').hidden = false; });
    stage.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    stage.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; $('dropZone').hidden = true; } });
    stage.addEventListener('drop', function (e) {
      e.preventDefault(); dragDepth = 0; $('dropZone').hidden = true;
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) handleFile(f); else toast('No llegó ningún archivo. Arrastralo desde el Explorador de Windows.');
    });
    // Pegar un archivo copiado en el Explorador (Ctrl+C → Ctrl+V)
    document.addEventListener('paste', function (e) {
      const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (f) { e.preventDefault(); handleFile(f); }
    });
    $('fit').addEventListener('change', function () { S.fit = $('fit').value; applyState(); });
    $('vPlay').addEventListener('click', function () { if (video.paused) video.play(); else video.pause(); });
    $('vMute').addEventListener('click', function () { video.muted = !video.muted; updateMediaUI(); });
    $('vSeek').addEventListener('input', function () { if (video.duration) video.currentTime = $('vSeek').value / 1000 * video.duration; });
    ['play', 'pause', 'seeked', 'loadeddata'].forEach(function (ev) { video.addEventListener(ev, function () { if (videoTex === rawVideoTex && videoTex) videoTex.needsUpdate = true; drawVideoFrame(); updateMediaUI(); requestRender(); }); });

    // pantalla
    const sz = $('sizes');
    sz.innerHTML = SIZES.map(function (s) { return '<button data-size="' + s + '">' + s + '″</button>'; }).join('');
    sz.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.sizeIn = +b.dataset.size;
        const d = requiredDist(); S.P.forEach(function (p) { p.dist = d; });
        refreshUI(); applyState(); camPreset(S.cam, true);
      });
    });
    const scr = $('screenCtl');
    slider(scr, { label: 'Relación de proyección (supuesto)', min: 0.5, max: 2.5, step: 0.01, reset: 1.4, get: function () { return S.throwRatio; }, set: function (v) { S.throwRatio = v; const d = requiredDist(); S.P.forEach(function (p) { p.dist = d; }); }, fmt: function (v) { return v.toFixed(2) + ' : 1'; }, after: function () { refreshUI(); }, title: 'Distancia ÷ ancho de imagen. No es un dato verificado del Gadnic C45N: medilo en tu proyector y ponelo acá.' });
    $('showRef').checked = S.showRef; $('showRef').addEventListener('change', function () { S.showRef = $('showRef').checked; applyState(); });
    $('showBeams').checked = S.beams; $('showBeams').addEventListener('change', function () { S.beams = $('showBeams').checked; applyState(); });

    // fusión
    const bl = $('blendCtl');
    slider(bl, { id: 'sOverlap', label: 'Superposición', min: 0, max: 0.4, step: 0.005, reset: 0.15, calib: true, get: function () { return S.overlap; }, set: function (v) { S.overlap = v; }, fmt: function (v) { return pct(v) + ' · ' + Math.round(v * NATIVE_W) + ' px'; }, after: function () { refreshSource(); } });
    slider(bl, { id: 'sBlend', label: 'Intensidad del Edge Blending', min: 0, max: 1, step: 0.01, reset: 1, calib: true, get: function () { return S.blend; }, set: function (v) { S.blend = v; }, fmt: pct });
    slider(bl, { id: 'sGamma', label: 'Gamma de compensación', min: 1, max: 3, step: 0.05, reset: 2.2, calib: true, get: function () { return S.gamma; }, set: function (v) { S.gamma = v; }, fmt: function (v) { return v.toFixed(2); }, title: 'La rampa se aplica a la señal; el proyector la eleva a ~2,2. Con 2,2 la luz suma exactamente 1.' });
    slider(bl, { id: 'sCurve', label: 'Forma de la transición (lineal → suave)', min: 0, max: 1, step: 0.01, reset: 1, calib: true, get: function () { return S.curve; }, set: function (v) { S.curve = v; }, fmt: pct });
    slider(bl, { label: 'Nivel de negro (aprox. visual)', min: 0, max: 0.04, step: 0.001, reset: 0.003, get: function () { return S.black; }, set: function (v) { S.black = v; }, fmt: function (v) { return (v * 100).toFixed(1) + ' %'; } });
    $('edges').addEventListener('change', function () { S.edges = $('edges').checked; applyState(); });
    $('btnAuto').addEventListener('click', autoAlign);

    // proyectores (pestañas)
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { S.tab = +b.dataset.tab; refreshUI(); }); });
    [0, 1].forEach(function (i) {
      const box = $('proj' + i), P = function () { return S.P[i]; };
      const tg = document.createElement('label'); tg.className = 'switch';
      tg.innerHTML = '<input type="checkbox" id="on' + i + '" checked><span></span> Proyector ' + (i ? 'B' : 'A') + ' encendido';
      box.appendChild(tg);
      tg.querySelector('input').addEventListener('change', function (e) { P().on = e.target.checked; applyState(); });
      const h = function (t) { const e = document.createElement('h4'); e.textContent = t; box.appendChild(e); };
      h('Posición y distancia');
      slider(box, { id: 'x' + i, label: 'Posición horizontal', min: -0.5, max: 0.5, step: 0.001, reset: 0, calib: true, get: function () { return P().dx; }, set: function (v) { P().dx = v; }, fmt: cm });
      slider(box, { id: 'y' + i, label: 'Posición vertical', min: -0.5, max: 0.5, step: 0.001, reset: 0, calib: true, get: function () { return P().dy; }, set: function (v) { P().dy = v; }, fmt: cm });
      slider(box, { id: 'd' + i, label: 'Distancia a la pantalla', min: 0.5, max: 22, step: 0.01, calib: true, get: function () { return P().dist; }, set: function (v) { P().dist = v; }, fmt: function (v) { return v.toFixed(2) + ' m'; } });
      slider(box, { id: 'z' + i, label: 'Tamaño de proyección (zoom)', min: 0.8, max: 1.2, step: 0.001, reset: 1, calib: true, get: function () { return P().zoom; }, set: function (v) { P().zoom = v; }, fmt: function (v) { return (v * 100).toFixed(1) + ' %'; } });
      h('Alineación geométrica básica');
      slider(box, { id: 'r' + i, label: 'Rotación', min: -3, max: 3, step: 0.01, reset: 0, calib: true, get: function () { return P().rot; }, set: function (v) { P().rot = v; }, fmt: function (v) { return v.toFixed(2) + '°'; } });
      slider(box, { id: 'k' + i, label: 'Trapecio vertical (keystone)', min: -0.1, max: 0.1, step: 0.001, reset: 0, calib: true, get: function () { return P().key; }, set: function (v) { P().key = v; }, fmt: function (v) { return (v * 100).toFixed(1) + ' %'; } });
      h('Brillo y color');
      slider(box, { id: 'b' + i, label: 'Brillo', min: 0, max: 1.5, step: 0.01, reset: 1, calib: true, get: function () { return P().bright; }, set: function (v) { P().bright = v; }, fmt: pct });
      ['r', 'g', 'b'].forEach(function (c, ci) {
        slider(box, { id: c + 'g' + i, label: ['Rojo', 'Verde', 'Azul'][ci], min: 0.5, max: 1.5, step: 0.01, reset: 1, calib: true, get: function () { return P()[c]; }, set: function (v) { P()[c] = v; }, fmt: pct });
      });
      const br = document.createElement('button'); br.className = 'btn small'; br.textContent = 'Igualar color y brillo con el otro proyector';
      br.addEventListener('click', function () { const o = S.P[1 - i]; ['bright', 'r', 'g', 'b'].forEach(function (k) { P()[k] = o[k]; }); touchManual(); refreshUI(); applyState(); });
      box.appendChild(br);
    });

    $('help').addEventListener('click', function () { $('helpBox').hidden = !$('helpBox').hidden; });
    $('helpBox').addEventListener('click', function () { $('helpBox').hidden = true; });
  }

  function refreshUI() {
    sliders.forEach(function (s) { s.refresh(); });
    document.querySelectorAll('[data-size]').forEach(function (b) { b.classList.toggle('on', +b.dataset.size === S.sizeIn); });
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', +b.dataset.tab === S.tab); });
    $('proj0').hidden = S.tab !== 0; $('proj1').hidden = S.tab !== 1;
    $('on0').checked = S.P[0].on; $('on1').checked = S.P[1].on;
    $('edges').checked = S.edges; $('fit').value = S.fit; $('source').value = S.source;
    updateModeUI();
  }
  function updateModeUI() {
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === S.mode); });
    $('modeDesc').innerHTML = '<b>' + MODES[S.mode].title + '.</b> ' + MODES[S.mode].desc;
    $('badge').textContent = MODES[S.mode].title;
    $('badge').className = 'badge m' + S.mode;
  }
  function updateTopbar() {
    $('btn2d').textContent = S.view === '3d' ? 'Vista 2D' : 'Vista 3D';
    $('btn2d').classList.toggle('on', S.view === '2d');
    $('btnFT').textContent = S.cam === 'tech' ? 'Vista frontal' : 'Vista técnica';
    $('btnSeat').classList.toggle('on', S.cam === 'seat' && S.view === '3d');
    $('mView').textContent = S.view === '3d' ? '2D' : '3D';
    $('mTech').textContent = S.cam === 'tech' && S.view === '3d' ? 'Frontal' : 'Técnica';
    $('viewName').textContent = S.view === '2d' ? 'Vista 2D de calibración' : (S.cam === 'tech' ? 'Vista técnica 3D' : S.cam === 'seat' ? 'Vista desde el sillón' : 'Vista frontal 3D');
  }
  function setView(v) {
    S.view = v; lbl2d.hidden = v !== '2d'; $('hint3d').hidden = v === '2d';
    if (v === '2d') fit2D();
    // En 3D el canvas usa los gestos (girar/zoom); en 2D el navegador conserva sus gestos normales
    canvas.style.touchAction = v === '3d' ? 'none' : 'manipulation';
    updateTopbar(); requestRender();
  }

  /* ---------- celular ---------- */
  function setSheet(open) { document.body.classList.toggle('sheet-open', !!open); $('mPanel').classList.toggle('on', !!open); }
  function isMobileLayout() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;
  }
  function applyLayoutClass() {
    const m = isMobileLayout(), was = document.body.classList.contains('m');
    document.body.classList.toggle('m', m);
    if (m !== was) { setSheet(false); setTimeout(resize, 30); }
  }
  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    const isFs = d.fullscreenElement || d.webkitFullscreenElement;
    if (isFs) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { toast('Este navegador no permite pantalla completa. Girá el teléfono para verlo en horizontal.'); return; }
    Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(function () {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { toast('Girá el teléfono para verlo en horizontal.'); });
    }).catch(function () { toast('No se pudo activar la pantalla completa en este visor. Probá desde Chrome, o girá el teléfono.'); });
  }
  function isInAppWebView() {
    const ua = navigator.userAgent || '';
    return /; wv\)/.test(ua) || /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Snapchat/i.test(ua);
  }

  /* ---------- video / imagen local ---------- */
  function setFileStatus(msg) { $('fileStatus').textContent = msg; }
  // Detecta si el visor bloqueó el selector: si al abrirse, la ventana nunca pierde el foco
  // y no llega ningún archivo, el diálogo del sistema no apareció.
  let pickWatch = null;
  function watchPicker() {
    pickerDone();
    const w = { blurred: false };
    w.onBlur = function () { w.blurred = true; };
    w.onVis = function () { if (document.visibilityState === 'hidden') w.blurred = true; };
    window.addEventListener('blur', w.onBlur);
    document.addEventListener('visibilitychange', w.onVis);
    w.timer = setTimeout(function () {
      if (pickWatch === w && !w.blurred && document.hasFocus() && document.visibilityState === 'visible') {
        const mob = document.body.classList.contains('m');
        $('pbDesk').hidden = mob; $('pbMobile').hidden = !mob;
        $('pickBlocked').hidden = false;
        setSheet(false);
        setFileStatus(mob ? 'La galería no se abrió en este visor. Abrí el enlace directamente en Chrome.' : 'El selector de archivos no se abrió en este visor. Arrastrá el archivo sobre la vista o pegalo con Ctrl+V.');
      }
    }, 1500);
    pickWatch = w;
  }
  function pickerDone() {
    if (!pickWatch) return;
    clearTimeout(pickWatch.timer); window.removeEventListener('blur', pickWatch.onBlur);
    document.removeEventListener('visibilitychange', pickWatch.onVis); pickWatch = null;
  }
  function isVideoFile(f) { return /^video\//.test(f.type) || /\.(mp4|webm|mkv|mov|m4v|ogv|avi|3gp)$/i.test(f.name); }
  function isImageFile(f) { return /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(f.name); }
  function handleFile(f, expected) {
    $('pickBlocked').hidden = true;
    const mb = (f.size / 1048576).toFixed(1) + ' MB';
    if (isVideoFile(f)) { setFileStatus('Video recibido: ' + f.name + ' (' + mb + '). Cargando…'); loadVideo(f); }
    else if (isImageFile(f)) { setFileStatus('Imagen recibida: ' + f.name + ' (' + mb + '). Cargando…'); loadImage(f); }
    else { setFileStatus('“' + f.name + '” no es un video ni una imagen.'); toast('Ese archivo no es un ' + (expected === 'image' ? 'archivo de imagen' : 'video') + '.'); }
  }
  function readAsDataURL(file, cb, fail) {
    const r = new FileReader();
    r.onload = function () { cb(r.result); };
    r.onerror = fail;
    r.readAsDataURL(file);
  }
  let videoObjURL = null, rawVideoTex = null, vidCanvas = null, vidCanvasTex = null, vidCtx = null;
  function videoPixelLimit() { return S.quality === 'low' ? 1280 * 720 : S.quality === 'medium' ? 1920 * 1080 : 3840 * 2160; }
  function setupVideoTexture() {
    const vw = video.videoWidth, vh = video.videoHeight, lim = videoPixelLimit();
    if (vw * vh > lim * 1.05) {
      const k = Math.sqrt(lim / (vw * vh));
      if (!vidCanvas) { vidCanvas = document.createElement('canvas'); vidCtx = vidCanvas.getContext('2d'); vidCanvasTex = new THREE.CanvasTexture(vidCanvas); prepTex(vidCanvasTex); }
      vidCanvas.width = Math.round(vw * k); vidCanvas.height = Math.round(vh * k);
      videoTex = vidCanvasTex;
    } else {
      if (!rawVideoTex) { rawVideoTex = new THREE.VideoTexture(video); prepTex(rawVideoTex); }
      videoTex = rawVideoTex;
    }
    drawVideoFrame();
  }
  // Solo hace trabajo en el modo reducido; la VideoTexture normal se actualiza sola
  function drawVideoFrame() {
    if (videoTex && videoTex === vidCanvasTex && video.readyState >= 2) {
      vidCtx.drawImage(video, 0, 0, vidCanvas.width, vidCanvas.height); vidCanvasTex.needsUpdate = true;
    }
  }
  function loadVideo(file, useDataURL) {
    videoName = file.name;
    if (videoObjURL) { URL.revokeObjectURL(videoObjURL); videoObjURL = null; }
    video.loop = true; video.muted = true;
    video.onloadedmetadata = function () {
      setupVideoTexture();
      S.source = 'video'; refreshSource(); refreshUI(); applyState();
      video.play().then(function () {
        setFileStatus('Reproduciendo “' + file.name + '” (' + video.videoWidth + '×' + video.videoHeight + (videoTex === vidCanvasTex ? ', reducido a ' + vidCanvas.width + '×' + vidCanvas.height + ' para fluidez' : '') + '), repartido entre A y B.');
      }).catch(function () { setFileStatus('Video listo: pulsá ▶ Reproducir.'); });
    };
    video.onerror = function () {
      // Si el visor no permite videos desde blob:, se reintenta con una URL data: (archivos de hasta 120 MB)
      if (!useDataURL && file.size < 120 * 1048576) { loadVideo(file, true); return; }
      const code = video.error ? video.error.code : 0;
      const why = code === 4 ? 'el formato o códec no es compatible con este navegador (los videos HEVC/H.265 de algunos celulares no se pueden reproducir en todos los equipos)' : code === 3 ? 'el archivo está dañado o no se pudo decodificar' : 'no se pudo leer el archivo';
      setFileStatus('No se pudo reproducir “' + file.name + '”: ' + why + '. Probá con MP4 (H.264) o WebM.');
      toast('No se pudo reproducir ese video: ' + why + '.');
    };
    if (useDataURL) {
      readAsDataURL(file, function (url) { video.src = url; video.load(); }, function () { setFileStatus('No se pudo leer el archivo.'); });
    } else {
      videoObjURL = URL.createObjectURL(file);
      video.src = videoObjURL; video.load();
    }
  }
  function loadImage(file) {
    // data: URL en vez de blob: (es lo más compatible con visores que restringen fuentes)
    readAsDataURL(file, function (url) {
      const img = new Image();
      img.onload = function () {
        if (imageTex) imageTex.dispose();
        const maxSide = Math.min(renderer.capabilities.maxTextureSize || 4096, S.quality === 'low' ? 2048 : 4096);
        let srcImg = img;
        if (Math.max(img.naturalWidth, img.naturalHeight) > maxSide) {
          const k = maxSide / Math.max(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); srcImg = c;
        }
        imageTex = new THREE.Texture(srcImg); prepTex(imageTex); imageTex.needsUpdate = true;
        imageAspect = img.naturalWidth / img.naturalHeight; imageName = file.name;
        S.source = 'image'; refreshSource(); refreshUI(); applyState();
        setFileStatus('Mostrando “' + file.name + '” (' + img.naturalWidth + '×' + img.naturalHeight + ').');
      };
      img.onerror = function () {
        const heic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type);
        const why = heic ? 'las fotos HEIC no se pueden mostrar en todos los navegadores; elegí una JPG o PNG' : 'el navegador no pudo decodificar la imagen';
        setFileStatus('No se pudo mostrar “' + file.name + '”: ' + why + '.'); toast('No se pudo mostrar la imagen: ' + why + '.');
      };
      img.src = url;
    }, function () { setFileStatus('No se pudo leer el archivo.'); });
  }
  function fmtTime(t) { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); }
  function updateVideoTime() {
    if (!video.duration) return;
    $('vSeek').value = Math.round(video.currentTime / video.duration * 1000);
    $('vTime').textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
  }
  function updateMediaUI() {
    const isV = S.source === 'video';
    $('videoCtl').hidden = !isV;
    $('fitRow').hidden = !(isV || S.source === 'image');
    $('vPlay').textContent = video.paused ? '▶ Reproducir' : '❚❚ Pausa';
    $('vMute').textContent = video.muted ? '🔇 Sin sonido' : '🔊 Con sonido';
    $('vName').textContent = isV ? videoName + (video.videoWidth ? ' · ' + video.videoWidth + '×' + video.videoHeight : '') : '';
    updateVideoTime();
  }
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4500); }

  /* ======================= Panel de cálculos ======================= */
  let infoPending = false;
  function scheduleInfo() { if (!infoPending) { infoPending = true; requestAnimationFrame(function () { infoPending = false; renderInfo(); }); } }
  function f2(v) { return v.toFixed(2).replace('.', ','); }
  function f0(v) { return Math.round(v).toLocaleString('es-AR'); }
  function renderInfo() {
    const R = ref(), o = S.overlap, Wc = R.w * (2 - o);
    const gA = projGeo(0), gB = projGeo(1);
    const physOv = (gA.cx + gA.w / 2) - (gB.cx - gB.w / 2);
    const contOvA = o * gA.w, mismatch = physOv - o * (gA.w + gB.w) / 2;
    const diagC = Math.sqrt(Wc * Wc + R.h * R.h) / 0.0254;
    const pxW = Math.round((2 - o) * NATIVE_W);
    const rows = SIZES.map(function (s) {
      const r = screen169(s);
      return '<tr' + (s === S.sizeIn ? ' class="on"' : '') + '><td>' + s + '″</td><td>' + f0(r.w * 100) + ' × ' + f0(r.h * 100) + ' cm</td><td>' + f2(r.w * r.h) + ' m²</td><td>' + f2(r.h / PERSON_H) + '×</td></tr>';
    }).join('');
    const warn = Math.abs(mismatch) > 0.01
      ? '<p class="warn">⚠ La superposición física (' + f2(physOv * 100) + ' cm) no coincide con la del contenido (' + f2(contOvA * 100) + ' cm): diferencia de ' + f2(mismatch * 100) + ' cm. Vas a ver la imagen duplicada (fantasma) en la unión. Probá “Auto-alinear”.</p>'
      : '<p class="ok">✔ La superposición física coincide con la del contenido (±1 cm).</p>';
    $('info').innerHTML =
      '<h4>📐 Geometría exacta (según los valores elegidos)</h4>' +
      '<table><tr><th>Pantalla 16:9</th><th>Ancho × alto</th><th>Área</th><th>Alto/persona</th></tr>' + rows + '</table>' +
      '<dl>' +
      '<dt>Cada proyector cubre</dt><dd>' + f0(R.w * 100) + ' × ' + f0(R.h * 100) + ' cm (16:9 de ' + S.sizeIn + '″)</dd>' +
      '<dt>Imagen combinada A+B</dt><dd>' + f2(Wc) + ' × ' + f2(R.h) + ' m · relación ' + f2(Wc / R.h) + ':1 · diagonal ≈ ' + f0(diagC) + '″</dd>' +
      '<dt>Superposición de contenido</dt><dd>' + pct(o) + ' = ' + Math.round(o * NATIVE_W) + ' px = ' + f2(o * R.w * 100) + ' cm</dd>' +
      '<dt>Superposición física actual</dt><dd>' + f2(physOv * 100) + ' cm</dd>' +
      '<dt>Distancia necesaria</dt><dd>' + f2(requiredDist()) + ' m (ancho ' + f2(R.w) + ' m × relación ' + f2(S.throwRatio) + ')</dd>' +
      '<dt>Resolución combinada</dt><dd>' + f0(pxW) + ' × ' + NATIVE_H + ' px (si cada uno recibe 1920×1080)</dd>' +
      '<dt>Tamaño de cada píxel</dt><dd>' + f2(R.w / NATIVE_W * 1000) + ' mm</dd>' +
      '<dt>Ancho de la pantalla frente a la persona</dt><dd>' + f2(Wc / PERSON_H) + ' veces la altura de una persona de 1,75 m</dd>' +
      '</dl>' + warn +
      '<h4>🧪 Supuestos (editables, no verificados)</h4><ul>' +
      '<li>Relación de proyección ' + f2(S.throwRatio) + ':1: valor genérico. <b>No es una especificación del Gadnic C45N</b>; medí la tuya (distancia ÷ ancho de imagen).</li>' +
      '<li>1920×1080 por proyector: se toma de que me dijiste “Full HD”. No verifiqué la resolución nativa real del C45N.</li>' +
      '<li>Lente centrada (sin desplazamiento de lente) y proyector perpendicular a la pantalla.</li>' +
      '<li>Respuesta del proyector con gamma 2,2.</li></ul>' +
      '<h4>🎨 Aproximaciones visuales del simulador</h4><ul>' +
      '<li>Brillo, contraste, color y nivel de negro son ilustrativos: no representan lúmenes ni la luz real de la sala.</li>' +
      '<li>Los haces de luz, la sala, el sillón y la persona sirven para dar escala; no son modelos exactos.</li>' +
      '<li>El trapecio (keystone) es una aproximación lineal. No se simulan la distorsión de la lente, el desenfoque ni el hot-spot.</li></ul>';
  }

  /* ======================= API de prueba (consola / tests) ======================= */
  // Lee píxeles del lienzo WebGL justo después de renderizar (no hace falta preserveDrawingBuffer)
  function samplePixels(points) {
    renderNow();
    const gl = renderer.getContext(), c = renderer.domElement, out = [];
    const px = new Uint8Array(4);
    points.forEach(function (p) {
      gl.readPixels(Math.floor(p[0] * c.width), Math.floor((1 - p[1]) * c.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push([px[0], px[1], px[2]]);
    });
    return out;
  }
  // Coordenadas de pantalla (0..1 del lienzo) de un punto (x,y) en metros, en vista 2D
  function screenToCanvas(x, yRel) {
    return [(x - cam2d.left) / (cam2d.right - cam2d.left), (cam2d.top - yRel) / (cam2d.top - cam2d.bottom)];
  }
  window.DPL = {
    S: S, apply: function () { refreshSource(); refreshUI(); applyState(); }, setMode: setMode, setView: setView, camPreset: camPreset,
    projGeo: projGeo, ref: ref, centerY: centerY, samplePixels: samplePixels, screenToCanvas: screenToCanvas,
    camState: function () { return { pos: camera.position.toArray(), target: controls.target.toArray(), dist: camera.position.distanceTo(controls.target) }; },
    srcSize: function () { const im = uniforms.uSrc.value.image; return im ? [im.videoWidth || im.width, im.videoHeight || im.height] : null; },
    renderNow: renderNow, uniforms: uniforms, video: video, srcCanvas: srcCanvas, stats: function () { return { fps: fps, lastRenderMs: lastRenderMs, info: renderer.info.render, mem: renderer.info.memory }; }
  };

  window.addEventListener('error', function (e) { if (e.message) toast('Error: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) { const m = e.reason && (e.reason.message || String(e.reason)); if (m && !/play\(\)/.test(m)) toast('Error: ' + m); });

  /* ======================= Arranque ======================= */
  (function autoQuality() {
    const cores = navigator.hardwareConcurrency || 2, mem = navigator.deviceMemory || 4;
    S.quality = (cores <= 2 || mem <= 4) ? 'low' : 'medium';
    const q = new URLSearchParams(location.search).get('q'); if (q) S.quality = q;
  })();
  applyLayoutClass();
  window.addEventListener('resize', applyLayoutClass);
  if (isInAppWebView()) $('wvBanner').hidden = false;
  buildUI();
  S.P.forEach(function (p) { p.dist = requiredDist(); });
  resize();
  refreshSource(true);
  refreshUI();
  applyState();
  camPreset('front', true);
  setView('3d');
  requestAnimationFrame(loop);
  document.body.classList.add('ready');
})();
