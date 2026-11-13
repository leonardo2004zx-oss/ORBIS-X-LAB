/* TORMENTA SALVAJE — tormenta: lluvia en GPU, salpicaduras, relámpagos y director de intensidad */
(function () {
  'use strict';
  const T = window.TS, V3 = THREE.Vector3, rnd = T.rnd;

  /* ---------------- Lluvia ----------------
   * Miles de gotas instanciadas en una caja que sigue a la cámara (envoltura con mod()).
   * Cada gota es una estela fina orientada según su velocidad (viento + caída) y de tamaño variable.
   * Casi invisible en la oscuridad; se enciende dentro del cono de la linterna y con los relámpagos.
   */
  class Rain {
    constructor(scene, max) {
      this.max = max;
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
      g.setIndex([0, 1, 2, 2, 1, 3]);
      const off = new Float32Array(max * 3), rr = new Float32Array(max * 2);
      for (let i = 0; i < max; i++) { off[i * 3] = Math.random(); off[i * 3 + 1] = Math.random(); off[i * 3 + 2] = Math.random(); rr[i * 2] = Math.random(); rr[i * 2 + 1] = Math.pow(Math.random(), 2); }
      g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
      g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rr, 2));
      g.instanceCount = max;
      this.u = {
        uTime: { value: 0 }, uCam: { value: new V3() }, uBox: { value: new V3(22, 16, 22) },
        uWind: { value: new THREE.Vector2(2, 0.5) }, uSpeed: { value: 10 },
        uFlPos: { value: new V3() }, uFlDir: { value: new V3(0, 0, -1) }, uFlCos: { value: 0.9 }, uFlOn: { value: 1 },
        uFlash: { value: 0 }, uAmb: { value: 0.05 }, uHide: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute vec3 aOff; attribute vec2 aRnd;
          uniform float uTime, uSpeed, uFlCos, uFlOn, uFlash, uAmb, uHide;
          uniform vec3 uCam, uBox, uFlPos, uFlDir; uniform vec2 uWind;
          varying float vA; varying vec2 vUv; varying float vWarm;
          void main(){
            float sp = uSpeed * (0.75 + aRnd.x * 0.5) * (0.85 + aRnd.y * 0.4);
            vec3 vel = vec3(uWind.x * (0.8 + aRnd.x * 0.4), -sp, uWind.y * (0.8 + aRnd.y * 0.4));
            vec3 base = uCam - uBox * 0.5;
            vec3 p = base + mod(aOff * uBox + vel * uTime - base, uBox);
            vec3 dir = normalize(vel);
            float len = length(vel) * (0.045 + aRnd.y * 0.04);
            vec3 toC = p - cameraPosition; float dc = length(toC);
            vec3 side = normalize(cross(dir, toC)) * (0.006 + aRnd.y * 0.012) * (1.0 + dc * 0.03);
            vec3 wp = p + side * position.x * 2.0 - dir * len * position.y;
            // iluminación: linterna (cono) + relámpago + ambiente apenas perceptible
            vec3 lv = p - uFlPos; float ld = length(lv);
            float cone = smoothstep(uFlCos, uFlCos + 0.06, dot(lv / ld, uFlDir)) * clamp(1.0 - ld / 26.0, 0.0, 1.0) * uFlOn;
            cone *= cone;
            float fade = smoothstep(0.35, 1.6, dc) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, dc));
            vA = (uAmb + cone * 2.2 + uFlash * 0.7) * fade * (0.45 + aRnd.y * 0.8) * (1.0 - uHide);
            vWarm = cone;
            vUv = vec2(position.x + 0.5, position.y);
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: `
          varying float vA; varying vec2 vUv; varying float vWarm;
          void main(){
            float a = vA * sin(vUv.y * 3.1416) * (1.0 - abs(vUv.x * 2.0 - 1.0));
            vec3 c = mix(vec3(0.55, 0.62, 0.78), vec3(1.0, 0.93, 0.78), clamp(vWarm, 0.0, 1.0));
            gl_FragColor = vec4(c * a, 1.0);
          }`,
      });
      this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
      scene.add(this.mesh);
      this.geo = g;
    }
    update(time, cam, storm, fl) {
      const u = this.u;
      u.uTime.value = time; u.uCam.value.copy(cam.position);
      u.uWind.value.set(storm.windX, storm.windZ);
      u.uSpeed.value = 9 + storm.rain * 3;
      u.uFlash.value = storm.flash;
      u.uAmb.value = 0.07 + storm.rain * 0.05;
      this.geo.instanceCount = Math.floor(this.max * (0.25 + storm.rain * 0.75));
      if (fl) { u.uFlPos.value.copy(fl.pos); u.uFlDir.value.copy(fl.dir); u.uFlCos.value = fl.cos; u.uFlOn.value = fl.on; }
    }
  }

  /* ---------------- Salpicaduras ---------------- */
  class Splashes {
    constructor(scene, max) {
      this.max = max; this.n = 0;
      this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.age = new Float32Array(max); this.ttl = new Float32Array(max);
      this.gp = new Float32Array(max * 3); this.ga = new Float32Array(max);
      const g = this.geo = new THREE.BufferGeometry();
      this.aP = new THREE.BufferAttribute(this.gp, 3).setUsage(THREE.DynamicDrawUsage);
      this.aA = new THREE.BufferAttribute(this.ga, 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.aP); g.setAttribute('alpha', this.aA);
      this.u = { uScale: { value: 400 }, uFlPos: { value: new V3() }, uFlDir: { value: new V3() }, uFlCos: { value: 0.9 }, uFlOn: { value: 1 }, uFlash: { value: 0 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float alpha; uniform float uScale, uFlCos, uFlOn, uFlash; uniform vec3 uFlPos, uFlDir; varying float vA;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
            vec3 lv = position - uFlPos; float ld = length(lv);
            float cone = smoothstep(uFlCos, uFlCos + 0.06, dot(lv/ld, uFlDir)) * clamp(1.0 - ld/20.0, 0.0, 1.0) * uFlOn;
            vA = alpha * (0.06 + cone * 1.3 + uFlash * 0.6);
            gl_PointSize = clamp(0.035 * uScale / -mv.z, 1.0, 6.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c)*4.0; if (d>1.0) discard; gl_FragColor = vec4(vec3(0.85,0.88,0.95) * vA * (1.0-d), 1.0); }`,
      });
      this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 9;
      scene.add(this.points);
      this.acc = 0;
    }
    spawn(x, y, z, k) {
      for (let j = 0; j < k && this.n < this.max; j++) {
        const i = this.n++, i3 = i * 3, a = Math.random() * 6.283, s = rnd(0.3, 1.0);
        this.p[i3] = x; this.p[i3 + 1] = y + 0.01; this.p[i3 + 2] = z;
        this.v[i3] = Math.cos(a) * s; this.v[i3 + 1] = rnd(0.8, 2.0); this.v[i3 + 2] = Math.sin(a) * s;
        this.age[i] = 0; this.ttl[i] = rnd(0.18, 0.32);
      }
    }
    update(dt, cam, storm, fl, groundAt) {
      // genera salpicaduras alrededor del jugador, con más densidad hacia donde mira
      this.acc += dt * storm.rain * this.max * 2.2;
      const fwd = new V3(); cam.getWorldDirection(fwd);
      while (this.acc >= 1) {
        this.acc -= 1;
        const r = Math.sqrt(Math.random()) * 13, a = Math.random() * 6.283;
        let x = cam.position.x + Math.cos(a) * r, z = cam.position.z + Math.sin(a) * r;
        if (Math.random() < 0.6) { x = cam.position.x + fwd.x * rnd(1, 12) + rnd(-3, 3); z = cam.position.z + fwd.z * rnd(1, 12) + rnd(-3, 3); }
        this.spawn(x, groundAt(x, z), z, 2 + (Math.random() * 2 | 0));
      }
      for (let i = 0; i < this.n; i++) {
        this.age[i] += dt;
        if (this.age[i] >= this.ttl[i]) {
          const j = --this.n; if (i !== j) { for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; } this.age[i] = this.age[j]; this.ttl[i] = this.ttl[j]; }
          i--; continue;
        }
        const i3 = i * 3; this.v[i3 + 1] -= 9.8 * dt;
        this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
        this.gp[i3] = this.p[i3]; this.gp[i3 + 1] = this.p[i3 + 1]; this.gp[i3 + 2] = this.p[i3 + 2];
        this.ga[i] = 1 - this.age[i] / this.ttl[i];
      }
      this.geo.setDrawRange(0, this.n); this.aP.needsUpdate = true; this.aA.needsUpdate = true;
      const u = this.u; u.uFlash.value = storm.flash;
      if (fl) { u.uFlPos.value.copy(fl.pos); u.uFlDir.value.copy(fl.dir); u.uFlCos.value = fl.cos; u.uFlOn.value = fl.on; }
    }
  }

  /* ---------------- Relámpagos ---------------- */
  class Lightning {
    constructor(scene) {
      this.light = new THREE.DirectionalLight(0xb8c8ff, 0); this.light.position.set(80, 200, -60); scene.add(this.light);
      this.boltMat = new THREE.MeshBasicMaterial({ color: 0xd8e2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.glowMat = new THREE.MeshBasicMaterial({ color: 0x6f86d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.bolt = null; this.scene = scene;
      this.events = []; this.level = 0; this.boltLevel = 0;
    }
    _buildBolt(origin, dir) {
      if (this.bolt) { this.scene.remove(this.bolt); this.bolt.children.forEach(c => c.geometry.dispose()); }
      const grp = new THREE.Group();
      const seg = (from, to, w, depth, mat) => {
        const pts = [from]; let cur = from.clone(); const n = 10;
        for (let i = 1; i <= n; i++) {
          const t = i / n, p = from.clone().lerp(to, t);
          if (i < n) p.add(new V3(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).multiplyScalar(from.distanceTo(to) * 0.06));
          pts.push(p);
          if (depth > 0 && Math.random() < 0.28) {
            const br = p.clone().add(new V3(rnd(-1, 1) * 60, -rnd(30, 90), rnd(-1, 1) * 60));
            seg(p, br, w * 0.45, depth - 1, mat);
          }
        }
        for (const W of [w, w * 5]) {
          const pos = [];
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], side = new V3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(W);
            pos.push(a.x - side.x, a.y, a.z - side.z, a.x + side.x, a.y, a.z + side.z, b.x - side.x, b.y, b.z - side.z,
              b.x - side.x, b.y, b.z - side.z, a.x + side.x, a.y, a.z + side.z, b.x + side.x, b.y, b.z + side.z);
          }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          const m = new THREE.Mesh(g, W === w ? this.boltMat : this.glowMat); m.frustumCulled = false; m.renderOrder = -5; grp.add(m);
        }
      };
      const top = origin.clone().addScaledVector(dir, 700); top.y = 420;
      const bottom = top.clone().add(new V3(rnd(-80, 80), -400, rnd(-80, 80)));
      seg(top, bottom, 1.6, 2);
      this.bolt = grp; this.scene.add(grp);
    }
    // descarga: patrón irregular de destellos (líder, retorno, re-descargas)
    strike(near, camPos, inView) {
      const now = performance.now() / 1000, base = near ? rnd(1.4, 2.4) : rnd(0.5, 1.2);
      const n = 2 + (Math.random() * 4 | 0); let t = 0;
      for (let i = 0; i < n; i++) { this.events.push({ at: now + t, dur: rnd(0.04, 0.12), amp: base * (i === 0 ? rnd(0.5, 0.8) : rnd(0.5, 1.1)) }); t += rnd(0.05, 0.22); }
      if (Math.random() < 0.3) this.events.push({ at: now + t + rnd(0.2, 0.6), dur: rnd(0.08, 0.2), amp: base * 0.5 });
      const ang = rnd(0, 6.283), dir = inView ? inView.clone() : new V3(Math.cos(ang), 0, Math.sin(ang));
      dir.y = 0; dir.normalize().applyAxisAngle(new V3(0, 1, 0), rnd(-0.5, 0.5));
      this.flashDir = dir.clone().add(new V3(0, 0.6, 0)).normalize();
      this.light.position.copy(camPos).addScaledVector(this.flashDir, 200);
      this.light.target.position.copy(camPos);
      if (Math.random() < (near ? 0.85 : 0.55)) this._buildBolt(camPos, dir); else if (this.bolt) { this.scene.remove(this.bolt); this.bolt = null; }
      return t;
    }
    update() {
      const now = performance.now() / 1000;
      let lv = 0;
      this.events = this.events.filter(e => {
        if (now < e.at) return true;
        const k = (now - e.at) / e.dur;
        if (k < 1) lv = Math.max(lv, e.amp * (1 - k * 0.6));
        else if (k < 4) lv = Math.max(lv, e.amp * 0.4 * Math.exp(-(k - 1) * 1.8));
        return k < 4;
      });
      this.level = lv;
      this.light.intensity = Math.min(1.2, lv) * 0.95;
      this.light.target.updateMatrixWorld();
      const bl = Math.min(1, lv);
      this.boltMat.opacity = bl; this.glowMat.opacity = bl * 0.25;
      return lv;
    }
  }

  /* ---------------- Director de la tormenta ---------------- */
  class Storm {
    constructor() {
      this.rain = 0.75; this.target = 0.8; this.wind = 0.6; this.windDir = 0.4;
      this.windX = 2; this.windZ = 0.5; this.fog = 0.6; this.flash = 0;
      this.nextChange = 30; this.nextStrike = 6; this.gust = 0; this.gustT = 0;
      this.phase = 'build';
    }
    update(dt, time) {
      this.nextChange -= dt;
      if (this.nextChange <= 0) {
        // ciclos: cargada → torrencial → amaina un poco → vuelve
        const opts = [0.28, 0.4, 0.6, 0.8, 0.95, 1.0];  // incluye respiros con luna
        this.target = opts[(Math.random() * opts.length) | 0];
        this.nextChange = rnd(35, 80);
      }
      this.rain += (this.target - this.rain) * (1 - Math.exp(-dt / 8));
      // ráfagas
      this.gustT -= dt;
      if (this.gustT <= 0) { this.gustTarget = Math.random() < 0.35 ? rnd(0.7, 1.0) : rnd(0.0, 0.35); this.gustT = rnd(2, 7); }
      this.gust += ((this.gustTarget || 0) - this.gust) * (1 - Math.exp(-dt / 1.5));
      this.wind = 0.25 + this.rain * 0.4 + this.gust * 0.6;
      this.windDir += Math.sin(time * 0.05) * dt * 0.02;
      const ws = this.wind * 4.5;
      this.windX = Math.cos(this.windDir) * ws; this.windZ = Math.sin(this.windDir) * ws;
      this.fog = 0.3 + this.rain * 0.7;
    }
  }

  Object.assign(window.TS, { Rain, Splashes, Lightning, Storm });
})();
