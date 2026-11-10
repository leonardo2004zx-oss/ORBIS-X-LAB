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
    /* ================== NUEVA GENERACIÓN ================== */
    {
      id: 'fenix', name: 'Espiral Fénix', short: 'Fénix', tag: 'NUEVO',
      caliber: 80, height: 175, sound: 'Torbellino que gira de oído a oído',
      desc: 'Sube en sacacorchos dibujando una hélice de fuego y abre una galaxia espiral.',
      swatch: ['#ffcc33', '#ff5a1f', '#c21a3a'],
      look: { body: 0xc21a3a, stripe: 0xffcc33, nose: 0xff5a1f, len: 2.0, r: 0.17, fins: 4, stick: false },
      fuse: 1.0, ascentTime: 3.0, path: 'helix', turns: 5, helixR: 9,
      tail: { rate: 380, col: [1.0, 0.5, 0.14], size: 1.0, spread: 0.8, life: 1.0, smoke: 0.6 },
      audio: {
        fusePitch: 1.05,
        launch: { thump: 80, bass: 0.55, noise: 0.7, f0: 600, f1: 2400, len: 0.5, echo: 0.12 },
        ascent: { kind: 'tourbillon', f0: 1300, f1: 2600, gain: 0.8, spin: 5 / 3.0 },
        burst: { crack: 0.9, crackHz: 1600, bodyHz: 3000, body: 0.8, bodyGain: 0.95, sub: 44, bass: 1.1, subLen: 0.7,
          rumble: 2.5, rumbleGain: 0.45, reverb: 0.85, echo: 0.6, tail: { kind: 'sizzle', gain: 0.4, delay: 0.1 } },
      },
      burst(g, pos, sc) {
        const tilt = randomTilt(), arms = 4, per = Math.round(34 * g.quality.density), a0 = Math.random() * TAU;
        // base del plano del disco
        const n = tilt, ux = [1, 0, 0];
        let bx = [n[1] * ux[2] - n[2] * ux[1], n[2] * ux[0] - n[0] * ux[2], n[0] * ux[1] - n[1] * ux[0]];
        const bl = Math.hypot(...bx); bx = bx.map(v => v / bl);
        const by = [n[1] * bx[2] - n[2] * bx[1], n[2] * bx[0] - n[0] * bx[2], n[0] * bx[1] - n[1] * bx[0]];
        for (let k = 0; k < arms; k++) for (let j = 0; j < per; j++) {
          const f = j / per, a = a0 + k / arms * TAU + f * 2.6, sp = (12 + f * 58) * sc;
          const c = Math.cos(a), si = Math.sin(a);
          const d = [bx[0] * c + by[0] * si, bx[1] * c + by[1] * si, bx[2] * c + by[2] * si];
          g.fx.spawn(pos.x, pos.y, pos.z, d[0] * sp, d[1] * sp, d[2] * sp, mixc([1.0, 0.85, 0.3], [0.95, 0.12, 0.2], f), 2.3 * rnd(0.9, 1.1), 2.0, 1.25, 0.18,
            F.TRAIL | F.FLICKER, { trail: 14 * g.quality.trail, tc: [1.0, 0.4, 0.1], c2: [1, 0.3, 0.05] });
        }
        emitDirs(g, pos, sphereDirs(N(g, 50)), 10 * sc, [1.0, 0.9, 0.5], { ttl: 1.6, size: 2.2, drag: 1.4, grav: 0.1, flags: F.GLITTER });
        g.world.flash(pos, [1, 0.45, 0.15], 5.5 * sc, 2.2);
        g.smokeCloud(pos, 70 * sc, 12);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'medusa', name: 'Medusa Eléctrica', short: 'Medusa', tag: 'NUEVO',
      caliber: 100, height: 185, sound: 'Láser FM · arcos eléctricos',
      desc: 'Una campana azul eléctrica con tentáculos violeta que flotan hacia abajo.',
      swatch: ['#3aa0ff', '#a24dff', '#7ff0ff'],
      look: { body: 0x0f2a55, stripe: 0x7ff0ff, nose: 0xa24dff, len: 2.4, r: 0.21, fins: 3, stick: false },
      fuse: 1.2, ascentTime: 2.6,
      tail: { rate: 230, col: [0.35, 0.7, 1.0], size: 0.85, spread: 1.6, life: 0.5, smoke: 0.6 },
      audio: {
        fusePitch: 0.9,
        launch: { thump: 60, bass: 0.6, noise: 0.5, f0: 300, f1: 1400, len: 0.6, echo: 0.12 },
        ascent: { kind: 'zap', f0: 320, f1: 1500, gain: 0.22 },
        burst: { crack: 0.25, crackHz: 600, bodyHz: 900, body: 0.9, bodyGain: 1.0, sub: 42, bass: 1.15, subLen: 0.8,
          rumble: 2.0, rumbleGain: 0.35, reverb: 1.0, echo: 0.3, tail: { kind: 'zap', gain: 0.55, delay: 0.25 } },
      },
      burst(g, pos, sc) {
        const dome = sphereDirs(N(g, 260)).filter(d => d[1] > 0.12);
        emitDirs(g, pos, dome, 44 * sc, [0.2, 0.6, 1.0], { ttl: 2.8, size: 2.1, drag: 1.45, grav: 0.22, c2: [0.45, 0.2, 1.0], flags: F.LATEFADE | F.FLICKER, sj: 0.03 });
        const rim = 14, segs = Math.round(10 * Math.max(0.6, g.quality.density));
        for (let k = 0; k < rim; k++) {
          const a = k / rim * TAU + rnd(-0.1, 0.1), cx = Math.cos(a), cz = Math.sin(a);
          for (let j = 0; j < segs; j++) {
            const sp = (32 - j * 1.4) * sc;
            g.fx.spawn(pos.x, pos.y, pos.z, cx * sp, 6 - j * 3.4, cz * sp, [0.75, 0.3, 1.0], 3.6 + j * 0.12, 1.6, 1.15, 0.32,
              F.GLITTER | F.TRAIL, { trail: 9 * g.quality.trail, tc: [0.45, 0.15, 0.9], param: -1.6 });
          }
        }
        g.world.flash(pos, [0.3, 0.5, 1.0], 5 * sc, 1.8);
        for (let i = 1; i <= 3; i++) g.after(0.4 * i + rnd(0, 0.2), () => g.world.flash(pos, [0.5, 0.6, 1.0], 2.2, 9));
        g.smokeCloud(pos, 60 * sc, 10);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'triple', name: 'Triple Salto', short: 'Triple', tag: 'NUEVO', selfAudio: true, centered: true,
      caliber: 125, height: 150, sound: 'Pa · pa · ¡BUM! en tres alturas',
      desc: 'Carcasa de tres etapas: cada estallido lanza la siguiente más alto y más grande.',
      swatch: ['#ff3355', '#5ab8ff', '#ffc14d'],
      look: { body: 0xe8e2d4, stripe: 0xff3355, nose: 0x5ab8ff, len: 3.0, r: 0.26, fins: 4, stick: true },
      fuse: 1.3, ascentTime: 2.4,
      tail: { rate: 260, col: [1.0, 0.6, 0.25], size: 1.0, spread: 1.6, life: 0.6, smoke: 0.9 },
      audio: {
        fusePitch: 0.95,
        launch: { thump: 60, bass: 0.9, noise: 0.75, f0: 350, f1: 1800, len: 0.7, echo: 0.2, brown: true },
        ascent: { kind: 'hiss', f0: 2100, f1: 900, gain: 0.42 },
        breaks: [
          { crack: 1.0, crackHz: 2600, bodyHz: 5000, body: 0.28, bodyGain: 0.55, sub: 85, bass: 0.4, subLen: 0.22, rumble: 0, reverb: 0.6, echo: 0.45 },
          { crack: 1.0, crackHz: 1900, bodyHz: 3600, body: 0.5, bodyGain: 0.8, sub: 58, bass: 0.8, subLen: 0.45, rumble: 1.2, rumbleGain: 0.25, reverb: 0.75, echo: 0.5 },
          { crack: 0.85, crackHz: 1200, bodyHz: 2400, body: 1.1, bodyGain: 1.1, sub: 33, bass: 1.5, subLen: 1.1, rumble: 4.0, rumbleGain: 0.75, reverb: 1.0, echo: 0.75, tail: { kind: 'glitter', gain: 0.4, delay: 0.5 } },
        ],
      },
      burst(g, pos, sc) {
        const A = this.audio, p1 = pos.clone(), p2 = pos.clone().add(new THREE.Vector3(rnd(-4, 4), 28, rnd(-4, 4))), p3 = p2.clone().add(new THREE.Vector3(rnd(-4, 4), 30, rnd(-4, 4)));
        const comet = (from, to, t) => {
          const v = to.clone().sub(from).divideScalar(t);
          g.fx.spawn(from.x, from.y, from.z, v.x, v.y + 4.9 * 0.2 * t, v.z, [1, 0.8, 0.4], t, 2.2, 0, 0.2, F.TRAIL, { trail: 160 * g.quality.trail, tc: [1, 0.6, 0.2] });
        };
        // 1) chico, rojo
        g.audio.burst(p1, { burst: A.breaks[0] }, sc);
        emitDirs(g, p1, sphereDirs(N(g, 90)), 28 * sc, [1.0, 0.15, 0.25], { ttl: 1.2, size: 1.8, drag: 1.5, grav: 0.3, flags: F.FLICKER });
        g.world.flash(p1, [1, 0.2, 0.3], 2.5, 3);
        comet(p1, p2, 0.5);
        // 2) mediano, azul con anillo
        g.after(0.5, () => {
          g.audio.burst(p2, { burst: A.breaks[1] }, sc);
          emitDirs(g, p2, sphereDirs(N(g, 140)), 42 * sc, [0.3, 0.65, 1.0], { ttl: 1.6, size: 2.0, drag: 1.35, grav: 0.25, c2: [0.6, 0.85, 1.0], flags: F.TRAIL, trail: 8 });
          emitDirs(g, p2, ringDirs(N(g, 80), 0, 1, 0), 55 * sc, [0.8, 0.9, 1.0], { ttl: 1.3, size: 1.8, drag: 1.3, grav: 0.1, flags: F.FLICKER });
          g.world.flash(p2, [0.4, 0.6, 1], 3.5, 2.6);
          comet(p2, p3, 0.55);
        });
        // 3) grande, dorado
        g.after(1.05, () => {
          g.audio.burst(p3, { burst: A.breaks[2] }, sc);
          emitDirs(g, p3, sphereDirs(N(g, 240)), 70 * sc, [1.0, 0.7, 0.22], { ttl: 2.8, size: 2.5, drag: 1.25, grav: 0.4, c2: [1.0, 0.35, 0.06], flags: F.TRAIL | F.LATEFADE, trail: 20, tc: [0.9, 0.5, 0.12] });
          g.world.flash(p3, [1, 0.65, 0.25], 7 * sc, 1.6);
          g.smokeCloud(p3, 80 * sc, 14);
        });
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'pirograma', name: 'Pirograma Musical', short: 'Pirograma', tag: 'NUEVO', centered: true,
      caliber: 90, height: 170, sound: 'Sube tocando una escala · campanas',
      desc: 'Dibuja una figura que mira al público (corazón, estrella o sonrisa) y suena un acorde.',
      swatch: ['#ff3d7f', '#ffd23f', '#ffe9a8'],
      look: { body: 0xffffff, stripe: 0xff3d7f, nose: 0xffd23f, len: 2.0, r: 0.18, fins: 3, stick: true },
      fuse: 1.0, ascentTime: 2.6,
      tail: { rate: 200, col: [1.0, 0.45, 0.7], size: 0.85, spread: 1.4, life: 0.5, smoke: 0.6 },
      audio: {
        fusePitch: 1.15,
        launch: { thump: 90, bass: 0.4, noise: 0.55, f0: 800, f1: 3000, len: 0.4, echo: 0.1 },
        ascent: { kind: 'melody', notes: [523, 587, 659, 784, 880, 1047, 1175, 1319], gain: 0.22 },
        burst: { crack: 0.8, crackHz: 2800, bodyHz: 4000, body: 0.3, bodyGain: 0.5, sub: 70, bass: 0.45, subLen: 0.3,
          rumble: 0, reverb: 0.7, echo: 0.35 },
      },
      burst(g, pos, sc) {
        const cam = g.world.camera; cam.updateMatrixWorld();
        const R = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), U = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        const kind = ['heart', 'star', 'smile'][(Math.random() * 3) | 0];
        const pts = [], n = Math.round(150 * Math.max(0.7, g.quality.density));
        if (kind === 'heart') for (let i = 0; i < n; i++) { const t = i / n * TAU; pts.push([16 * Math.pow(Math.sin(t), 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.1]); }
        if (kind === 'star') for (let i = 0; i < n; i++) {
          const f = i / n * 10, k = Math.floor(f), w = f - k;
          const a1 = k / 10 * TAU + Math.PI / 2, a2 = (k + 1) / 10 * TAU + Math.PI / 2, r1 = k % 2 ? 0.42 : 1, r2 = k % 2 ? 1 : 0.42;
          pts.push([Math.cos(a1) * r1 * (1 - w) + Math.cos(a2) * r2 * w, Math.sin(a1) * r1 * (1 - w) + Math.sin(a2) * r2 * w]);
        }
        if (kind === 'smile') {
          for (let i = 0; i < n * 0.55; i++) { const t = i / (n * 0.55) * TAU; pts.push([Math.cos(t), Math.sin(t)]); }
          for (let i = 0; i < n * 0.25; i++) { const t = Math.PI * (1.15 + 0.7 * i / (n * 0.25)); pts.push([Math.cos(t) * 0.6, Math.sin(t) * 0.6 - 0.02]); }
          for (const ex of [-0.33, 0.33]) for (let i = 0; i < 10; i++) { const t = i / 10 * TAU; pts.push([ex + Math.cos(t) * 0.09, 0.3 + Math.sin(t) * 0.12]); }
        }
        const col = { heart: [1.0, 0.16, 0.42], star: [1.0, 0.74, 0.18], smile: [1.0, 0.88, 0.12] }[kind];
        const c2 = { heart: [1.0, 0.45, 0.7], star: [1.0, 0.45, 0.1], smile: [1.0, 0.6, 0.1] }[kind];
        const sp = 46 * sc;
        for (const [x, y] of pts) {
          const vx = (R.x * x + U.x * y) * sp, vy = (R.y * x + U.y * y) * sp, vz = (R.z * x + U.z * y) * sp;
          g.fx.spawn(pos.x, pos.y, pos.z, vx, vy, vz, col, 2.4, 2.3, 1.1, 0.08, F.FLICKER | F.LATEFADE, { c2 });
        }
        const notes = { heart: [523, 659, 784, 1047], star: [784, 988, 1175, 1568, 1976], smile: [392, 494, 587, 784, 659] }[kind];
        g.audio.chime(pos, notes, 0.12);
        g.world.flash(pos, col, 4 * sc, 2.4);
        g.smokeCloud(pos, 40 * sc, 6);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'enjambre', name: 'Enjambre Zumbador', short: 'Enjambre', tag: 'NUEVO',
      caliber: 70, height: 160, sound: 'Aleteo agudo · coro de abejorros',
      desc: 'Libera decenas de chispas que vuelan como abejas, zumbando por todo el cielo.',
      swatch: ['#ffd12e', '#9cff3d', '#ff8a1f'],
      look: { body: 0xffd12e, stripe: 0x1a1a1a, nose: 0x1a1a1a, len: 1.8, r: 0.17, fins: 4, stick: false },
      fuse: 0.9, ascentTime: 2.2,
      tail: { rate: 200, col: [1.0, 0.85, 0.3], size: 0.8, spread: 2.6, life: 0.4, smoke: 0.5 },
      audio: {
        fusePitch: 1.2,
        launch: { thump: 100, bass: 0.35, noise: 0.5, f0: 900, f1: 3500, len: 0.35, echo: 0.1 },
        ascent: { kind: 'hum', f0: 260, f1: 430, gain: 0.26, rate: 42 },
        burst: { crack: 0.7, crackHz: 2200, bodyHz: 3500, body: 0.35, bodyGain: 0.55, sub: 75, bass: 0.45, subLen: 0.3,
          rumble: 0, reverb: 0.6, echo: 0.3 },
      },
      burst(g, pos, sc) {
        const dirs = sphereDirs(Math.round(70 * Math.max(0.6, g.quality.density)));
        emitDirs(g, pos, dirs, 16 * sc, (d) => (Math.random() < 0.7 ? [1.0, 0.8, 0.18] : [0.6, 1.0, 0.25]), {
          ttl: 3.4, size: 1.9, drag: 0.9, grav: 0.03, flags: F.SWARM | F.TRAIL | F.FLICKER, param: 95, trail: 26, tc: [0.85, 0.55, 0.1], sj: 0.5,
        });
        g.audio.swarm(pos, 3.4, mobileVoices(g));
        g.world.flash(pos, [1, 0.8, 0.25], 3 * sc, 2.5);
        g.smokeCloud(pos, 35 * sc, 6);
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'agujero', name: 'Agujero Negro', short: 'Agujero', tag: 'NUEVO', selfAudio: true,
      caliber: 125, height: 190, sound: 'Theremin · crescendo al revés · implosión',
      desc: 'Una nube de estrellas cae hacia el centro, se traga la luz y explota en una onda.',
      swatch: ['#6a2bff', '#ff2bd6', '#2be0ff'],
      look: { body: 0x0b0b10, stripe: 0x6a2bff, nose: 0x2be0ff, len: 2.6, r: 0.24, fins: 4, stick: false },
      fuse: 1.5, ascentTime: 2.8,
      tail: { rate: 160, col: [0.55, 0.3, 1.0], size: 0.9, spread: 0.7, life: 0.7, smoke: 0.4 },
      audio: {
        fusePitch: 0.7, fuseGain: 0.9,
        launch: { thump: 45, bass: 1.0, noise: 0.45, f0: 200, f1: 900, len: 0.8, echo: 0.2, brown: true },
        ascent: { kind: 'theremin', f0: 640, f1: 230, gain: 0.3 },
        boom: { crack: 1.1, crackHz: 1400, bodyHz: 2600, body: 1.2, bodyGain: 1.1, sub: 29, bass: 1.7, subLen: 1.4,
          rumble: 5.0, rumbleGain: 0.85, reverb: 1.0, echo: 0.85, tail: { kind: 'sizzle', gain: 0.35, delay: 0.2, rate: 0.6 } },
      },
      burst(g, pos, sc) {
        const T = 1.4, Rr = 75 * sc;
        g.audio.swell(pos, T);
        // cáscara que se contrae
        for (const d of sphereDirs(N(g, 260))) {
          const r = Rr * rnd(0.85, 1.1);
          g.fx.spawn(pos.x + d[0] * r, pos.y + d[1] * r, pos.z + d[2] * r, -d[0] * r / T, -d[1] * r / T, -d[2] * r / T,
            [0.35, 0.15, 0.85], T * 0.97, 1.7, 0, 0, F.FLICKER, { c2: [0.4, 0.85, 1.0] });
        }
        // disco de acreción que gira mientras cae
        for (let i = 0, n = N(g, 110); i < n; i++) {
          const a = i / n * TAU, r = Rr * 1.25, tang = r / T * 0.9;
          g.fx.spawn(pos.x + Math.cos(a) * r, pos.y + rnd(-2, 2), pos.z + Math.sin(a) * r,
            -Math.cos(a) * r / T - Math.sin(a) * tang, 0, -Math.sin(a) * r / T + Math.cos(a) * tang,
            [1.0, 0.2, 0.75], T * 0.9, 1.6, 0, 0, F.TRAIL, { trail: 20 * g.quality.trail, tc: [0.6, 0.1, 0.6] });
        }
        g.world.flash(pos, [0.4, 0.2, 1], 1.5, 1);
        g.after(T, () => {
          g.audio.burst(pos, { burst: this.audio.boom }, sc);
          emitDirs(g, pos, ringDirs(N(g, 200), 0, 1, 0), 120 * sc, [1.0, 0.2, 0.8], { ttl: 1.3, size: 2.4, drag: 2.0, grav: 0.05, c2: [0.4, 0.1, 1.0], flags: F.TRAIL, trail: 8, sj: 0.02 });
          emitDirs(g, pos, sphereDirs(N(g, 160)), 60 * sc, [0.3, 0.85, 1.0], { ttl: 2.2, size: 2.2, drag: 1.4, grav: 0.2, c2: [0.45, 0.2, 1.0], flags: F.FLICKER | F.TRAIL, trail: 10 });
          g.world.flash(pos, [0.7, 0.3, 1], 8 * sc, 1.6);
          g.smokeCloud(pos, 90 * sc, 16);
        });
      },
    },
    /* ------------------------------------------------------------ */
    {
      id: 'diamantes', name: 'Cruz de Diamantes', short: 'Diamantes', tag: 'NUEVO',
      caliber: 75, height: 170, sound: 'Silbido que cae · tableteo de cruces',
      desc: 'Cada estrella dorada se parte en cuatro cometas plateados que se cruzan.',
      swatch: ['#ffb84a', '#9fdcff', '#e9f4ff'],
      look: { body: 0x1f3f66, stripe: 0xffb84a, nose: 0x9fdcff, len: 2.1, r: 0.18, fins: 3, stick: true },
      fuse: 1.0, ascentTime: 2.3,
      tail: { rate: 240, col: [1.0, 0.7, 0.3], size: 0.85, spread: 1.4, life: 0.5, smoke: 0.7 },
      audio: {
        fusePitch: 1.0,
        launch: { thump: 78, bass: 0.55, noise: 0.7, f0: 550, f1: 2500, len: 0.5, echo: 0.12 },
        ascent: { kind: 'whistle', f0: 2900, f1: 1250, gain: 0.3 },
        burst: { crack: 1.1, crackHz: 2600, bodyHz: 4500, body: 0.45, bodyGain: 0.75, sub: 60, bass: 0.7, subLen: 0.4,
          rumble: 1.2, rumbleGain: 0.25, reverb: 0.7, echo: 0.4, tail: { kind: 'crackle', gain: 0.75, delay: 0.95, rate: 1.5 } },
      },
      burst(g, pos, sc) {
        emitDirs(g, pos, sphereDirs(N(g, 70)), 40 * sc, [1.0, 0.68, 0.22], { ttl: 0.95, size: 2.3, drag: 1.3, grav: 0.25, c2: [0.6, 0.85, 1.0], flags: F.SPLIT | F.TRAIL, trail: 30, tc: [1, 0.55, 0.15], sj: 0.08 });
        g.world.flash(pos, [1, 0.7, 0.3], 4.5 * sc, 2.4);
        g.after(0.95, () => g.world.flash(pos, [0.6, 0.85, 1], 3 * sc, 3));
        g.smokeCloud(pos, 55 * sc, 10);
      },
    },
  ];
  function mobileVoices(g) { return g.quality.density < 0.7 ? 5 : g.quality.density < 1 ? 7 : 9; }

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
      if (ty.path === 'helix') {
        // trayectoria en sacacorchos: el radio crece con la altura
        const a = u * ty.turns * TAU, r = ty.helixR * Math.min(1, u * 3);
        this.pos.x += Math.cos(a) * r; this.pos.z += Math.sin(a) * r;
      }
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
      if (!this.type.selfAudio) g.audio.burst(this.pos, this.type.audio, this.sc);
      this.type.burst(g, this.pos.clone(), this.sc);
      g.emit('burst', this);
    }

    dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.g.audio.stopAscent(this.voice, true); }
  }
  const UP = new THREE.Vector3(0, 1, 0);

  window.PyroRockets = { CATALOG, Rocket, buildMesh, emitDirs, N, jit, mixc };
})();
