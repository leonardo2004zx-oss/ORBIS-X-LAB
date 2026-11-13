/* PYRO SKY SIMULATOR — escenario nocturno: cielo, estrellas, terreno, lago, luces y cámara */
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ruido de valor 2D simple para el relieve
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += vnoise(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; }

  // altura del terreno: campo de lanzamiento plano, lago frente al público, colinas atrás
  function terrainHeight(x, z) {
    let h = (fbm(x * 0.004 + 3, z * 0.004 + 7) - 0.45) * 26;
    // colinas y montañas al fondo
    const back = Math.min(1, Math.max(0, (-z - 260) / 1100));
    h += back * back * 230 * (0.45 + fbm(x * 0.0025, z * 0.0025 + 11));
    // laterales que encierran el valle (de ahí los ecos)
    const side = Math.min(1, Math.max(0, (Math.abs(x) - 420) / 900));
    h += side * side * 170 * (0.4 + fbm(x * 0.003 + 5, z * 0.003));
    // campo de lanzamiento
    const pad = Math.exp(-((x * x) / (160 * 160) + (z * z) / (60 * 60)));
    h = h * (1 - pad) + 1.2 * pad;
    // lago entre los cohetes y el público
    const lx = x / 260, lz = (z - 115) / 62;
    const lake = 1 - (lx * lx + lz * lz);
    if (lake > 0) h = h * (1 - Math.min(1, lake * 3)) - lake * 7;
    // orilla del público
    const aud = Math.exp(-((x * x) / (220 * 220) + ((z - 265) * (z - 265)) / (55 * 55)));
    h = h * (1 - aud) + 1.0 * aud;
    return h;
  }

  class World {
    constructor(canvas, quality) {
      this.q = quality;
      const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.aa, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
      r.setClearColor(0x02030a);
      r.outputEncoding = THREE.sRGBEncoding;
      const scene = this.scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x060a18, 0.00042);
      const cam = this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 6000);
      cam.position.set(0, 6, 265);

      this._sky(); this._stars(); this._terrain(); this._water(); this._trees(); this._pads(); this._town();

      // luz de luna y ambiente muy tenue
      scene.add(new THREE.HemisphereLight(0x23305a, 0x05060a, 0.55));
      const moon = new THREE.DirectionalLight(0x8ea2d8, 0.35); moon.position.set(-300, 400, -500); scene.add(moon);

      // pool de luces dinámicas de los estallidos (número fijo → sin recompilar shaders)
      this.flashes = [];
      for (let i = 0; i < quality.lights; i++) {
        const L = new THREE.PointLight(0xffffff, 0, 1100, 1.4);
        L.position.set(0, 150, 0); scene.add(L); this.flashes.push(L);
        L.userData = { decay: 1 };
      }
      // luz del pad de lanzamiento (mecha / chorro)
      this.padLight = new THREE.PointLight(0xffa040, 0, 120, 1.6);
      this.padLight.position.set(0, 3, 0); scene.add(this.padLight);
      this.padLevel = 0;
      this.skyFlash = new THREE.Color(0, 0, 0);

      this.cam = new CameraRig(this.camera, canvas);
      this.resize();
    }

    _sky() {
      const geo = new THREE.SphereGeometry(5000, 32, 16);
      this.skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uFlash: { value: new THREE.Color(0, 0, 0) } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `varying vec3 vP; uniform vec3 uFlash;
          void main(){
            float h = clamp(vP.y, -0.1, 1.0);
            vec3 zen = vec3(0.004,0.006,0.02);
            vec3 mid = vec3(0.012,0.02,0.06);
            vec3 hor = vec3(0.045,0.05,0.11);
            vec3 c = mix(hor, mid, smoothstep(0.0,0.18,h));
            c = mix(c, zen, smoothstep(0.18,0.9,h));
            // resplandor lejano de un pueblo en el horizonte
            c += vec3(0.06,0.03,0.015) * exp(-abs(vP.y)*30.0) * smoothstep(0.2,1.0, -vP.z);
            c += uFlash * (0.25 + 0.75*smoothstep(-0.05,0.6,h)) ;
            gl_FragColor = vec4(c,1.0);
          }`,
      });
      const sky = new THREE.Mesh(geo, this.skyMat); sky.renderOrder = -10; this.scene.add(sky);
      // luna
      const mc = document.createElement('canvas'); mc.width = mc.height = 128;
      const g = mc.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      grd.addColorStop(0, 'rgba(225,230,255,1)'); grd.addColorStop(0.42, 'rgba(205,212,240,1)');
      grd.addColorStop(0.48, 'rgba(120,140,200,0.25)'); grd.addColorStop(1, 'rgba(60,80,160,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(150,155,185,0.35)';
      [[50, 52, 8], [72, 70, 6], [58, 78, 4], [76, 50, 5]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, depthWrite: false, transparent: true }));
      sp.position.set(-2900, 2300, -2400); sp.scale.set(240, 240, 1); sp.material.opacity = 0.8; sp.renderOrder = -9;
      this.scene.add(sp);
    }

    _stars() {
      const n = this.q.stars, pos = new Float32Array(n * 3), tw = new Float32Array(n), br = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const u = Math.random(), v = rnd(0.02, 1);
        const th = u * Math.PI * 2, y = Math.pow(v, 0.8), r = Math.sqrt(1 - y * y);
        pos[i * 3] = Math.cos(th) * r * 4500; pos[i * 3 + 1] = y * 4500; pos[i * 3 + 2] = Math.sin(th) * r * 4500;
        tw[i] = Math.random() * 100; br[i] = Math.pow(Math.random(), 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('tw', new THREE.BufferAttribute(tw, 1));
      g.setAttribute('br', new THREE.BufferAttribute(br, 1));
      this.starMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uDim: { value: 1 } }, transparent: true, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute float tw; attribute float br; uniform float uTime; uniform float uDim; varying float vB; varying vec3 vC;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0);
            float t = 0.75 + 0.25*sin(uTime*(1.5+fract(tw)*3.0)+tw);
            vB = (0.25 + br*0.9) * t * uDim * smoothstep(0.0, 0.12, normalize(position).y);
            vC = mix(vec3(0.75,0.82,1.0), vec3(1.0,0.86,0.7), fract(tw*7.3));
            gl_PointSize = 1.2 + br*2.4; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying float vB; varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float d=dot(c,c)*4.0; if(d>1.0) discard; gl_FragColor=vec4(vC*vB*(1.0-d),1.0);} `,
      });
      const s = new THREE.Points(g, this.starMat); s.renderOrder = -8; s.frustumCulled = false; this.scene.add(s);
      // Vía Láctea: banda tenue de estrellas finas
      const m = this.q.stars, mp = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const t = rnd(-1, 1) * Math.PI, w = (Math.random() + Math.random() + Math.random() - 1.5) * 0.12;
        const x = Math.cos(t), y = Math.abs(Math.sin(t)) * 0.75 + 0.15 + w, z = Math.sin(t) * 0.5 - 0.6;
        const l = Math.hypot(x, y, z);
        mp[i * 3] = x / l * 4400; mp[i * 3 + 1] = y / l * 4400; mp[i * 3 + 2] = z / l * 4400;
      }
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
      const mw = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x38446a, size: 1.0, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      mw.renderOrder = -8; this.scene.add(mw);
    }

    _terrain() {
      const seg = this.q.terrainSeg;
      const geo = new THREE.PlaneGeometry(4200, 4200, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
        p.setY(i, h);
        const n = fbm(x * 0.02, z * 0.02);
        const grass = [0.05 + n * 0.03, 0.075 + n * 0.04, 0.05 + n * 0.02];
        const rock = [0.09, 0.085, 0.09];
        const k = Math.min(1, Math.max(0, (h - 25) / 80));
        cols[i * 3] = grass[0] + (rock[0] - grass[0]) * k;
        cols[i * 3 + 1] = grass[1] + (rock[1] - grass[1]) * k;
        cols[i * 3 + 2] = grass[2] + (rock[2] - grass[2]) * k;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      const t = new THREE.Mesh(geo, mat); t.renderOrder = 0; this.scene.add(t);
    }

    _water() {
      const geo = new THREE.PlaneGeometry(620, 150, 1, 1); geo.rotateX(-Math.PI / 2);
      this.waterMat = new THREE.MeshStandardMaterial({ color: 0x050a16, roughness: 0.18, metalness: 0.6, transparent: true, opacity: 0.72, depthWrite: false });
      const w = new THREE.Mesh(geo, this.waterMat); w.position.set(0, 0, 115); w.renderOrder = 2; this.scene.add(w);
    }

    _trees() {
      const n = this.q.trees;
      const geo = new THREE.ConeGeometry(1, 1, 6); geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 1 });
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
      let k = 0, guard = 0;
      while (k < n && guard++ < n * 20) {
        const x = rnd(-900, 900), z = rnd(-700, 420);
        if (Math.abs(x) < 190 && z > -70 && z < 320) continue; // claro central, lago y público
        const h = terrainHeight(x, z); if (h < 1 || h > 120) continue;
        const sc = rnd(6, 14);
        v.set(x, h - 0.5, z); s.set(sc * 0.5, sc * rnd(1.6, 2.4), sc * 0.35);
        m.compose(v, q, s); mesh.setMatrixAt(k++, m);
      }
      mesh.count = k; this.scene.add(mesh);
    }

    _pads() {
      this.pads = [-80, -40, 0, 40, 80].map(x => new THREE.Vector3(x, terrainHeight(x, 0) + 0.2, rnd(-6, 6)));
      const geo = new THREE.CylinderGeometry(1.6, 2, 0.6, 10);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.8, metalness: 0.2 });
      const rack = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.6, metalness: 0.6 });
      this.pads.forEach(p => {
        const m = new THREE.Mesh(geo, mat); m.position.copy(p); this.scene.add(m);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 5), rack); rod.position.set(p.x + 0.9, p.y + 3, p.z); this.scene.add(rod);
      });
    }

    _town() {
      // lucecitas lejanas: da escala y profundidad
      const n = 220, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = rnd(-1400, -300) + (Math.random() < 0.5 ? 1500 : 0), z = rnd(-2000, -1300);
        pos[i * 3] = x; pos[i * 3 + 1] = terrainHeight(x, z) + rnd(2, 10); pos[i * 3 + 2] = z;
        const w = Math.random(); col[i * 3] = 1; col[i * 3 + 1] = 0.7 + w * 0.2; col[i * 3 + 2] = 0.35 + w * 0.3;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      this.scene.add(pts);
    }

    // destello dinámico que ilumina terreno, humo y cielo
    flash(pos, color, intensity, decay) {
      let best = this.flashes[0];
      for (const L of this.flashes) if (L.intensity < best.intensity) best = L;
      best.position.copy(pos); best.color.setRGB(color[0], color[1], color[2]);
      best.intensity = intensity; best.userData.decay = decay || 2.2;
      this.skyFlash.r += color[0] * intensity * 0.012;
      this.skyFlash.g += color[1] * intensity * 0.012;
      this.skyFlash.b += color[2] * intensity * 0.012;
    }

    padGlow(pos, level, color) {
      this.padLight.position.set(pos.x, pos.y + 3, pos.z);
      if (color) this.padLight.color.setRGB(color[0], color[1], color[2]);
      this.padLevel = Math.max(this.padLevel, level);
    }

    update(dt, rdt, time) {
      for (const L of this.flashes) L.intensity *= Math.exp(-L.userData.decay * dt);
      const k = Math.exp(-2.5 * dt);
      this.skyFlash.multiplyScalar(k);
      // límite: el cielo se tiñe, nunca se blanquea
      const m = Math.max(this.skyFlash.r, this.skyFlash.g, this.skyFlash.b);
      if (m > 0.06) this.skyFlash.multiplyScalar(0.06 / m);
      this.skyMat.uniforms.uFlash.value.copy(this.skyFlash);
      this.padLight.intensity = this.padLevel * (0.8 + Math.random() * 0.4);
      this.padLevel *= Math.exp(-6 * dt);
      this.starMat.uniforms.uTime.value = time;
      this.cam.update(rdt);
    }

    pointScale() {
      const h = this.renderer.domElement.height;
      return h * 0.5 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w < h ? 68 : 55; // retrato: más campo vertical
      this.camera.updateProjectionMatrix();
    }
    render() { this.renderer.render(this.scene, this.camera); }
  }

  /* ---------- Cámara libre: arrastrar, pellizcar, rueda + vistas predefinidas ---------- */
  class CameraRig {
    constructor(camera, el) {
      this.camera = camera;
      this.target = new THREE.Vector3(0, 128, 0);
      this.goalTarget = this.target.clone();
      this.yaw = 0; this.pitch = -0.45; this.dist = 240;
      this.goal = { yaw: 0, pitch: -0.45, dist: 240 };
      this.follow = null;
      this.pointers = new Map(); this._pinch = 0;
      el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
      el.addEventListener('pointermove', e => {
        const p = this.pointers.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (this.pointers.size === 1) {
          this.goal.yaw -= dx * 0.005; this.goal.pitch = Math.max(-1.25, Math.min(1.25, this.goal.pitch + dy * 0.004));
        } else if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this._pinch) this.zoom(this._pinch / d);
          this._pinch = d;
        }
      });
      const up = e => { this.pointers.delete(e.pointerId); this._pinch = 0; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    }
    zoom(f) { this.goal.dist = Math.max(25, Math.min(900, this.goal.dist * f)); }
    preset(name) {
      this.follow = null;
      const P = {
        publico: [0, 100, 0, 0, -0.31, 250],
        orilla: [10, 85, 0, 0.55, -0.62, 150],
        aerea: [0, 70, 20, -0.25, 0.55, 520],
        lateral: [0, 120, 0, 1.25, -0.18, 330],
        seguir: [0, 60, 0, 0.35, -0.05, 85],
      }[name];
      this.goalTarget.set(P[0], P[1], P[2]);
      this.goal.yaw = P[3]; this.goal.pitch = P[4]; this.goal.dist = P[5];
      this.mode = name;
    }
    update(dt) {
      if (this.follow && this.follow.pos) this.goalTarget.copy(this.follow.pos);
      const k = 1 - Math.exp(-(this.follow ? 6 : 3) * dt);
      this.target.lerp(this.goalTarget, k);
      // yaw por el camino más corto
      this.yaw += (this.goal.yaw - this.yaw) * k;
      this.pitch += (this.goal.pitch - this.pitch) * k;
      this.dist += (this.goal.dist - this.dist) * k;
      const c = this.camera, cp = Math.cos(this.pitch);
      c.position.set(
        this.target.x + Math.sin(this.yaw) * cp * this.dist,
        this.target.y - Math.sin(-this.pitch) * this.dist,
        this.target.z + Math.cos(this.yaw) * cp * this.dist);
      const ground = terrainHeight(c.position.x, c.position.z) + 2;
      if (c.position.y < ground) c.position.y = ground;
      c.lookAt(this.target);
    }
  }

  window.PyroWorld = { World, terrainHeight };
})();
