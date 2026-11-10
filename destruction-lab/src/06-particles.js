/* ------------------------------------------------------------------ particles */
class Particles {
  constructor(max, additive) {
    this.max = max; this.next = 0; this.limit = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.orb = new Float32Array(max * 3); this.orbOn = new Uint8Array(max); this.bcol = new Float32Array(max * 3); this.ramp = additive;
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol);
    g.setAttribute('psize', this.aSize); g.setAttribute('palpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uSoft: { value: additive ? 1.6 : 1.0 }, uTex: { value: additive ? FIRE_ATLAS : SMOKE_ATLAS }, uTextured: { value: 1 }, uShade: { value: additive ? 0 : 1 }, uLight: { value: 1 }, uBoost: { value: 1 }, uTime: { value: 0 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale; uniform float uTime; varying vec3 vC; varying float vA; varying float vRot; varying float vVar;
        void main(){ vC = pcolor; vA = palpha;
          float h = fract(sin(float(gl_VertexID) * 12.9898 + 0.7) * 43758.5453);
          vRot = h * 6.2831 + uTime * (h - 0.5) * 0.9; vVar = floor(fract(h * 7.31) * 4.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uSoft, uTextured, uShade, uLight, uBoost; uniform sampler2D uTex; varying vec3 vC; varying float vA; varying float vRot; varying float vVar;
        void main(){
          if (uTextured < 0.5) { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vC, pow(1.0 - d, uSoft) * vA); return; }
          vec2 p = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot);
          vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y) * 1.38 + 0.5;
          if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
          vec4 t = texture2D(uTex, (q + vec2(mod(vVar, 2.0), floor(vVar / 2.0))) * 0.5);
          float a = t.a * vA; if (a < 0.008) discard;
          float shade = mix(1.0, mix(0.55, 1.15, 1.0 - gl_PointCoord.y) * uLight, uShade);
          gl_FragColor = vec4(vC * shade * (0.7 + 0.6 * t.r) * uBoost, a); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, alpha = 1, grow = 0, drag = 0.5, grav = 0) {
    const i = this.next; this.next = (i + 1) % this.limit;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = r; this.col[j + 1] = g; this.col[j + 2] = b;
    this.bcol[j] = r; this.bcol[j + 1] = g; this.bcol[j + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.a0[i] = alpha;
    this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav; this.orbOn[i] = 0;
  }
  // particle that spins around the tornado axis while rising
  // mode 1: around the tornado axis, rising. mode 2: spiralling into the black hole.
  emitOrbit(r, a, w, vy, life, size, cr, cg, cb, alpha, mode = 1) {
    const i = this.next;
    this.emit(0, mode === 2 ? vy : 0.5, 0, 0, mode === 2 ? 0 : vy, 0, life, size, cr, cg, cb, alpha, mode === 2 ? 0 : 0.8, 0, 0);
    this.orbOn[i] = mode; this.orb[i * 3] = r; this.orb[i * 3 + 1] = a; this.orb[i * 3 + 2] = w;
  }
  setLimit(n) { this.limit = Math.max(50, Math.min(this.max, n)); if (this.next >= this.limit) this.next = 0; for (let i = this.limit; i < this.max; i++) { this.life[i] = 0; this.alpha[i] = 0; } }
  clear() { this.life.fill(0); this.alpha.fill(0); }
  update(dt) {
    let any = 0;
    for (let i = 0; i < this.limit; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any++; } continue; }
      any++;
      this.life[i] -= dt;
      const j = i * 3, k = Math.max(0, 1 - this.drag[i] * dt);
      if (this.orbOn[i] === 2) {
        const f = Math.max(0, this.life[i] / this.maxLife[i]);
        const a = (this.orb[j + 1] += this.orb[j + 2] * dt * (1 + 4 * (1 - f)));
        const r = this.orb[j] * Math.pow(f, 0.8) + blackhole.rh * 0.9;
        this.pos[j] = blackhole.P.x + Math.cos(a) * r; this.pos[j + 2] = blackhole.P.z + Math.sin(a) * r;
        this.pos[j + 1] = blackhole.P.y + this.vel[j + 1] * f + Math.sin(a * 2) * r * 0.06;
        if (blackhole.phase === 'idle') this.life[i] = 0;
      } else if (this.orbOn[i]) {
        const y = (this.pos[j + 1] += this.vel[j + 1] * dt);
        const a = (this.orb[j + 1] += this.orb[j + 2] * dt);
        const r = this.orb[j] * (0.3 + Math.min(1.7, y / 26));
        this.pos[j] = funnel.position.x + Math.cos(a) * r; this.pos[j + 2] = funnel.position.z + Math.sin(a) * r;
        if (tornado.fade < 0.02) this.life[i] = Math.min(this.life[i], 0.3);
      } else {
      this.vel[j] *= k; this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt; this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.1) { this.pos[j + 1] = 0.1; this.vel[j + 1] *= -0.25; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; }
      }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.life[i] <= 0 ? 0 : this.a0[i] * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 12 + 0.15);
      if (this.ramp && this.hd) { // fire cools down: white-yellow → orange → deep red
        const k = Math.pow(Math.max(0, t), 0.7), br = 0.45 + 0.95 * t;
        this.col[j] = this.bcol[j] * br; this.col[j + 1] = this.bcol[j + 1] * (0.3 + 0.7 * k) * br; this.col[j + 2] = this.bcol[j + 2] * (0.08 + 0.92 * k * k) * br;
      }
    }
    this.mat.uniforms.uTime.value += dt;
    if (any) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true; }
  }
}
// noise puffs for smoke and flames: a 2×2 atlas of soft, lumpy blobs
function puffAtlas(fire) {
  const S = 128, c = mkCanvas(S * 2, S * 2), g = c.getContext('2d'), img = g.createImageData(S * 2, S * 2);
  for (let k = 0; k < 4; k++) {
    const n = noiseCanvas(S, S, 5, 101 + k * 13).getContext('2d').getImageData(0, 0, S, S).data;
    const ox = (k % 2) * S, oy = Math.floor(k / 2) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), d = Math.hypot(dx, dy);
      const nv = n[(y * S + x) * 4] / 255;
      let a = Math.max(0, 1 - d * (0.75 + 0.6 * (1 - nv)));
      a = Math.pow(a, fire ? 1.4 : 0.9) * (fire ? 1.2 : 0.95) * (0.6 + 0.8 * nv);
      const v = Math.min(255, (0.55 + 0.6 * nv) * 255);
      img.data.set([v, v, v, Math.min(255, a * 255)], ((oy + y) * S * 2 + ox + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; return t;
}
const SMOKE_ATLAS = puffAtlas(false), FIRE_ATLAS = puffAtlas(true);
const dust = new Particles(3000, false);
const fire = new Particles(1200, true);
// sparks: short glowing streaks stretched along their velocity
class Sparks {
  constructor(max) {
    this.max = max; this.next = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max);
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.aC = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('color', this.aC);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false; scene.add(this.lines);
  }
  emit(x, y, z, vx, vy, vz, life) {
    if (!gfx.enhanced) return;
    const i = this.next; this.next = (i + 1) % this.max;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.life[i] = life; this.ml[i] = life;
  }
  clear() { this.life.fill(0); this.col.fill(0); this.aC.needsUpdate = true; }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const j = i * 3, k = i * 6;
      if (this.life[i] <= 0) { if (this.col[k] !== 0) { this.col.fill(0, k, k + 6); } continue; }
      this.life[i] -= dt;
      this.v[j + 1] -= 9.8 * dt; this.v[j] *= 0.985; this.v[j + 2] *= 0.985;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.05) { this.p[j + 1] = 0.05; this.v[j + 1] *= -0.35; this.v[j] *= 0.5; this.v[j + 2] *= 0.5; }
      const L = 0.045;
      this.pos.set([this.p[j], this.p[j + 1], this.p[j + 2], this.p[j] - this.v[j] * L, this.p[j + 1] - this.v[j + 1] * L, this.p[j + 2] - this.v[j + 2] * L], k);
      const t = Math.max(0, this.life[i] / this.ml[i]), b = 2.4 * t;
      this.col.set([b, b * (0.5 + 0.4 * t), b * 0.2 * t, b * 0.6, b * 0.25 * t, 0], k);
    }
    this.aP.needsUpdate = true; this.aC.needsUpdate = true;
  }
}
const sparks = new Sparks(700);
function applyFxLimit() { dust.setLimit(settings.maxFx); fire.setLimit(Math.round(settings.maxFx * 0.4)); }
const rnd = (a, b) => a + Math.random() * (b - a);

