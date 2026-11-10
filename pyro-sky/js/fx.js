/* PYRO SKY SIMULATOR — partículas (estrellas, chispas, estelas) y humo
 * Un único pool de partículas en arrays tipados → una sola llamada de dibujo.
 * Los reflejos en el lago reutilizan la misma geometría espejada.
 */
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);

  const F = {
    TRAIL: 1,      // va dejando estela
    STROBE: 2,     // parpadeo estroboscópico
    CRACKLE: 4,    // al final estalla en micro-destellos
    FLICKER: 8,    // titileo irregular
    GLITTER: 16,   // purpurina: destellos finos aleatorios
    SPLIT: 32,     // crossette: se divide en 4
    LATEFADE: 64,  // mantiene brillo y cae al final (sauce)
  };

  const SPARK_VS = `
    attribute vec3 color; attribute float size;
    uniform float uScale; uniform float uDim;
    varying vec3 vCol;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      float s = size * uScale / max(1.0, -mv.z);
      float e = 1.0;
      if (s < 1.6) { e = s / 1.6; s = 1.6; }      // conserva energía en puntos lejanos
      gl_PointSize = min(s, 56.0);
      vCol = color * e * uDim;
      gl_Position = projectionMatrix * mv;
    }`;
  const SPARK_FS = `
    varying vec3 vCol;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float d2 = dot(c,c) * 4.0;
      if (d2 > 1.0) discard;
      float core = exp(-d2 * 10.0);
      float halo = exp(-d2 * 3.0) * 0.32;
      // núcleo apenas más claro, nunca blanco puro: conserva el color
      vec3 col = vCol * (core + halo) + vCol * vCol * core * 0.35;
      gl_FragColor = vec4(col, 1.0);
    }`;

  class Sparks {
    constructor(scene, max, withReflection) {
      this.max = max; this.n = 0;
      const A = (k) => new Float32Array(max * k);
      this.p = A(3); this.v = A(3); this.c = A(3); this.c2 = A(3); this.tc = A(3);
      this.age = A(1); this.ttl = A(1); this.size = A(1); this.drag = A(1); this.grav = A(1);
      this.trail = A(1); this.tacc = A(1); this.param = A(1); this.seed = A(1);
      this.flags = new Uint8Array(max);
      this.gpuPos = A(3); this.gpuCol = A(3); this.gpuSize = A(1);

      const g = this.geo = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(this.gpuPos, 3).setUsage(THREE.DynamicDrawUsage);
      this.aCol = new THREE.BufferAttribute(this.gpuCol, 3).setUsage(THREE.DynamicDrawUsage);
      this.aSize = new THREE.BufferAttribute(this.gpuSize, 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
      g.setDrawRange(0, 0);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 150, 0), 5000);

      const mk = (dim) => new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 }, uDim: { value: dim } },
        vertexShader: SPARK_VS, fragmentShader: SPARK_FS,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      });
      this.mat = mk(1);
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false; this.points.renderOrder = 5;
      scene.add(this.points);
      if (withReflection) {
        this.rmat = mk(0.3);
        this.reflection = new THREE.Points(g, this.rmat);
        this.reflection.scale.y = -1; this.reflection.frustumCulled = false; this.reflection.renderOrder = 1;
        scene.add(this.reflection);
      }
      this.onCrackle = null; this.onSplit = null;
      this._crackleBudget = 0;
    }

    setScale(s) { this.mat.uniforms.uScale.value = s; if (this.rmat) this.rmat.uniforms.uScale.value = s; }
    free() { return this.max - this.n; }

    spawn(x, y, z, vx, vy, vz, col, ttl, size, drag, grav, flags, o) {
      if (this.n >= this.max) return -1;
      const i = this.n++, i3 = i * 3;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
      this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.c[i3] = col[0]; this.c[i3 + 1] = col[1]; this.c[i3 + 2] = col[2];
      const c2 = (o && o.c2) || col;
      this.c2[i3] = c2[0]; this.c2[i3 + 1] = c2[1]; this.c2[i3 + 2] = c2[2];
      const tc = (o && o.tc) || col;
      this.tc[i3] = tc[0]; this.tc[i3 + 1] = tc[1]; this.tc[i3 + 2] = tc[2];
      this.age[i] = 0; this.ttl[i] = ttl; this.size[i] = size;
      this.drag[i] = drag; this.grav[i] = grav; this.flags[i] = flags | 0;
      this.trail[i] = (o && o.trail) || 0; this.tacc[i] = Math.random();
      this.param[i] = (o && o.param) || 0; this.seed[i] = Math.random() * 100;
      return i;
    }

    _kill(i) {
      const j = --this.n;
      if (i === j) return;
      const i3 = i * 3, j3 = j * 3;
      for (let k = 0; k < 3; k++) {
        this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k];
        this.c[i3 + k] = this.c[j3 + k]; this.c2[i3 + k] = this.c2[j3 + k]; this.tc[i3 + k] = this.tc[j3 + k];
      }
      this.age[i] = this.age[j]; this.ttl[i] = this.ttl[j]; this.size[i] = this.size[j];
      this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.flags[i] = this.flags[j];
      this.trail[i] = this.trail[j]; this.tacc[i] = this.tacc[j]; this.param[i] = this.param[j]; this.seed[i] = this.seed[j];
    }

    update(dt, time) {
      const G = -9.8;
      // si el pool se llena, las estelas se vuelven más escasas (degradación suave)
      const load = this.n / this.max;
      const trailMul = load > 0.85 ? 0.25 : load > 0.65 ? 0.6 : 1;
      this._crackleBudget = Math.min(6, this._crackleBudget + dt * 40);
      for (let i = 0; i < this.n; i++) {
        const age = (this.age[i] += dt);
        const ttl = this.ttl[i];
        const fl = this.flags[i];
        const i3 = i * 3;
        if (age >= ttl) {
          if (fl & F.CRACKLE) this._crackle(i3);
          else if (fl & F.SPLIT) this._split(i3);
          this._kill(i); i--; continue;
        }
        const dr = Math.exp(-this.drag[i] * dt);
        this.v[i3] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr + G * this.grav[i] * dt; this.v[i3 + 2] *= dr;
        this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
        if (this.p[i3 + 1] < 0.3) { this._kill(i); i--; continue; }

        if ((fl & F.TRAIL) && this.trail[i] > 0) {
          this.tacc[i] += dt * this.trail[i] * trailMul;
          while (this.tacc[i] >= 1 && this.n < this.max - 4) {
            this.tacc[i] -= 1;
            const s = this.size[i];
            const tcol = [this.tc[i3], this.tc[i3 + 1], this.tc[i3 + 2]];
            this.spawn(this.p[i3] + rnd(-0.3, 0.3), this.p[i3 + 1] + rnd(-0.3, 0.3), this.p[i3 + 2] + rnd(-0.3, 0.3),
              this.v[i3] * 0.05 + rnd(-0.6, 0.6), this.v[i3 + 1] * 0.05 + rnd(-0.6, 0.3), this.v[i3 + 2] * 0.05 + rnd(-0.6, 0.6),
              tcol, rnd(0.35, 1.1) * (this.param[i] < 0 ? -this.param[i] : 1), s * rnd(0.35, 0.6), 1.5, 0.25, F.FLICKER);
          }
          if (this.tacc[i] > 3) this.tacc[i] = 0;
        }
      }

      // escribir a GPU
      const pos = this.gpuPos, col = this.gpuCol, siz = this.gpuSize;
      for (let i = 0; i < this.n; i++) {
        const i3 = i * 3, fl = this.flags[i];
        const a = this.age[i] / this.ttl[i];
        let b;
        if (fl & F.LATEFADE) b = a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3;
        else b = a < 0.05 ? a / 0.05 : a < 0.55 ? 1 - (a - 0.05) * 0.5 : 0.75 * Math.pow((1 - a) / 0.45, 1.4);
        if (fl & F.FLICKER) b *= 0.55 + 0.45 * Math.random();
        if (fl & F.STROBE) b *= Math.sin(time * this.param[i] + this.seed[i]) > 0.55 ? 1.4 : 0.04;
        if (fl & F.GLITTER) b *= Math.random() < 0.18 ? 1.6 : 0.35;
        const m = a * a;
        pos[i3] = this.p[i3]; pos[i3 + 1] = this.p[i3 + 1]; pos[i3 + 2] = this.p[i3 + 2];
        col[i3] = (this.c[i3] + (this.c2[i3] - this.c[i3]) * m) * b;
        col[i3 + 1] = (this.c[i3 + 1] + (this.c2[i3 + 1] - this.c[i3 + 1]) * m) * b;
        col[i3 + 2] = (this.c[i3 + 2] + (this.c2[i3 + 2] - this.c[i3 + 2]) * m) * b;
        siz[i] = this.size[i];
      }
      this.geo.setDrawRange(0, this.n);
      this.aPos.updateRange.count = this.n * 3; this.aPos.needsUpdate = true;
      this.aCol.updateRange.count = this.n * 3; this.aCol.needsUpdate = true;
      this.aSize.updateRange.count = this.n; this.aSize.needsUpdate = true;
    }

    _crackle(i3) {
      const x = this.p[i3], y = this.p[i3 + 1], z = this.p[i3 + 2];
      const k = 4 + (Math.random() * 4 | 0);
      for (let j = 0; j < k; j++) {
        // huevos de dragón: destellos breves y desfasados alrededor de la estrella
        this.spawn(x + rnd(-2.5, 2.5), y + rnd(-2.5, 2.5), z + rnd(-2.5, 2.5), rnd(-6, 6), rnd(-6, 6), rnd(-6, 6),
          [1.0, rnd(0.75, 0.92), rnd(0.4, 0.6)], rnd(0.07, 0.22), rnd(2.8, 4.2), 2, 0.1, F.FLICKER);
      }
      if (this.onCrackle && this._crackleBudget >= 1) { this._crackleBudget -= 1; this.onCrackle(x, y, z); }
    }

    _split(i3) {
      const x = this.p[i3], y = this.p[i3 + 1], z = this.p[i3 + 2];
      const col = [this.c2[i3], this.c2[i3 + 1], this.c2[i3 + 2]];
      const sp = 16, a0 = Math.random() * Math.PI;
      for (let j = 0; j < 4; j++) {
        const a = a0 + j * Math.PI / 2;
        this.spawn(x, y, z, Math.cos(a) * sp, rnd(-3, 5), Math.sin(a) * sp, col, rnd(0.9, 1.3), 1.4, 1.2, 0.4,
          F.TRAIL, { trail: 50, tc: [0.9, 0.55, 0.18] });
      }
      if (this.onSplit) this.onSplit(x, y, z);
    }
  }

  /* -------------------- Humo -------------------- */
  const SMOKE_VS = `
    attribute vec4 rgba; attribute float size;
    uniform float uScale; varying vec4 vC;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = min(size * uScale / max(1.0,-mv.z), 220.0);
      vC = rgba; gl_Position = projectionMatrix * mv;
    }`;
  const SMOKE_FS = `
    varying vec4 vC;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float d2 = dot(c,c)*4.0;
      if (d2 > 1.0) discard;
      float a = (1.0 - d2); a *= a;
      gl_FragColor = vec4(vC.rgb, vC.a * a);
    }`;

  class Smoke {
    constructor(scene, max) {
      this.max = max; this.n = 0;
      this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
      this.age = new Float32Array(max); this.ttl = new Float32Array(max);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
      this.gpuPos = new Float32Array(max * 3); this.gpuCol = new Float32Array(max * 4); this.gpuSize = new Float32Array(max);
      const g = this.geo = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(this.gpuPos, 3).setUsage(THREE.DynamicDrawUsage);
      this.aCol = new THREE.BufferAttribute(this.gpuCol, 4).setUsage(THREE.DynamicDrawUsage);
      this.aSize = new THREE.BufferAttribute(this.gpuSize, 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.aPos); g.setAttribute('rgba', this.aCol); g.setAttribute('size', this.aSize);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } }, vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS,
        transparent: true, depthWrite: false,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false; this.points.renderOrder = 4;
      scene.add(this.points);
      this.wind = [1.6, 0, -0.4];
    }
    setScale(s) { this.mat.uniforms.uScale.value = s; }
    spawn(x, y, z, vx, vy, vz, ttl, s0, s1, alpha) {
      if (this.n >= this.max) return;
      const i = this.n++, i3 = i * 3;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
      this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.age[i] = 0; this.ttl[i] = ttl; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    }
    update(dt, lights) {
      for (let i = 0; i < this.n; i++) {
        this.age[i] += dt;
        if (this.age[i] >= this.ttl[i]) {
          const j = --this.n;
          if (i !== j) {
            const i3 = i * 3, j3 = j * 3;
            for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; }
            this.age[i] = this.age[j]; this.ttl[i] = this.ttl[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.a0[i] = this.a0[j];
          }
          i--; continue;
        }
        const i3 = i * 3, dr = Math.exp(-1.2 * dt);
        this.v[i3] = this.v[i3] * dr + this.wind[0] * dt * 0.6;
        this.v[i3 + 1] = this.v[i3 + 1] * dr + 0.25 * dt;
        this.v[i3 + 2] = this.v[i3 + 2] * dr + this.wind[2] * dt * 0.6;
        this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      }
      // iluminación del humo por los destellos (CPU, barato)
      for (let i = 0; i < this.n; i++) {
        const i3 = i * 3, i4 = i * 4, a = this.age[i] / this.ttl[i];
        let r = 0.035, g = 0.04, b = 0.06;
        for (let k = 0; k < lights.length; k++) {
          const L = lights[k]; if (L.intensity < 0.02) continue;
          const dx = this.p[i3] - L.position.x, dy = this.p[i3 + 1] - L.position.y, dz = this.p[i3 + 2] - L.position.z;
          const f = L.intensity * 0.5 / (1 + (dx * dx + dy * dy + dz * dz) / 3500);
          r += L.color.r * f; g += L.color.g * f; b += L.color.b * f;
        }
        this.gpuPos[i3] = this.p[i3]; this.gpuPos[i3 + 1] = this.p[i3 + 1]; this.gpuPos[i3 + 2] = this.p[i3 + 2];
        this.gpuCol[i4] = Math.min(r, 0.7); this.gpuCol[i4 + 1] = Math.min(g, 0.7); this.gpuCol[i4 + 2] = Math.min(b, 0.7);
        this.gpuCol[i4 + 3] = this.a0[i] * Math.min(1, a * 8) * (1 - a);
        this.gpuSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(a);
      }
      this.geo.setDrawRange(0, this.n);
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
    }
  }

  /* -------------------- Patrones de estallido -------------------- */
  const TAU = Math.PI * 2;
  function sphereDirs(n) {
    // espiral de Fibonacci con jitter: distribución pareja, sin "bolas" amorfas
    const out = [], ga = Math.PI * (3 - Math.sqrt(5)), off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = i * ga + off;
      out.push([Math.cos(th) * r + rnd(-0.04, 0.04), y + rnd(-0.04, 0.04), Math.sin(th) * r + rnd(-0.04, 0.04)]);
    }
    return out;
  }
  function ringDirs(n, nx, ny, nz) {
    // base ortonormal del plano del anillo
    let ax = [1, 0, 0]; if (Math.abs(nx) > 0.9) ax = [0, 1, 0];
    let ux = ny * ax[2] - nz * ax[1], uy = nz * ax[0] - nx * ax[2], uz = nx * ax[1] - ny * ax[0];
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const out = [], off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = off + i / n * TAU, c = Math.cos(a), s = Math.sin(a);
      out.push([ux * c + vx * s, uy * c + vy * s, uz * c + vz * s]);
    }
    return out;
  }
  function randomTilt() {
    const a = rnd(0, TAU), t = rnd(0.25, 0.9);
    return [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)];
  }

  window.PyroFX = { Sparks, Smoke, F, sphereDirs, ringDirs, randomTilt, rnd };
})();
