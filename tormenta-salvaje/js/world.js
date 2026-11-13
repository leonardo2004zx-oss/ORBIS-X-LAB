/* TORMENTA SALVAJE — el bosque: terreno, sendero embarrado, charcos, árboles procedurales, sotobosque y cielo */
(function () {
  'use strict';
  const T = window.TS;
  const { mulberry, fbm, rnd } = T;
  const V3 = THREE.Vector3;

  /* ---------------- sendero ---------------- */
  const PATH_CTRL = [[0, 175], [6, 150], [-5, 122], [6, 96], [-8, 66], [-2, 38], [12, 10], [6, -20], [-12, -48], [-30, -76], [-52, -100], [-70, -128], [-82, -160]];
  const pathCurve = new THREE.CatmullRomCurve3(PATH_CTRL.map(([x, z]) => new V3(x, 0, z)), false, 'catmullrom', 0.5);
  const PATH_PTS = pathCurve.getSpacedPoints(260).map(p => [p.x, p.z]);

  const SIZE = 440, HALF = SIZE / 2;
  // distancia al sendero precalculada en grilla de 2 m
  const GRID = 2, GN = Math.ceil(SIZE / GRID) + 1;
  const pathDist = new Float32Array(GN * GN), pathT = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = -HALF + i * GRID, z = -HALF + j * GRID;
    let best = 1e9, bt = 0;
    for (let k = 0; k < PATH_PTS.length - 1; k++) {
      const [ax, az] = PATH_PTS[k], [bx, bz] = PATH_PTS[k + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const ex = ax + dx * t - x, ez = az + dz * t - z, d = ex * ex + ez * ez;
      if (d < best) { best = d; bt = (k + t) / (PATH_PTS.length - 1); }
    }
    pathDist[j * GN + i] = Math.sqrt(best); pathT[j * GN + i] = bt;
  }
  function gridSample(arr, x, z) {
    const fx = (x + HALF) / GRID, fz = (z + HALF) / GRID;
    const i = Math.max(0, Math.min(GN - 2, Math.floor(fx))), j = Math.max(0, Math.min(GN - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const a = arr[j * GN + i], b = arr[j * GN + i + 1], c = arr[(j + 1) * GN + i], d = arr[(j + 1) * GN + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const distToPath = (x, z) => gridSample(pathDist, x, z);

  function rawHeight(x, z) {
    let h = (fbm(x * 0.012 + 11, z * 0.012 + 4, 5) - 0.5) * 22;
    h += (fbm(x * 0.045, z * 0.045 + 30, 3) - 0.5) * 3.2;            // irregularidades
    const edge = Math.max(0, (Math.hypot(x, z) - HALF * 0.78) / (HALF * 0.25));
    h += edge * edge * 30;                                             // laderas que cierran el valle
    return h;
  }
  // altura del suelo en el sendero: perfil suavizado a lo largo del camino
  const PATH_H = PATH_PTS.map(([x, z]) => rawHeight(x, z));
  for (let it = 0; it < 6; it++) for (let k = 1; k < PATH_H.length - 1; k++) PATH_H[k] = (PATH_H[k - 1] + PATH_H[k] * 2 + PATH_H[k + 1]) / 4;
  function pathHeightAtT(t) { const f = t * (PATH_H.length - 1), k = Math.min(PATH_H.length - 2, Math.floor(f)); return PATH_H[k] + (PATH_H[k + 1] - PATH_H[k]) * (f - k); }

  // claro del camping al final del sendero
  const CAMP = { x: -94, z: -182, r: 30 };
  const CAMP_H = rawHeight(-82, -160) - 0.4;
  const campDist = (x, z) => Math.hypot(x - CAMP.x, z - CAMP.z);
  function height(x, z) {
    const h = heightBase(x, z), d = campDist(x, z);
    if (d > 44) return h;
    const k = Math.max(0, Math.min(1, (44 - d) / 16)), s = k * k * (3 - 2 * k);
    return h + (CAMP_H + Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.08 - h) * s;
  }
  function heightBase(x, z) {
    const h0 = rawHeight(x, z), d = distToPath(x, z);
    if (d > 7) return h0;
    const ph = pathHeightAtT(gridSample(pathT, x, z)) - 0.25 - 0.12 * Math.max(0, 1 - d / 1.6);
    const k = d < 2.2 ? 1 : 1 - (d - 2.2) / 4.8;
    const s = k * k * (3 - 2 * k);
    return h0 + (ph - h0) * s + Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.05 * s; // surcos de barro
  }

  /* ---------------- mundo ---------------- */
  class World {
    constructor(renderer, Q) {
      this.Q = Q; this.renderer = renderer;
      const scene = this.scene = new THREE.Scene();
      this.fogBase = Q.fog;
      scene.fog = new THREE.FogExp2(0x0b1018, Q.fog);
      this.uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
      this.wetMats = [];
      this.colliders = []; this.cell = new Map();
      this.puddles = [];
      this._env(); this._sky(); this._terrain(); this._puddles();
      this._trees(); this._undergrowth(); this._rocksLogs(); this._sign();
      this._mist();
      // luz ambiente fría (luna tras las nubes) — muy baja: la linterna manda
      this.hemi = new THREE.HemisphereLight(0x34466a, 0x070605, 0.2); scene.add(this.hemi);
      this.moon = new THREE.DirectionalLight(0x8fa6d8, 0.12); this.moon.position.copy(this.moonDir).multiplyScalar(200); scene.add(this.moon);
    }

    _env() {
      // mapa de entorno: cielo tormentoso con un poco de brillo en el horizonte → reflejos en lo mojado
      const pm = new THREE.PMREMGenerator(this.renderer);
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(10, 32, 16);
      const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 p; void main(){p=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'varying vec3 p; void main(){ float h=p.y; vec3 c=mix(vec3(0.05,0.07,0.1), vec3(0.2,0.25,0.34), smoothstep(-0.1,0.5,h)); c=mix(c, vec3(0.02,0.02,0.025), step(h,-0.05)); gl_FragColor=vec4(c,1.);}' });
      es.add(new THREE.Mesh(geo, mat));
      this.envMap = pm.fromScene(es, 0.04).texture;
      this.scene.environment = this.envMap;
    }

    _sky() {
      this.moonDir = new V3(-0.22, 0.84, -0.5).normalize();
      const geo = new THREE.SphereGeometry(700, 48, 24);
      this.skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uTime: this.uniforms.uTime, uFlash: { value: 0 }, uFlashDir: { value: new V3(0.3, 0.6, -0.7) }, uClear: { value: 0.2 }, uMoonDir: { value: this.moonDir } },
        vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 vP; uniform float uTime; uniform float uFlash; uniform vec3 uFlashDir; uniform float uClear; uniform vec3 uMoonDir;
          float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
          float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
          float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=n(p)*a;p*=2.1;a*=.5;}return s;}
          void main(){
            vec3 d = normalize(vP);
            float y=max(d.y,0.0);
            vec2 uv=d.xz/(y+0.25)*1.6 + vec2(uTime*0.03, uTime*0.012);
            float cl=fb(uv), cl2=fb(uv*2.3+3.0);
            // claros entre las nubes: más grandes cuando la tormenta afloja
            float thr = 0.26 + uClear * 0.36;
            float gap = (1.0 - smoothstep(thr - 0.07, thr + 0.05, cl)) * smoothstep(0.02, 0.2, y);
            // cielo despejado: azul noche profundo con estrellas que titilan
            vec3 night = mix(vec3(0.012,0.018,0.04), vec3(0.004,0.006,0.016), y);
            vec3 sp = d * 220.0; vec3 cell = floor(sp); float hs = h3(cell);
            vec3 off = vec3(h3(cell+1.3), h3(cell+2.7), h3(cell+4.1)) - 0.5;
            float sd = length(fract(sp) - 0.5 - off * 0.6);
            float star = step(0.985, hs) * smoothstep(0.12, 0.0, sd) * (0.4 + 0.6 * h3(cell+7.7));
            star *= 0.6 + 0.4 * sin(uTime * (2.0 + hs * 6.0) + hs * 50.0);
            vec3 starCol = mix(vec3(0.75,0.82,1.0), vec3(1.0,0.88,0.72), h3(cell+9.1));
            // luna: disco con mares y cráteres, halo y luz plateada en los bordes de las nubes
            float md = dot(d, normalize(uMoonDir));
            float disc = smoothstep(0.99915, 0.99935, md);
            vec3 mu = normalize(cross(uMoonDir, vec3(0.0,1.0,0.0))), mv = cross(mu, uMoonDir);
            vec2 mp = vec2(dot(d, mu), dot(d, mv)) * 30.0;
            float maria = fb(mp * 1.5 + 4.0);
            vec3 moonCol = vec3(0.92,0.94,1.0) * (1.25 - maria * 0.55);
            float halo = pow(max(md, 0.0), 900.0) * 0.5 + pow(max(md, 0.0), 60.0) * 0.08;
            float seen = mix(0.12, 1.0, gap);
            vec3 clearSky = night + starCol * star * 1.6 + moonCol * disc * seen * 1.6;
            // nubes
            vec3 base=mix(vec3(0.03,0.04,0.055), vec3(0.075,0.09,0.12), cl);
            base=mix(base, vec3(0.02,0.025,0.035), smoothstep(0.1,0.9,y)*0.5);
            float lining = smoothstep(thr - 0.05, thr + 0.08, cl) * (1.0 - smoothstep(thr + 0.08, thr + 0.32, cl));
            base += vec3(0.5,0.56,0.7) * pow(max(md, 0.0), 14.0) * (0.12 + lining * 0.9) * (0.3 + uClear);
            vec3 col = mix(base, clearSky, gap) + vec3(0.6,0.65,0.8) * halo * (0.35 + gap * 0.65) * (0.3 + uClear);
            float dirL=pow(max(dot(d,normalize(uFlashDir)),0.0), 6.0);
            vec3 flash=vec3(0.38,0.44,0.62)*min(uFlash,1.0)*(0.25+cl2*0.9)*(0.25+dirL*1.1)*(1.0-gap*0.6);
            flash=flash/(1.0+flash*1.4); // tono suave: ilumina las nubes sin quemar a blanco
            gl_FragColor=vec4(col+flash,1.0);
          }`,
      });
      const sky = new THREE.Mesh(geo, this.skyMat); sky.renderOrder = -10; sky.frustumCulled = false; this.scene.add(sky);
      this.sky = sky;
    }

    _terrain() {
      const seg = this.Q.terrainSeg, geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const P = geo.attributes.position, col = new Float32Array(P.count * 3), wet = new Float32Array(P.count);
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), z = P.getZ(i), y = height(x, z);
        P.setY(i, y);
        const d = distToPath(x, z), moss = fbm(x * 0.05 + 7, z * 0.05, 3), leaf = fbm(x * 0.09, z * 0.09 + 3, 2);
        let r = 0.42 + leaf * 0.3, g = 0.42 + leaf * 0.22 + moss * 0.25, b = 0.36 + leaf * 0.12;
        if (moss > 0.58) { r *= 0.7; g *= 1.05; b *= 0.6; }                       // musgo
        const pk = Math.max(0, 1 - d / 3, Math.min(1, (CAMP.r + 2 - campDist(x, z)) / 8) * 0.85); // barro del sendero y del claro
        r = r * (1 - pk) + 0.66 * pk; g = g * (1 - pk) + 0.52 * pk; b = b * (1 - pk) + 0.4 * pk;
        col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
        wet[i] = Math.min(1, pk * 1.3 + (fbm(x * 0.2, z * 0.2) > 0.62 ? 0.5 : 0));
      }
      this.tSeg = seg; this.tH = new Float32Array(P.count); for (let i = 0; i < P.count; i++) this.tH[i] = P.getY(i);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
      geo.computeVertexNormals();
      const G = T.groundTextures(), rep = SIZE / 7;
      [G.map, G.rough, G.normal].forEach(t => t.repeat.set(rep, rep));
      const mat = new THREE.MeshStandardMaterial({ map: G.map, roughnessMap: G.rough, normalMap: G.normal, normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.45 });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float wet; varying float vWet;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWet = wet;');
        sh.fragmentShader = 'varying float vWet;\n' + sh.fragmentShader
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.22, vWet);')
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.85, 0.62, vWet);');
      };
      this.ground = new THREE.Mesh(geo, mat); this.ground.receiveShadow = true;
      this.scene.add(this.ground);
      this.wetMats.push(mat);
    }

    _puddles() {
      // charcos "drapeados" sobre la malla real del terreno, con borde irregular y suave
      const r = mulberry(404);
      const mat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.03, metalness: 0.75, envMapIntensity: 1.1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.rainUniform = { value: 1 };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uniforms.uTime; sh.uniforms.uRain = this.rainUniform;
        sh.vertexShader = 'varying vec3 vWp; varying vec2 vPuv;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed,1.0)).xyz; vPuv = uv;');
        sh.fragmentShader = 'uniform float uTime; uniform float uRain; varying vec3 vWp; varying vec2 vPuv;\n float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n float nn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}\n' + sh.fragmentShader
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // ondas circulares: celdas con fase aleatoria → anillos que se expanden y se apagan
          vec2 gx = vWp.xz * 2.6; vec2 rip = vec2(0.0);
          for (int l = 0; l < 2; l++) {
            vec2 g2 = gx + float(l) * 0.37; vec2 cid = floor(g2);
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec2 c = cid + vec2(float(i), float(j));
              float rnd = hh(c + float(l) * 7.1);
              if (rnd > 0.25 + uRain * 0.6) continue;
              float t = fract(uTime * (0.55 + rnd * 0.35) + rnd);
              vec2 ctr = c + vec2(hh(c + 3.1), hh(c + 5.7));
              vec2 d = g2 - ctr; float dist = length(d);
              float ring = sin((dist - t * 0.9) * 38.0) * smoothstep(0.0, 0.08, t * 0.9 - dist + 0.08) * smoothstep(t * 0.9 + 0.04, t * 0.9 - 0.02, dist);
              rip += d / max(dist, 0.001) * ring * (1.0 - t) * (1.0 - t);
            }
          }
          normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz * 0.55);`)
          .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
          float rr = length(vPuv - 0.5) * 2.0;
          float edge = 0.62 + 0.3 * nn(vWp.xz * 1.3) + 0.12 * nn(vWp.xz * 4.0);
          diffuseColor.a *= 1.0 - smoothstep(edge - 0.28, edge, rr);`);
      };
      this.puddleMat = mat; this.wetMats.push(mat);
      const add = this.addPuddle = (x, z, rad) => {
        const n = 14, g = new THREE.PlaneGeometry(rad * 2.6, rad * 2, n, n); g.rotateX(-Math.PI / 2);
        const rot = r() * 6.28, c = Math.cos(rot), s = Math.sin(rot), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const lx = P.getX(i), lz = P.getZ(i), wx = x + lx * c - lz * s, wz = z + lx * s + lz * c;
          P.setXYZ(i, wx, this.groundHeight(wx, wz) + 0.02, wz);
        }
        g.computeVertexNormals();
        const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0); // agua: siempre horizontal
        const m = new THREE.Mesh(g, mat); m.renderOrder = 1; m.receiveShadow = true;
        this.scene.add(m);
        this.puddles.push({ x, z, r: rad * 0.85, y: this.groundHeight(x, z) + 0.02 });
      };
      // en el sendero (donde más se junta el agua) y algunos sueltos en zonas planas
      for (let k = 2; k < PATH_PTS.length - 2; k += 2 + ((r() * 4) | 0)) {
        const [x, z] = PATH_PTS[k];
        add(x + (r() - 0.5) * 1.4, z + (r() - 0.5) * 1.4, 0.7 + r() * 1.3);
      }
      for (let i = 0; i < 50; i++) {
        const x = (r() - 0.5) * SIZE * 0.8, z = (r() - 0.5) * SIZE * 0.8;
        const sl = Math.abs(height(x + 1, z) - height(x - 1, z)) + Math.abs(height(x, z + 1) - height(x, z - 1));
        if (distToPath(x, z) > 6 && campDist(x, z) > CAMP.r && sl < 0.5) add(x, z, 0.5 + r() * 1.2);
      }
    }

    // altura exacta de la malla visible (interpolación por triángulo, igual que la GPU)
    groundHeight(x, z) {
      const n = this.tSeg, step = SIZE / n;
      const fx = (x + HALF) / step, fz = (z + HALF) / step;
      const ix = Math.max(0, Math.min(n - 1, Math.floor(fx))), iz = Math.max(0, Math.min(n - 1, Math.floor(fz)));
      const u = Math.min(1, Math.max(0, fx - ix)), v = Math.min(1, Math.max(0, fz - iz));
      const H = this.tH, w = n + 1;
      const ha = H[iz * w + ix], hb = H[(iz + 1) * w + ix], hc = H[(iz + 1) * w + ix + 1], hd = H[iz * w + ix + 1];
      return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
    }

    /* ---------- árboles ---------- */
    _trees() {
      const mats = this._treeMaterials();
      const sp = this.species = [];
      const build = (kind, seed, lod) => this['_' + kind](seed, lod);
      const defs = [
        ['conifer', [11, 12, 13], 0.46, 0], ['broad', [21, 22], 0.24, 1], ['birch', [31, 32], 0.14, 2], ['snag', [41, 42], 0.16, 3],
      ];
      defs.forEach(([kind, seeds, share, mi]) => seeds.forEach(seed => {
        sp.push({ kind, share: share / seeds.length, near: build(kind, seed, 0), far: build(kind, seed, 1), mats: mats[mi], list: [] });
      }));
      // reparto con espaciado mínimo; claros en el sendero
      const r = mulberry(777), total = this.Q.treeCount;
      const all = [];
      let guard = 0;
      while (all.length < total && guard++ < total * 30) {
        const x = (r() - 0.5) * SIZE * 0.96, z = (r() - 0.5) * SIZE * 0.96;
        const d = distToPath(x, z); if (d < 2.6 + r() * 1.6) continue;
        if (campDist(x, z) < CAMP.r + 3) continue;
        if (Math.hypot(x - 0, z - 175) < 6) continue;
        const clump = fbm(x * 0.02 + 40, z * 0.02, 3);
        if (r() > 0.5 + clump * 0.8 + (d < 9 ? 0.25 : 0)) continue;
        let ok = true; const key = ((x / 4) | 0) + ',' + ((z / 4) | 0);
        for (const t of all.slice(-60)) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 5) { ok = false; break; }
        if (!ok) continue;
        let u = r(), s = sp[0]; for (const S of sp) { if ((u -= S.share) <= 0) { s = S; break; } }
        const scale = 0.75 + r() * 0.55, rot = r() * 6.283, y = height(x, z) - 0.15;
        const t = { x, y, z, scale, rot, s }; all.push(t); s.list.push(t);
        this._addCollider(x, z, (s.kind === 'birch' ? 0.25 : 0.45) * scale + 0.25);
      }
      this.trees = all;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3();
      sp.forEach(s => {
        s.mats.forEach(m => T.addWind(m, this.uniforms, s.kind === 'conifer' ? 0.05 : 0.07, 0.06));
        s.nearMesh = new THREE.InstancedMesh(s.near, s.mats, s.list.length);
        s.farMesh = new THREE.InstancedMesh(s.far, s.mats, s.list.length);
        [s.nearMesh, s.farMesh].forEach(M => { M.count = 0; M.frustumCulled = false; this.scene.add(M); });
        s.nearMesh.castShadow = true; s.nearMesh.receiveShadow = true;
        s.list.forEach(t => { q.setFromAxisAngle(new V3(0, 1, 0), t.rot); sc.set(t.scale, t.scale * (0.9 + (t.x * 13 % 1) * 0.2), t.scale); t.m = m4.compose(new V3(t.x, t.y, t.z), q, sc).clone(); });
      });
      this._lodAt = new V3(1e9, 0, 0);
    }

    _treeMaterials() {
      const wet = (m) => { this.wetMats.push(m); return m; };
      const bark = wet(new THREE.MeshStandardMaterial({ map: T.barkTexture('#3a3127', '#15110c', '#2f3b1d', 3), roughness: 0.72, envMapIntensity: 0.5 }));
      const bark2 = wet(new THREE.MeshStandardMaterial({ map: T.barkTexture('#45382b', '#1a140e', '#34401f', 5), roughness: 0.7, envMapIntensity: 0.5 }));
      const birch = wet(new THREE.MeshStandardMaterial({ map: T.birchTexture(), roughness: 0.6, envMapIntensity: 0.5, color: 0x8a8a86 }));
      const dead = wet(new THREE.MeshStandardMaterial({ map: T.barkTexture('#3b3a37', '#121212', null, 8), roughness: 0.6, envMapIntensity: 0.6 }));
      const fol = (t, c) => wet(new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, color: c || 0xffffff, envMapIntensity: 0.35 }));
      return [
        [bark, fol(T.needleCard(5, 95), 0x9aa59a)],
        [bark2, fol(T.leafCard(9, 85, 30), 0xa0a596)],
        [birch, fol(T.leafCard(17, 70, 35, true), 0xb0b09a)],
        [dead, fol(T.needleCard(6, 60), 0x6a6a5a)],
      ];
    }

    // rama-tarjeta: cuadrilátero curvado desde un punto hacia "dir"
    _bough(base, dir, side, L, w, sag) {
      const pos = [], uv = [], nor = [], idx = [];
      const segs = 3;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, c = base.clone().addScaledVector(dir, L * t); c.y -= sag * t * t;
        const ww = w * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5 + 0.2));
        for (const s of [-1, 1]) { const p = c.clone().addScaledVector(side, s * ww / 2); pos.push(p.x, p.y, p.z); uv.push(s < 0 ? 0 : 1, 1 - t); nor.push(side.x * 0.2, 0.9, side.z * 0.2); }
      }
      for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      return g;
    }
    _roots(parts, R, r, n) {
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.283 + r() * 0.5, L = R * (2.2 + r() * 1.8);
        const pts = [new V3(0, R * 0.9, 0), new V3(Math.cos(a) * L * 0.4, R * 0.35, Math.sin(a) * L * 0.4), new V3(Math.cos(a) * L, -0.25, Math.sin(a) * L)];
        parts.push({ geo: T.limb(pts, R * 0.45, R * 0.08, 5, 0.6), mat: 0 });
      }
    }
    _trunk(H, R, lean, r, radial, topR) {
      const pts = []; const n = 7;
      const lx = (r() - 0.5) * lean, lz = (r() - 0.5) * lean;
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new V3(lx * t * t + Math.sin(t * 5 + r()) * 0.08, H * t, lz * t * t + Math.cos(t * 4 + r()) * 0.08)); }
      const g = T.limb(pts, R, topR != null ? topR : R * 0.12, radial, 0.35);
      // ensanche de la base
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 1.2) { const k = 1 + (1.2 - y) * 0.35; P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); } }
      return { g, pts };
    }

    _conifer(seed, lod) {
      const r = mulberry(seed), parts = [], H = 20 + r() * 9, R = 0.42 + r() * 0.2;
      const { g, pts } = this._trunk(H, R, 1.2, r, lod ? 6 : 10);
      parts.push({ geo: g, mat: 0 });
      if (!lod) this._roots(parts, R, r, 5);
      const tiers = lod ? 7 : 15, start = H * (0.38 + r() * 0.1);
      for (let k = 0; k < tiers; k++) {
        const t = k / (tiers - 1), y = start + (H - start) * t, around = lod ? 3 : 5;
        const L = (4.4 - t * 3.6) * (0.9 + r() * 0.3) + 0.4;
        for (let b = 0; b < around; b++) {
          const a = b / around * 6.283 + k * 0.9 + r() * 0.5;
          const out = new V3(Math.cos(a), -0.25 - t * 0.1 + r() * 0.1, Math.sin(a)).normalize();
          const side = new V3(-Math.sin(a), 0, Math.cos(a));
          const base = new V3(pts[0].x * 0 + Math.cos(a) * R * 0.3, y, Math.sin(a) * R * 0.3);
          parts.push({ geo: this._bough(base, out, side, L, L * 0.9, 0.5 + L * 0.15), mat: 1 });
          if (!lod) { const up2 = new V3().crossVectors(out, side).normalize(); parts.push({ geo: this._bough(base, out, up2, L * 0.9, L * 0.55, 0.3), mat: 1 }); }
        }
      }
      // ramas secas bajas (enganchan la luz de la linterna)
      if (!lod) for (let k = 0; k < 6; k++) {
        const y = 3 + r() * (start - 3), a = r() * 6.28, L = 0.8 + r() * 1.6;
        parts.push({ geo: T.limb([new V3(0, y, 0), new V3(Math.cos(a) * L, y - 0.2 - r() * 0.4, Math.sin(a) * L)], 0.06, 0.01, 4, 1), mat: 0 });
      }
      return T.merge(parts);
    }

    _broad(seed, lod) {
      const r = mulberry(seed), parts = [], H = 11 + r() * 5, R = 0.4 + r() * 0.18;
      const { g, pts } = this._trunk(H * 0.55, R, 0.8, r, lod ? 6 : 10, R * 0.55);
      parts.push({ geo: g, mat: 0 });
      if (!lod) this._roots(parts, R, r, 6);
      const top = pts[pts.length - 1];
      const branch = (from, dir, len, rad, depth) => {
        const p1 = from.clone().addScaledVector(dir, len * 0.5).add(new V3((r() - 0.5) * 0.8, (r() - 0.3) * 0.6, (r() - 0.5) * 0.8));
        const p2 = from.clone().addScaledVector(dir, len);
        parts.push({ geo: T.limb([from, p1, p2], rad, rad * 0.45, lod ? 4 : 6, 0.5), mat: 0 });
        if (depth > 0) {
          const nb = lod ? 2 : 3;
          for (let i = 0; i < nb; i++) {
            const d2 = dir.clone().add(new V3((r() - 0.5) * 1.2, r() * 0.6, (r() - 0.5) * 1.2)).normalize();
            branch(p2, d2, len * (0.55 + r() * 0.2), rad * 0.45, depth - 1);
          }
        } else {
          const s = (lod ? 4.2 : 3.2) + r() * 1.5, n = lod ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const a = r() * 3.14;
            parts.push({ geo: T.card(p2.clone().add(new V3(0, -s * 0.45, 0)), new V3(0, 1, 0), s, s, a, (r() - 0.5) * 0.4), mat: 1 });
          }
          parts.push({ geo: T.card(p2.clone().add(new V3(0, 0.2, 0)), new V3(0, 0.05, 1), s * 0.9, s * 0.9, 0, -1.4), mat: 1 });
        }
      };
      const nMain = 3 + ((r() * 2) | 0);
      for (let i = 0; i < nMain; i++) {
        const a = i / nMain * 6.283 + r() * 0.6;
        branch(top, new V3(Math.cos(a) * 0.75, 0.75 + r() * 0.3, Math.sin(a) * 0.75).normalize(), H * 0.28, R * 0.5, lod ? 1 : 2);
      }
      return T.merge(parts);
    }

    _birch(seed, lod) {
      const r = mulberry(seed), parts = [], H = 13 + r() * 6, R = 0.17 + r() * 0.08;
      const { g, pts } = this._trunk(H, R, 1.8, r, lod ? 5 : 8);
      parts.push({ geo: g, mat: 0 });
      const n = lod ? 4 : 9;
      for (let i = 0; i < n; i++) {
        const t = 0.45 + r() * 0.5, y = H * t, a = r() * 6.28, L = 1.5 + r() * 2.5;
        const from = new V3(0, y, 0), to = new V3(Math.cos(a) * L, y + 0.8 + r() * 1.5, Math.sin(a) * L);
        parts.push({ geo: T.limb([from, to], R * 0.35, 0.02, 4, 1), mat: 0 });
        const s = 1.8 + r() * 1.4;
        parts.push({ geo: T.card(to.clone().add(new V3(0, -s * 0.55, 0)), new V3(0, 1, 0), s, s * 1.2, r() * 3, 0), mat: 1 });
        if (!lod) parts.push({ geo: T.card(to.clone().add(new V3(0, -s * 0.55, 0)), new V3(0, 1, 0), s, s * 1.2, r() * 3 + 1.57, 0), mat: 1 });
      }
      return T.merge(parts);
    }

    _snag(seed, lod) {
      const r = mulberry(seed), parts = [], H = 8 + r() * 8, R = 0.3 + r() * 0.2;
      const { g, pts } = this._trunk(H, R, 1.6, r, lod ? 5 : 8, R * 0.35);
      parts.push({ geo: g, mat: 0 });
      if (!lod) this._roots(parts, R, r, 4);
      const n = lod ? 3 : 7;
      for (let i = 0; i < n; i++) {
        const y = H * (0.4 + r() * 0.55), a = r() * 6.28, L = 1.5 + r() * 3;
        const from = new V3(0, y, 0), mid = new V3(Math.cos(a) * L * 0.5, y + r() * 1.2, Math.sin(a) * L * 0.5), to = new V3(Math.cos(a + 0.4) * L, y + (r() - 0.3) * 2, Math.sin(a + 0.4) * L);
        parts.push({ geo: T.limb([from, mid, to], R * 0.3, 0.02, 4, 1), mat: 0 });
      }
      // líquenes colgantes ralos
      if (!lod) for (let i = 0; i < 3; i++) { const y = H * (0.5 + r() * 0.4), a = r() * 6.28; parts.push({ geo: T.card(new V3(Math.cos(a) * 0.9, y - 1.4, Math.sin(a) * 0.9), new V3(0, 1, 0), 1.2, 1.6, a, 0), mat: 1 }); }
      return T.merge(parts);
    }

    /* ---------- sotobosque ---------- */
    _scatter(n, minPath, seed, test) {
      const r = mulberry(seed), out = [];
      let g = 0;
      while (out.length < n && g++ < n * 12) {
        const x = (r() - 0.5) * SIZE * 0.95, z = (r() - 0.5) * SIZE * 0.95;
        const d = distToPath(x, z); if (d < minPath) continue;
        if (campDist(x, z) < CAMP.r - 2) continue;
        if (test && !test(x, z, d, r)) continue;
        out.push([x, z, r()]);
      }
      return out;
    }
    _instanced(geo, mat, items, scaleFn, yOff) {
      const M = new THREE.InstancedMesh(geo, mat, items.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();
      items.forEach(([x, z, k], i) => {
        q.setFromAxisAngle(new V3(0, 1, 0), k * 6.283);
        const sc = scaleFn(k); s.set(sc, sc * (0.8 + k * 0.4), sc);
        m4.compose(new V3(x, height(x, z) + (yOff || 0), z), q, s); M.setMatrixAt(i, m4);
      });
      M.frustumCulled = false; M.receiveShadow = true;
      this.scene.add(M); return M;
    }
    _undergrowth() {
      const Q = this.Q;
      // helechos: tres tarjetas cruzadas e inclinadas
      const fern = []; for (let i = 0; i < 4; i++) fern.push({ geo: T.card(new V3(0, 0, 0), new V3(Math.cos(i * 1.57) * 0.25, 1, Math.sin(i * 1.57) * 0.25), 1.6, 1.1, i * 0.8, 0), mat: 0 });
      const fernMat = new THREE.MeshStandardMaterial({ map: T.fernCard(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, color: 0x8f9a86, envMapIntensity: 0.4 });
      T.addWind(fernMat, this.uniforms, 0.12, 0.8); this.wetMats.push(fernMat);
      this.ferns = this._instanced(T.merge(fern), fernMat, this._scatter(Q.ferns, 1.4, 61, (x, z, d, r) => fbm(x * 0.04, z * 0.04 + 9, 3) > 0.42 || r() < 0.25), k => 0.7 + k * 0.9, -0.05);
      // borde del sendero: helechos densos que lo enmarcan
      const edge = [], re = mulberry(64);
      PATH_PTS.forEach(([x, z]) => { for (let i = 0; i < Math.round(Q.ferns / 800); i++) { const a = re() * 6.28, d = 2.2 + re() * 3.5; edge.push([x + Math.cos(a) * d, z + Math.sin(a) * d, re()]); } });
      this._instanced(T.merge(fern), fernMat, edge.filter(([x, z]) => distToPath(x, z) > 1.8 && campDist(x, z) > CAMP.r - 4), k => 0.8 + k * 0.9, -0.05);
      // pasto
      const grass = []; for (let i = 0; i < 3; i++) grass.push({ geo: T.card(new V3(0, 0, 0), new V3(0, 1, 0), 0.9, 0.7, i * 1.05, 0), mat: 0 });
      const grassMat = new THREE.MeshStandardMaterial({ map: T.grassCard(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, color: 0x8a907a });
      T.addWind(grassMat, this.uniforms, 0.18, 1.5); this.wetMats.push(grassMat);
      this._instanced(T.merge(grass), grassMat, this._scatter(Q.grass, 1.0, 62), k => 0.6 + k * 0.7, -0.05);
      // arbustos: racimos de hojas
      const bush = []; for (let i = 0; i < 4; i++) bush.push({ geo: T.card(new V3(0, -0.1, 0), new V3(Math.cos(i) * 0.4, 1, Math.sin(i) * 0.4), 2.0, 1.6, i * 0.8, 0), mat: 0 });
      const bushMat = new THREE.MeshStandardMaterial({ map: T.leafCard(91, 95, 25), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, color: 0x7d8a72 });
      T.addWind(bushMat, this.uniforms, 0.1, 0.6); this.wetMats.push(bushMat);
      this._instanced(T.merge(bush), bushMat, this._scatter(Q.bushes, 2.4, 63), k => 0.6 + k * 0.8, -0.1);
    }

    _rocksLogs() {
      const rockMat = new THREE.MeshStandardMaterial({ map: T.rockTexture(), roughness: 0.38, metalness: 0.05, color: 0x55595d, envMapIntensity: 0.9 });
      this.wetMats.push(rockMat);
      const rocks = [0, 1, 2].map(s => {
        const g = new THREE.IcosahedronGeometry(1, 2), P = g.attributes.position, rr = mulberry(100 + s);
        const k1 = rr() * 10, k2 = rr() * 10;
        for (let i = 0; i < P.count; i++) {
          const v = new V3(P.getX(i), P.getY(i), P.getZ(i));
          const n = 0.75 + T.fbm(v.x * 1.4 + k1, v.z * 1.4 + v.y * 0.7 + k2, 3) * 0.6;
          v.multiplyScalar(n); v.y *= 0.62; P.setXYZ(i, v.x, v.y, v.z);
        }
        // normales suaves (la icosfera no está indexada: promediamos por posición)
        g.computeVertexNormals();
        const N = g.attributes.normal, acc = new Map();
        for (let i = 0; i < P.count; i++) { const k = P.getX(i).toFixed(3) + ',' + P.getY(i).toFixed(3) + ',' + P.getZ(i).toFixed(3); const a = acc.get(k) || [0, 0, 0]; a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i); acc.set(k, a); }
        for (let i = 0; i < P.count; i++) { const a = acc.get(P.getX(i).toFixed(3) + ',' + P.getY(i).toFixed(3) + ',' + P.getZ(i).toFixed(3)); const l = Math.hypot(...a); N.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
        return g;
      });
      rocks.forEach((g, i) => {
        const items = this._scatter(this.Q.rocks / 3, 2.0, 70 + i);
        const M = this._instanced(g, rockMat, items, k => 0.35 + k * k * 1.6, -0.15);
        M.castShadow = true;
        items.forEach(([x, z, k]) => { if (0.35 + k * k * 1.6 > 0.8) this._addCollider(x, z, (0.35 + k * k * 1.6) * 0.9); });
      });
      // piedras chicas en el borde del sendero
      const pebble = new THREE.IcosahedronGeometry(0.18, 0);
      const pitems = []; const r = mulberry(5);
      PATH_PTS.forEach(([x, z]) => { for (let i = 0; i < 2; i++) { const a = r() * 6.28; pitems.push([x + Math.cos(a) * (1.6 + r() * 1.2), z + Math.sin(a) * (1.6 + r() * 1.2), r()]); } });
      this._instanced(pebble, rockMat, pitems, k => 0.6 + k * 1.4, -0.05);
      // troncos caídos y ramas en el suelo
      const logMat = this.species[0].mats[0];
      const logs = [], rl = mulberry(9);
      for (let i = 0; i < this.Q.logs; i++) {
        const x = (rl() - 0.5) * SIZE * 0.85, z = (rl() - 0.5) * SIZE * 0.85; if (distToPath(x, z) < 3 || campDist(x, z) < CAMP.r) continue;
        const a = rl() * 6.28, L = 3 + rl() * 7, R = 0.18 + rl() * 0.3;
        const p0 = new V3(x, height(x, z) + R * 0.6, z), p2 = new V3(x + Math.cos(a) * L, 0, z + Math.sin(a) * L); p2.y = height(p2.x, p2.z) + R * 0.5;
        const p1 = p0.clone().lerp(p2, 0.5); p1.y += 0.1;
        logs.push({ geo: T.limb([p0, p1, p2], R, R * 0.8, 8, 0.4), mat: 0 });
        for (let s = 0; s <= 3; s++) { const p = p0.clone().lerp(p2, s / 3); this._addCollider(p.x, p.z, R + 0.2); }
      }
      // ramas sueltas
      for (let i = 0; i < this.Q.logs * 4; i++) {
        const x = (rl() - 0.5) * SIZE * 0.85, z = (rl() - 0.5) * SIZE * 0.85; if (campDist(x, z) < CAMP.r - 6) continue; const a = rl() * 6.28, L = 0.8 + rl() * 2;
        const p0 = new V3(x, height(x, z) + 0.05, z), p1 = new V3(x + Math.cos(a) * L, 0, z + Math.sin(a) * L); p1.y = height(p1.x, p1.z) + 0.05;
        logs.push({ geo: T.limb([p0, p1], 0.05, 0.015, 4, 1), mat: 0 });
      }
      const lm = new THREE.Mesh(T.merge(logs), [logMat]); lm.castShadow = true; lm.receiveShadow = true; this.scene.add(lm);
    }

    _sign() {
      // cartel de madera junto al sendero (primera pista)
      const x = 7.5, z = 120, y = height(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -0.35;
      const wood = new THREE.MeshStandardMaterial({ map: T.woodTexture('#4a3420'), roughness: 0.55, envMapIntensity: 0.6 }); this.wetMats.push(wood);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), wood); post.position.y = 1.1; g.add(post);
      const c = T.canvas(512, 192), cx = c.getContext('2d');
      cx.fillStyle = '#5a3d22'; cx.fillRect(0, 0, 512, 192);
      for (let i = 0; i < 40; i++) { cx.strokeStyle = 'rgba(0,0,0,0.25)'; cx.beginPath(); const yy = Math.random() * 192; cx.moveTo(0, yy); cx.lineTo(512, yy + (Math.random() - 0.5) * 8); cx.stroke(); }
      cx.fillStyle = '#d8cfb8'; cx.font = 'bold 74px Georgia, serif'; cx.textAlign = 'center'; cx.fillText('CAMPING', 256, 86);
      cx.font = 'bold 66px Georgia, serif'; cx.fillText('←  500 m', 256, 160);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.56, 0.06), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.5 }), wood]);
      board.position.set(0.15, 1.85, 0.1); board.rotation.z = -0.05; g.add(board);
      g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
      this.scene.add(g); this.signPos = new V3(x, y + 1.8, z);
      this._addCollider(x, z, 0.35);
    }

    _mist() {
      // bancos de niebla rasante: sprites suaves que derivan alrededor del jugador
      const c = T.canvas(128, 128), g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const mat = new THREE.SpriteMaterial({ map: T.tex(c), color: 0x7d8a9c, transparent: true, opacity: 0.07, depthWrite: false, fog: false });
      this.mistMat = mat;
      this.mist = [];
      for (let i = 0; i < this.Q.mist; i++) {
        const s = new THREE.Sprite(mat); const sc = 14 + Math.random() * 18; s.scale.set(sc, sc * 0.4, 1);
        s.userData = { ox: rnd(-60, 60), oz: rnd(-60, 60), y: rnd(0.5, 3.5), v: rnd(0.3, 0.9) };
        s.renderOrder = 6; this.scene.add(s); this.mist.push(s);
      }
    }

    _addCollider(x, z, r) {
      const c = { x, z, r }; this.colliders.push(c);
      const k = ((x / 8) | 0) + ':' + ((z / 8) | 0);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const kk = (((x / 8) | 0) + i) + ':' + (((z / 8) | 0) + j);
        if (!this.cell.has(kk)) this.cell.set(kk, []); this.cell.get(kk).push(c);
      }
    }
    collidersNear(x, z) { return this.cell.get(((x / 8) | 0) + ':' + ((z / 8) | 0)) || []; }

    // LOD de árboles: detallados cerca, simplificados lejos, nada detrás de la niebla
    updateLOD(p, force) {
      if (!force && this._lodAt.distanceToSquared(p) < 9) return;
      this._lodAt.copy(p);
      const n2 = this.Q.nearR ** 2, f2 = this.Q.farR ** 2;
      for (const s of this.species) {
        let nn = 0, nf = 0;
        for (const t of s.list) {
          const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
          if (d < n2) s.nearMesh.setMatrixAt(nn++, t.m);
          else if (d < f2) s.farMesh.setMatrixAt(nf++, t.m);
        }
        s.nearMesh.count = nn; s.farMesh.count = nf;
        s.nearMesh.instanceMatrix.needsUpdate = true; s.farMesh.instanceMatrix.needsUpdate = true;
      }
    }

    update(dt, time, camPos, storm) {
      // claros: cuando la lluvia afloja aparecen la luna y las estrellas, y la luna ilumina el bosque
      const clearT = Math.max(0.03, Math.min(0.78, 1.05 - storm.rain * 1.15));
      this.clear = (this.clear == null ? clearT : this.clear + (clearT - this.clear) * (1 - Math.exp(-dt / 4)));
      this.skyMat.uniforms.uClear.value = this.clear;
      this.sky.position.copy(camPos); // el domo viaja con la cámara: nunca queda fuera del plano lejano
      this.moon.intensity = 0.06 + this.clear * 0.34;
      this.moon.position.copy(camPos).addScaledVector(this.moonDir, 200); this.moon.target.position.copy(camPos); this.moon.target.updateMatrixWorld();
      this.uniforms.uTime.value = time;
      this.uniforms.uWind.value = 0.5 + storm.wind * 1.4;
      if (this.rainUniform) this.rainUniform.value = storm.rain;
      this.updateLOD(camPos);
      for (const s of this.mist) {
        const u = s.userData; u.ox += u.v * dt * storm.wind * 2; if (u.ox > 60) u.ox -= 120;
        const x = Math.round(camPos.x / 120) * 0 + camPos.x + u.ox, z = camPos.z + u.oz;
        s.position.set(x, height(x, z) + u.y, z);
      }
      this.mistMat.opacity = 0.03 + storm.fog * 0.05;
      this.scene.fog.density = this.fogBase * (0.8 + storm.fog * 0.6);
    }
  }

  window.TS.World = World;
  Object.assign(window.TS, { height, distToPath, PATH_PTS, SIZE, HALF, pathCurve, CAMP, campDist });
})();
