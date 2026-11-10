/* ------------------------------------------------------------------ particles */
class Particles {
  constructor(max, additive) {
    this.max = max; this.next = 0; this.limit = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.orb = new Float32Array(max * 3); this.orbOn = new Uint8Array(max);
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
      uniforms: { uScale: { value: 400 }, uSoft: { value: additive ? 1.6 : 1.0 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uSoft; varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, uSoft) * vA; gl_FragColor = vec4(vC, a); }`,
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
    }
    if (any) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true; }
  }
}
const dust = new Particles(3000, false);
const fire = new Particles(1200, true);
function applyFxLimit() { dust.setLimit(settings.maxFx); fire.setLimit(Math.round(settings.maxFx * 0.4)); }
const rnd = (a, b) => a + Math.random() * (b - a);

