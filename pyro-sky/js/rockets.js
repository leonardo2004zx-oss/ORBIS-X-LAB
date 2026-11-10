/* PYRO SKY SIMULATOR — catálogo de cohetes
 * Cada tipo define: aspecto del cohete, estela de ascenso, patrón de estallido y perfil sonoro.
 */
(function () {
  'use strict';
  const { F, sphereDirs, ringDirs, randomTilt, rnd } = window.PyroFX;
  const TAU = Math.PI * 2;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const jit = (c, j) => [Math.min(1, c[0] * rnd(1 - j, 1 + j)), Math.min(1, c[1] * rnd(1 - j, 1 + j)), Math.min(1, c[2] * rnd(1 - j, 1 + j))];

  // utilidad: lanzar estrellas en direcciones dadas
  function emitDirs(g, pos, dirs, speed, col, opt) {
    const { fx } = g, Q = g.quality;
    for (const d of dirs) {
      const s = speed * rnd(1 - (opt.sj || 0.06), 1 + (opt.sj || 0.06));
      fx.spawn(pos.x, pos.y, pos.z, d[0] * s + (opt.vx || 0), d[1] * s + (opt.vy || 0), d[2] * s + (opt.vz || 0),
        typeof col === 'function' ? col(d) : jit(col, 0.08), opt.ttl * rnd(0.85, 1.15), opt.size, opt.drag, opt.grav,
        opt.flags || 0, { c2: opt.c2, tc: opt.tc, trail: (opt.trail || 0) * Q.trail, param: opt.param });
    }
  }
  const N = (g, n) => Math.max(12, Math.round(n * g.quality.density));

  const CATALOG = [
    /* ------------------------------------------------------------ */
    {
      id: 'peonia', name: 'Peonía Carmesí', short: 'Peonía',
      caliber: 75, height: 165, sound: 'Siseo · estampido seco',
      desc: 'Esfera perfecta de estrellas rojas que viran a naranja, con corazón dorado.',
      swatch: ['#ff2a1c', '#ff8a2a', '#ffc35a'],
      look: { body: 0xb3121b, stripe: 0xf2c14e, nose: 0xe9e2d0, len: 2.2, r: 0.16, fins: 3, stick: true },
      fuse: 1.1, ascentTime: 2.3,
      tail: { rate: 220, col: [1.0, 0.55, 0.16], size: 0.9, spread: 2.2, life: 0.55, smoke: 0.7 },
      flash: [1.0, 0.22, 0.1],
      audio: {
        fusePitch: 1.0,
        launch: { thump: 75, bass: 0.55, noise: 0.75, f0: 500, f1: 2600, len: 0.55, echo: 0.12 },
        ascent: { kind: 'hiss', f0: 3400, f1: 1500, gain: 0.46 },
        burst: { crack: 1.0, crackHz: 1900, bodyHz: 3800, body: 0.65, bodyGain: 0.9, sub: 50, bass: 1.0, subLen: 0.55,
          rumble: 1.8, rumbleGain: 0.35, reverb: 0.8, echo: 0.38, tail: { kind: 'sizzle', gain: 0.35, delay: 0.12 } },
      },
      burst(g, pos, sc) {
        const red = [1.0, 0.1, 0.06], orange = [1.0, 0.42, 0.06];
        emitDirs(g, pos, sphereDirs(N(g, 260)), 66 * sc, red, { ttl: 2.4, size: 2.4, drag: 1.25, grav: 0.32, c2: orange, flags: F.FLICKER | F.TRAIL, trail: 16, tc: [0.9, 0.3, 0.08], sj: 0.05 });
        emitDirs(g, pos, sphereDirs(N(g, 70)), 24 * sc, [1.0, 0.68, 0.22], { ttl: 1.2, size: 1.8, drag: 1.6, grav: 0.2, c2: [1, 0.35, 0.05], flags: F.FLICKER });
        g.world.flash(pos, [1, 0.25, 0.1], 5.5 * sc, 2.4);
        g.smokeCloud(pos, 70 * sc, 14);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'sauce', name: 'Sauce Dorado', short: 'Sauce',
      caliber: 100, height: 185, sound: 'Golpe sordo · lluvia de purpurina',
      desc: 'Cientos de hilos dorados que cuelgan y caen lentamente como un sauce llorón.',
      swatch: ['#ffb43c', '#d9862a', '#7a4a14'],
      look: { body: 0x2a2a30, stripe: 0xd8a640, nose: 0xd8a640, len: 2.8, r: 0.22, fins: 4, stick: true },
      fuse: 1.4, ascentTime: 2.8,
      tail: { rate: 320, col: [1.0, 0.62, 0.22], size: 1.2, spread: 1.4, life: 1.1, smoke: 1, glitter: true },
      flash: [1.0, 0.62, 0.25],
      audio: {
        fusePitch: 0.85, fuseGain: 1.2,
        launch: { thump: 55, bass: 0.9, noise: 0.55, f0: 300, f1: 1500, len: 0.8, echo: 0.2, brown: true },
        ascent: { kind: 'crackle', f0: 2400, f1: 1700, gain: 0.26 },
        burst: { crack: 0.35, crackHz: 900, bodyHz: 1500, body: 1.1, bodyGain: 1.0, sub: 38, bass: 1.25, subLen: 1.0,
          rumble: 3.6, rumbleGain: 0.6, reverb: 1.0, echo: 0.55, tail: { kind: 'glitter', gain: 0.6, delay: 0.35, rate: 0.9 } },
      },
      burst(g, pos, sc) {
        const gold = [1.0, 0.6, 0.2];
        emitDirs(g, pos, sphereDirs(N(g, 200)), 46 * sc, gold, {
          ttl: 4.2, size: 1.7, drag: 1.35, grav: 0.55, c2: [0.75, 0.32, 0.06], flags: F.TRAIL | F.LATEFADE | F.GLITTER,
          trail: 34, tc: [0.85, 0.46, 0.12], param: -2.4, sj: 0.12,
        });
        g.world.flash(pos, [1, 0.6, 0.22], 4.5 * sc, 1.2);
        g.smokeCloud(pos, 60 * sc, 12);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'halo', name: 'Halo Silbador', short: 'Halo',
      caliber: 60, height: 175, sound: 'Silbido agudo · chasquido con eco',
      desc: 'Sube gritando y abre dos anillos cruzados cian y violeta.',
      swatch: ['#2bd0ff', '#9b4dff', '#e8f6ff'],
      look: { body: 0x1b4fd8, stripe: 0xe7f0ff, nose: 0x9b4dff, len: 1.7, r: 0.12, fins: 4, stick: false },
      fuse: 0.75, ascentTime: 2.0,
      tail: { rate: 260, col: [0.55, 0.72, 1.0], size: 0.7, spread: 0.6, life: 0.3, smoke: 0.5 },
      flash: [0.3, 0.6, 1.0],
      audio: {
        fusePitch: 1.25, fuseGain: 0.8,
        launch: { thump: 110, bass: 0.3, noise: 0.5, f0: 1200, f1: 4000, len: 0.35, echo: 0.1 },
        ascent: { kind: 'whistle', f0: 950, f1: 3300, gain: 0.34 },
        burst: { crack: 1.35, crackHz: 3200, bodyHz: 6500, body: 0.35, bodyGain: 0.65, sub: 72, bass: 0.55, subLen: 0.3,
          rumble: 0.9, rumbleGain: 0.18, reverb: 0.7, echo: 0.7, tail: { kind: 'crackleFine', gain: 0.22, delay: 0.25, rate: 1.3 } },
      },
      burst(g, pos, sc) {
        const n1 = randomTilt();
        const n2 = [-n1[2], n1[1] * 0.2 + 0.4, n1[0]];
        const l2 = Math.hypot(...n2); n2[0] /= l2; n2[1] /= l2; n2[2] /= l2;
        const cyan = [0.12, 0.78, 1.0], violet = [0.62, 0.22, 1.0];
        emitDirs(g, pos, ringDirs(N(g, 170), ...n1), 64 * sc, cyan, { ttl: 2.3, size: 2.5, drag: 1.3, grav: 0.18, c2: [0.1, 0.35, 1.0], sj: 0.02, trail: 10, flags: F.TRAIL });
        emitDirs(g, pos, ringDirs(N(g, 150), ...n2), 50 * sc, violet, { ttl: 2.3, size: 2.4, drag: 1.3, grav: 0.18, c2: [0.95, 0.25, 0.7], sj: 0.02, trail: 10, flags: F.TRAIL });
        emitDirs(g, pos, sphereDirs(N(g, 40)), 12 * sc, [0.7, 0.85, 1.0], { ttl: 0.9, size: 1.5, drag: 2, grav: 0.1, flags: F.FLICKER });
        g.world.flash(pos, [0.35, 0.55, 1.0], 4 * sc, 3);
        g.smokeCloud(pos, 45 * sc, 8);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'crisantemo', name: 'Crisantemo Crepitante', short: 'Crepitante',
      caliber: 90, height: 160, sound: 'Chisporroteo · ráfaga de crujidos',
      desc: 'Pétalos verde lima que, al apagarse, revientan en cientos de huevos de dragón.',
      swatch: ['#b8ff3a', '#ffe08a', '#e6e2c8'],
      look: { body: 0x2f6b1f, stripe: 0xf4e9b0, nose: 0xb8ff3a, len: 2.3, r: 0.18, fins: 3, stick: true },
      fuse: 1.0, ascentTime: 2.2,
      tail: { rate: 240, col: [0.85, 1.0, 0.35], size: 0.8, spread: 1.8, life: 0.45, smoke: 0.8 },
      flash: [0.6, 1.0, 0.3],
      audio: {
        fusePitch: 1.1,
        launch: { thump: 85, bass: 0.5, noise: 0.7, f0: 700, f1: 3200, len: 0.5, echo: 0.12 },
        ascent: { kind: 'hiss', f0: 6200, f1: 4200, gain: 0.34 },
        burst: { crack: 0.8, crackHz: 1500, bodyHz: 2600, body: 0.6, bodyGain: 0.85, sub: 46, bass: 0.9, subLen: 0.6,
          rumble: 1.6, rumbleGain: 0.3, reverb: 0.75, echo: 0.3, tail: { kind: 'crackle', gain: 0.9, delay: 1.25, rate: 1.0, reverb: 0.7 } },
      },
      burst(g, pos, sc) {
        const lime = [0.62, 1.0, 0.16];
        emitDirs(g, pos, sphereDirs(N(g, 170)), 52 * sc, lime, { ttl: 1.35, size: 2.0, drag: 1.3, grav: 0.3, c2: [1.0, 0.9, 0.45], flags: F.TRAIL | F.CRACKLE, trail: 22, tc: [0.8, 0.85, 0.3], sj: 0.12 });
        emitDirs(g, pos, sphereDirs(N(g, 60)), 22 * sc, [1.0, 0.85, 0.4], { ttl: 1.0, size: 1.6, drag: 1.8, grav: 0.2, flags: F.GLITTER });
        g.world.flash(pos, [0.55, 1.0, 0.25], 4.5 * sc, 2.4);
        g.after(1.3, () => g.world.flash(pos, [1.0, 0.85, 0.5], 2.5 * sc, 5));
        g.smokeCloud(pos, 60 * sc, 12);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'palmera', name: 'Palmera Titán', short: 'Palmera',
      caliber: 150, height: 210, sound: 'Rugido grave · trueno que retumba',
      desc: 'Carcasa pesada: sube rugiendo con cola de cometa y abre nueve hojas de palmera.',
      swatch: ['#ff9f2e', '#ff4d1a', '#ffd27a'],
      look: { body: 0x5a1a10, stripe: 0xff9f2e, nose: 0x1a1a1f, len: 3.4, r: 0.3, fins: 4, stick: true },
      fuse: 1.6, ascentTime: 3.2,
      tail: { rate: 420, col: [1.0, 0.58, 0.18], size: 1.6, spread: 1.2, life: 0.9, smoke: 1.4 },
      flash: [1.0, 0.5, 0.15],
      audio: {
        fusePitch: 0.75, fuseGain: 1.3,
        launch: { thump: 42, bass: 1.3, noise: 0.9, f0: 180, f1: 900, len: 1.1, echo: 0.35, brown: true },
        ascent: { kind: 'roar', f0: 700, f1: 380, gain: 0.55 },
        burst: { crack: 0.7, crackHz: 1100, bodyHz: 2200, body: 1.3, bodyGain: 1.15, sub: 30, bass: 1.6, subLen: 1.3,
          rumble: 5.0, rumbleGain: 0.85, reverb: 1.0, echo: 0.8, tail: { kind: 'sizzle', gain: 0.45, delay: 0.3, rate: 0.7 } },
      },
      burst(g, pos, sc) {
        const arms = 9, a0 = Math.random() * TAU;
        for (let k = 0; k < arms; k++) {
          const a = a0 + k / arms * TAU, el = rnd(0.15, 0.55);
          const d = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
          // cada hoja: un cometa grueso + chispas que lo siguen
          const sp = 78 * sc;
          g.fx.spawn(pos.x, pos.y, pos.z, d[0] * sp, d[1] * sp, d[2] * sp, [1.0, 0.6, 0.2], 2.8, 4.2, 1.05, 0.5,
            F.TRAIL | F.LATEFADE, { trail: 120 * g.quality.trail, tc: [1.0, 0.5, 0.12], c2: [1.0, 0.3, 0.05], param: -1.8 });
          for (let j = 0; j < Math.round(10 * g.quality.density); j++) {
            const s2 = sp * rnd(0.55, 0.95);
            g.fx.spawn(pos.x, pos.y, pos.z, d[0] * s2 + rnd(-4, 4), d[1] * s2 + rnd(-4, 4), d[2] * s2 + rnd(-4, 4), [1.0, 0.45, 0.12], rnd(1.6, 2.4), 1.6, 1.1, 0.5, F.TRAIL | F.FLICKER, { trail: 18 * g.quality.trail, tc: [0.9, 0.35, 0.08] });
          }
        }
        emitDirs(g, pos, sphereDirs(N(g, 50)), 18 * sc, [1.0, 0.82, 0.45], { ttl: 1.2, size: 2, drag: 1.5, grav: 0.2, flags: F.GLITTER });
        g.world.flash(pos, [1.0, 0.5, 0.15], 8 * sc, 1.6);
        g.smokeCloud(pos, 90 * sc, 20);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'saturno', name: 'Saturno Estrobo', short: 'Saturno',
      caliber: 100, height: 180, sound: 'Zumbido eléctrico · tic-tic estroboscópico',
      desc: 'Sube zumbando; abre un planeta magenta con anillo turquesa y queda titilando.',
      swatch: ['#ff3fb4', '#2ef2c8', '#d6ffe9'],
      look: { body: 0x3b1e5a, stripe: 0x2ef2c8, nose: 0xff3fb4, len: 2.4, r: 0.2, fins: 6, stick: false },
      fuse: 1.2, ascentTime: 2.7,
      tail: { rate: 200, col: [1.0, 0.35, 0.75], size: 0.9, spread: 3.2, life: 0.5, smoke: 0.7 },
      flash: [0.9, 0.3, 0.8],
      audio: {
        fusePitch: 0.95,
        launch: { thump: 65, bass: 0.7, noise: 0.6, f0: 400, f1: 1800, len: 0.6, echo: 0.15 },
        ascent: { kind: 'hum', f0: 120, f1: 230, gain: 0.32, rate: 26 },
        burst: { crack: 0.9, crackHz: 2200, bodyHz: 3000, body: 0.8, bodyGain: 0.9, sub: 56, bass: 1.0, subLen: 0.7,
          rumble: 2.2, rumbleGain: 0.4, reverb: 0.9, echo: 0.45, tail: { kind: 'strobe', gain: 0.55, delay: 0.7 } },
      },
      burst(g, pos, sc) {
        const mag = [1.0, 0.18, 0.62], teal = [0.14, 0.95, 0.75];
        emitDirs(g, pos, sphereDirs(N(g, 180)), 34 * sc, mag, { ttl: 2.0, size: 2.2, drag: 1.4, grav: 0.15, c2: [0.7, 0.1, 0.9], flags: F.FLICKER, sj: 0.03 });
        const n = randomTilt();
        emitDirs(g, pos, ringDirs(N(g, 160), ...n), 70 * sc, teal, { ttl: 2.1, size: 2.3, drag: 1.25, grav: 0.12, c2: [0.1, 0.6, 1.0], flags: F.TRAIL, trail: 12, sj: 0.015 });
        // estrellas estroboscópicas que quedan titilando
        g.after(0.55, () => emitDirs(g, pos, sphereDirs(N(g, 120)), 40 * sc, [0.75, 1.0, 0.85], { ttl: 3.3, size: 2.4, drag: 1.6, grav: 0.35, flags: F.STROBE, param: rnd(28, 40), sj: 0.35 }));
        g.world.flash(pos, [0.9, 0.25, 0.8], 5 * sc, 2.2);
        g.smokeCloud(pos, 65 * sc, 12);
      },
    },
  ];

  /* ---------- Modelo 3D del cohete ---------- */
  const geoCache = {};
  function buildMesh(look) {
    const grp = new THREE.Group();
    const std = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, emissive: c, emissiveIntensity: e || 0.12 });
    const L = look.len, R = look.r;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 14), std(look.body)); grp.add(body);
    for (let k = 0; k < 2; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, L * 0.08, 14), std(look.stripe, 0.25));
      s.position.y = L * (0.15 + k * 0.22); grp.add(s);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(R * 1.05, R * 3.2, 14), std(look.nose, 0.2)); nose.position.y = L / 2 + R * 1.6; grp.add(nose);
    const finMat = std(look.stripe, 0.2);
    for (let k = 0; k < look.fins; k++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, L * 0.25, R * 2.4), finMat);
      const a = k / look.fins * TAU; f.position.set(Math.cos(a) * R * 1.4, -L / 2 + L * 0.12, Math.sin(a) * R * 1.4); f.rotation.y = -a; grp.add(f);
    }
    if (look.stick) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L * 2.2, 5), std(0x6b5233, 0.05));
      st.position.set(R * 1.3, -L * 0.9, 0); grp.add(st);
    }
    const scale = 1.6; grp.scale.setScalar(scale);
    grp.userData.base = L / 2 * scale + (look.stick ? L * 1.6 : 0);
    return grp;
  }

  /* ---------- Cohete en vuelo ---------- */
  class Rocket {
    constructor(g, type, pad, scale) {
      this.g = g; this.type = type; this.pad = pad.clone(); this.sc = scale || rnd(0.9, 1.12);
      this.t = 0; this.state = 'fuse';
      this.fuseT = type.fuse * rnd(0.9, 1.1);
      this.T = type.ascentTime * rnd(0.92, 1.08);
      this.H = type.height * rnd(0.9, 1.1) * (0.9 + 0.1 * this.sc);
      this.drift = [rnd(-12, 12), rnd(-8, 8)];
      this.mesh = buildMesh(type.look);
      this.mesh.position.copy(this.pad); this.mesh.position.y += this.mesh.userData.base;
      g.world.scene.add(this.mesh);
      this.pos = this.mesh.position.clone();
      this.prev = this.pos.clone();
      this.dir = new THREE.Vector3(0, 1, 0);
      this.emitAcc = 0; this.smokeAcc = 0;
      g.audio.fuse(this.pos, type.audio, this.fuseT / g.timeScaleNow());
    }

    update(dt) {
      const g = this.g, ty = this.type;
      this.t += dt;
      if (this.state === 'fuse') {
        // chispas de la mecha
        const base = this.pad;
        const n = dt * 90 * g.quality.trail;
        for (let i = 0; i < n; i++) g.fx.spawn(base.x + rnd(-0.2, 0.2), base.y + 0.6, base.z + rnd(-0.2, 0.2),
          rnd(-3, 3), rnd(1, 6), rnd(-3, 3), [1, rnd(0.45, 0.7), 0.15], rnd(0.15, 0.45), rnd(0.35, 0.6), 2, 0.6, F.FLICKER);
        g.world.padGlow(base, 1.2, [1, 0.55, 0.2]);
        if (this.t >= this.fuseT) this._liftoff();
        return;
      }
      if (this.state !== 'up') return;
      const u = Math.min(1, (this.t - this.fuseT) / this.T);
      const e = 1 - Math.pow(1 - u, 1.75);
      this.prev.copy(this.pos);
      this.pos.set(this.pad.x + this.drift[0] * u * u, this.pad.y + this.mesh.userData.base + this.H * e, this.pad.z + this.drift[1] * u * u);
      this.dir.subVectors(this.pos, this.prev);
      const sp = this.dir.length() / Math.max(dt, 1e-4);
      if (this.dir.lengthSq() > 1e-8) this.dir.normalize();
      this.mesh.position.copy(this.pos);
      this.mesh.quaternion.setFromUnitVectors(UP, this.dir);

      // estela: interpolada a lo largo del tramo recorrido (sin huecos aunque vaya rápido)
      const T = ty.tail, thrust = Math.max(0.25, 1 - u * 0.7);
      this.emitAcc += dt * T.rate * g.quality.trail * thrust;
      const n = Math.floor(this.emitAcc); this.emitAcc -= n;
      const back = this.mesh.userData.base;
      for (let i = 0; i < n; i++) {
        const f = Math.random();
        const x = this.prev.x + (this.pos.x - this.prev.x) * f - this.dir.x * back;
        const y = this.prev.y + (this.pos.y - this.prev.y) * f - this.dir.y * back;
        const z = this.prev.z + (this.pos.z - this.prev.z) * f - this.dir.z * back;
        const s = T.spread;
        g.fx.spawn(x, y, z, -this.dir.x * sp * 0.15 + rnd(-s, s), -this.dir.y * sp * 0.15 + rnd(-s, s), -this.dir.z * sp * 0.15 + rnd(-s, s),
          jit(T.col, 0.1), T.life * rnd(0.6, 1.3), T.size * rnd(0.7, 1.2), 2.2, 0.35, T.glitter ? F.GLITTER : F.FLICKER);
      }
      this.smokeAcc += dt * 14 * T.smoke * g.quality.smoke;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        g.smoke.spawn(this.pos.x - this.dir.x * back, this.pos.y - this.dir.y * back, this.pos.z, rnd(-0.6, 0.6), rnd(-0.5, 0.5), rnd(-0.6, 0.6), rnd(3, 6), 1.5, rnd(5, 9), 0.22);
      }
      g.audio.updateAscent(this.voice, u, this.pos);
      if (u < 0.15) g.world.padGlow(this.pad, 3 * (1 - u / 0.15), T.col);
      if (u >= 1) this._burst();
    }

    _liftoff() {
      const g = this.g;
      this.state = 'up'; this.t = this.fuseT;
      g.audio.launch(this.pos, this.type.audio);
      this.voice = g.audio.ascent(this.pos, this.type.audio);
      g.world.padGlow(this.pad, 4, this.type.tail.col);
      for (let i = 0; i < 18 * this.g.quality.smoke; i++) g.smoke.spawn(this.pad.x, this.pad.y + 1, this.pad.z, rnd(-5, 5), rnd(0, 3), rnd(-5, 5), rnd(3, 6), 2, rnd(8, 14), 0.28);
      for (let i = 0; i < 60; i++) g.fx.spawn(this.pad.x, this.pad.y + 0.5, this.pad.z, rnd(-9, 9), rnd(0, 6), rnd(-9, 9), this.type.tail.col, rnd(0.2, 0.6), 0.6, 2.4, 0.8, F.FLICKER);
      g.emit('liftoff', this);
    }

    _burst() {
      const g = this.g;
      this.state = 'done';
      g.world.scene.remove(this.mesh);
      g.audio.stopAscent(this.voice, true);
      g.audio.burst(this.pos, this.type.audio, this.sc);
      this.type.burst(g, this.pos.clone(), this.sc);
      g.emit('burst', this);
    }

    dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.g.audio.stopAscent(this.voice, true); }
  }
  const UP = new THREE.Vector3(0, 1, 0);

  window.PyroRockets = { CATALOG, Rocket, buildMesh, emitDirs, N, jit, mixc };
})();
