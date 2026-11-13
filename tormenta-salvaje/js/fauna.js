/* TORMENTA SALVAJE — vida del bosque y detalles del ambiente
 *
 * Animales: ciervo (se congela en el haz y huye), búhos posados (giran la cabeza, ululan, se espantan),
 * murciélagos en los respiros de la tormenta, polillas alrededor de la linterna, sapos junto a los charcos,
 * ojos que brillan en la oscuridad y aullidos lejanos.
 * Ambiente: hojas arrastradas por las ráfagas, hongos bioluminiscentes y telarañas que brillan con la linterna.
 * Los ojos de los animales reflejan la linterna (tapetum lucidum): casi invisibles a oscuras, se encienden en el haz.
 */
(function () {
  'use strict';
  const T = window.TS, V3 = THREE.Vector3, rnd = T.rnd;
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // textura de brillo para ojos
  let glowTex = null;
  function glow() {
    if (glowTex) return glowTex;
    const c = T.canvas(64, 64), g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); glowTex = T.tex(c); return glowTex;
  }
  function eyes(color, sep, size) {
    const grp = new THREE.Group(), mat = new THREE.SpriteMaterial({ map: glow(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    for (const s of [-1, 1]) { const e = new THREE.Sprite(mat); e.scale.setScalar(size); e.position.x = s * sep / 2; grp.add(e); }
    grp.userData.mat = mat; return grp;
  }

  class Fauna {
    constructor(world, audio, splashes, Q) {
      this.world = world; this.scene = world.scene; this.audio = audio; this.splashes = splashes; this.Q = Q;
      this.t = 0;
      this._deer(); this._owls(); this._bats(); this._moths(); this._frogs(); this._eyesDark();
      this._leaves(); this._mushrooms(); this._webs();
      this.howlT = rnd(40, 90);
      this.debug = { deer: 0, owlFly: 0, eyes: 0, frogJump: 0 };
    }

    // ¿qué tanto ilumina la linterna este punto? (0..1)
    lit(p, fl, range) {
      if (!fl || fl.on < 0.05) return 0;
      const vx = p.x - fl.pos.x, vy = p.y - fl.pos.y, vz = p.z - fl.pos.z, d = Math.hypot(vx, vy, vz);
      const c = (vx * fl.dir.x + vy * fl.dir.y + vz * fl.dir.z) / d;
      return sstep(fl.cos - 0.04, fl.cos + 0.04, c) * Math.max(0, 1 - d / (range || 45)) * fl.on;
    }

    /* ---------------- ciervo ---------------- */
    _deer() {
      const fur = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.62, envMapIntensity: 0.4 });
      const light = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.7 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.5 });
      const antler = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.6 });
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const sph = (r, sx, sy, sz, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };
      body.add(sph(1, 0.32, 0.36, 0.78, fur, 0, 1.08, 0));              // tronco
      body.add(sph(1, 0.28, 0.32, 0.3, fur, 0, 1.12, 0.52));            // pecho
      body.add(sph(1, 0.2, 0.08, 0.5, light, 0, 0.82, 0.05));           // vientre claro
      body.add(sph(1, 0.1, 0.12, 0.06, light, 0, 1.18, -0.78));         // cola blanca
      const neck = new THREE.Mesh(T.limb([new V3(0, 1.2, 0.55), new V3(0, 1.5, 0.75), new V3(0, 1.72, 0.85)], 0.14, 0.1, 10, 1), fur); body.add(neck);
      const head = new THREE.Group(); head.position.set(0, 1.75, 0.88); body.add(head);
      head.add(sph(1, 0.1, 0.11, 0.17, fur, 0, 0, 0.06));
      head.add(sph(1, 0.06, 0.065, 0.11, fur, 0, -0.04, 0.24));          // hocico
      head.add(sph(1, 0.035, 0.03, 0.03, dark, 0, -0.035, 0.34));        // nariz
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), fur); ear.position.set(s * 0.09, 0.1, -0.02); ear.rotation.z = -s * 0.9; head.add(ear);
        // cuernas ramificadas
        const a0 = new V3(s * 0.05, 0.08, 0.0), a1 = new V3(s * 0.2, 0.32, -0.05), a2 = new V3(s * 0.26, 0.52, 0.06);
        head.add(new THREE.Mesh(T.limb([a0, a1, a2], 0.022, 0.01, 5, 1), antler));
        head.add(new THREE.Mesh(T.limb([a1, new V3(s * 0.12, 0.48, 0.12)], 0.015, 0.006, 4, 1), antler));
        head.add(new THREE.Mesh(T.limb([a1.clone().lerp(a2, 0.5), new V3(s * 0.36, 0.5, -0.06)], 0.014, 0.006, 4, 1), antler));
      }
      this.deerEyes = eyes(0xc8ffd0, 0.13, 0.09); this.deerEyes.position.set(0, 0.03, 0.17); head.add(this.deerEyes);
      // patas con articulación en cadera y rodilla
      this.deerLegs = [];
      for (const [x, z, front] of [[-0.16, 0.48, 1], [0.16, 0.48, 1], [-0.16, -0.5, 0], [0.16, -0.5, 0]]) {
        const hip = new THREE.Group(); hip.position.set(x, 1.0, z); body.add(hip);
        hip.add(new THREE.Mesh(T.limb([new V3(0, 0, 0), new V3(0, -0.45, front ? 0.02 : -0.06)], 0.07, 0.045, 7, 1), fur));
        const knee = new THREE.Group(); knee.position.set(0, -0.45, front ? 0.02 : -0.06); hip.add(knee);
        knee.add(new THREE.Mesh(T.limb([new V3(0, 0, 0), new V3(0, -0.5, front ? 0 : 0.04)], 0.035, 0.028, 6, 1), fur));
        const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark); hoof.position.set(0, -0.52, front ? 0 : 0.04); knee.add(hoof);
        this.deerLegs.push({ hip, knee, front });
      }
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      g.visible = false; this.scene.add(g);
      this.deer = { g, body, head, state: 'hidden', t: 0, timer: rnd(20, 40), litT: 0, vel: new V3(), stepT: 0 };
    }
    _spawnDeer(P, cam) {
      const f = new V3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
      for (let k = 0; k < 20; k++) {
        const a = rnd(-1.1, 1.1), d = rnd(17, 30), dir = f.clone().applyAxisAngle(new V3(0, 1, 0), a);
        const x = P.pos.x + dir.x * d, z = P.pos.z + dir.z * d;
        if (T.distToPath(x, z) < 3) continue;
        if (this.world.collidersNear(x, z).some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.8) ** 2)) continue;
        const D = this.deer; D.g.position.set(x, this.world.groundHeight(x, z), z);
        D.g.rotation.y = Math.atan2(P.pos.x - x, P.pos.z - z) + rnd(-0.6, 0.6);
        D.g.visible = true; D.state = 'watch'; D.t = 0; D.litT = 0; D.watchFor = rnd(6, 12); D.vel.set(0, 0, 0);
        this.debug.deer++;
        return true;
      }
      return false;
    }
    _updateDeer(dt, c) {
      const D = this.deer, P = c.player;
      D.t += dt;
      if (D.state === 'hidden') {
        D.timer -= dt;
        if (D.timer <= 0) { D.timer = rnd(45, 95); if (c.playing) this._spawnDeer(P, c.camera); }
        return;
      }
      const pos = D.g.position, dist = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
      const eyeW = new V3(); this.deerEyes.getWorldPosition(eyeW);
      const L = this.lit(eyeW, c.fl, 50);
      this.deerEyes.userData.mat.opacity = 0.03 + L * 1.4;
      if (D.state === 'watch') {
        // gira la cabeza hacia el jugador y mueve las orejas
        const want = Math.atan2(P.pos.x - pos.x, P.pos.z - pos.z) - D.g.rotation.y;
        D.head.rotation.y += (Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(want), Math.cos(want)))) - D.head.rotation.y) * (1 - Math.exp(-dt * 3));
        D.head.rotation.x = Math.sin(D.t * 0.7) * 0.05;
        if (L > 0.25) D.litT += dt;
        if (dist < 11 || D.litT > 1.4 || D.t > D.watchFor) {
          D.state = 'flee'; D.t = 0;
          this.audio.snort(pos.clone().add(new V3(0, 1.6, 0)));
          const away = new V3(pos.x - P.pos.x, 0, pos.z - P.pos.z).normalize().applyAxisAngle(new V3(0, 1, 0), rnd(-0.6, 0.6));
          D.fleeDir = away;
        }
        return;
      }
      // huida a saltos
      const ang = Math.atan2(D.fleeDir.x, D.fleeDir.z);
      let dr = ang - D.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      D.g.rotation.y += dr * (1 - Math.exp(-dt * 6));
      const sp = Math.min(8.5, D.t * 9);
      pos.x += Math.sin(D.g.rotation.y) * sp * dt; pos.z += Math.cos(D.g.rotation.y) * sp * dt;
      const ph = D.t * 11;
      pos.y = this.world.groundHeight(pos.x, pos.z) + Math.max(0, Math.sin(ph)) * 0.35;
      D.body.rotation.x = Math.sin(ph) * 0.12;
      D.head.rotation.y *= 0.9;
      for (const l of this.deerLegs) { l.hip.rotation.x = Math.sin(ph + (l.front ? 0 : Math.PI)) * 0.75; l.knee.rotation.x = (l.front ? 1 : -1) * Math.max(0, Math.sin(ph + (l.front ? 0.6 : Math.PI + 0.6))) * 0.9; }
      D.stepT -= dt;
      if (D.stepT <= 0) { D.stepT = 0.28; const p = pos.clone(); p.y += 0.3; this.audio.rustle(p, 0.7); if (Math.random() < 0.3) this.audio.snap(p, 0.5); }
      if (D.t > 4.5 || dist > 55) { D.state = 'hidden'; D.g.visible = false; for (const l of this.deerLegs) { l.hip.rotation.x = 0; l.knee.rotation.x = 0; } D.body.rotation.x = 0; }
    }

    /* ---------------- búhos ---------------- */
    _owlMesh() {
      const g = new THREE.Group();
      const feather = new THREE.MeshStandardMaterial({ color: 0x5b4b3c, roughness: 0.85 }), face = new THREE.MeshStandardMaterial({ color: 0x8c7a62, roughness: 0.9 });
      const sph = (r, sx, sy, sz, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); (p || g).add(o); return o; };
      sph(1, 0.15, 0.22, 0.13, feather, 0, 0.2, 0);
      const head = new THREE.Group(); head.position.set(0, 0.46, 0); g.add(head);
      sph(1, 0.13, 0.11, 0.12, feather, 0, 0, 0, head);
      sph(1, 0.1, 0.08, 0.03, face, 0, 0, 0.1, head);
      for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), feather); t.position.set(s * 0.07, 0.11, 0); t.rotation.z = -s * 0.3; head.add(t); }
      const e = eyes(0xffb347, 0.075, 0.06); e.position.set(0, 0.01, 0.13); head.add(e);
      const wings = [];
      for (const s of [-1, 1]) {
        const wg = new THREE.Group(); wg.position.set(s * 0.12, 0.3, 0); g.add(wg);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), new THREE.MeshStandardMaterial({ color: 0x4e4034, side: THREE.DoubleSide, roughness: 0.9 }));
        w.position.x = s * 0.2; w.rotation.x = -Math.PI / 2; wg.add(w); wg.rotation.z = s * 1.35; wings.push(wg);
      }
      return { g, head, eyes: e, wings };
    }
    _owlPerch(o) {
      const cand = this.world.trees.filter(t => t.s.kind !== 'birch' && (() => { const d = T.distToPath(t.x, t.z); return d > 5 && d < 22; })());
      const t = cand[(Math.random() * cand.length) | 0];
      const a = Math.random() * 6.283, h = t.y + (5.5 + Math.random() * 3) * t.scale;
      o.g.position.set(t.x + Math.cos(a) * 0.55 * t.scale, h, t.z + Math.sin(a) * 0.55 * t.scale);
      o.g.rotation.set(0, a + Math.PI / 2, 0);
      o.state = 'perch'; o.hootT = rnd(6, 25); o.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * 1.35; });
    }
    _owls() {
      this.owlsList = [];
      for (let i = 0; i < 3; i++) { const o = this._owlMesh(); this.scene.add(o.g); this._owlPerch(o); this.owlsList.push(o); }
    }
    _updateOwls(dt, c) {
      const P = c.player;
      for (const o of this.owlsList) {
        const pos = o.g.position, dist = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
        const ew = new V3(); o.eyes.getWorldPosition(ew);
        o.eyes.userData.mat.opacity = 0.02 + this.lit(ew, c.fl, 40) * 1.5;
        if (o.state === 'perch') {
          // la cabeza sigue al jugador (los búhos giran mucho el cuello)
          const want = Math.atan2(P.pos.x - pos.x, P.pos.z - pos.z) - o.g.rotation.y;
          o.head.rotation.y += (Math.max(-2.2, Math.min(2.2, Math.atan2(Math.sin(want), Math.cos(want)))) - o.head.rotation.y) * (1 - Math.exp(-dt * 2));
          o.hootT -= dt;
          if (o.hootT <= 0 && dist < 70 && c.playing) { o.hootT = rnd(14, 35); this.audio.owl(pos); }
          if (dist < 7.5 && c.playing) {
            o.state = 'fly'; o.t = 0; this.audio.flap(pos, 1.6); this.debug.owlFly++;
            o.flyDir = new V3(pos.x - P.pos.x, 0, pos.z - P.pos.z).normalize();
            o.g.rotation.y = Math.atan2(o.flyDir.x, o.flyDir.z);
          }
        } else {
          o.t += dt;
          o.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * Math.sin(o.t * 14) * 0.9; });
          pos.addScaledVector(o.flyDir, 7 * dt); pos.y += (2.2 - o.t * 0.4) * dt;
          o.head.rotation.y *= 0.9;
          if (o.t > 5) this._owlPerch(o);
        }
      }
    }

    /* ---------------- murciélagos (solo en los respiros de la tormenta) ---------------- */
    _bats() {
      const mat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide });
      this.batsList = [];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), mat));
        const ws = [];
        for (const s of [-1, 1]) {
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.04, s * 0.24, 0.02, -0.02, 0, 0, -0.06, s * 0.16, -0.01, -0.09], 3)); geo.setIndex([0, 1, 2, 2, 1, 3]);
          const w = new THREE.Mesh(geo, mat); g.add(w); ws.push(w);
        }
        g.visible = false; this.scene.add(g);
        this.batsList.push({ g, ws, ph: Math.random() * 100, a: rnd(0.5, 0.9), b: rnd(0.7, 1.3), sq: rnd(2, 8) });
      }
      this.batCenter = new V3();
    }
    _updateBats(dt, c) {
      const calm = c.storm.rain < 0.5;
      const f = new V3(); c.camera.getWorldDirection(f); f.y = 0; f.normalize();
      this.batCenter.lerp(new V3(c.player.pos.x + f.x * 13, c.player.pos.y + 5, c.player.pos.z + f.z * 13), 1 - Math.exp(-dt * 0.3));
      for (const b of this.batsList) {
        b.g.visible = calm;
        if (!calm) continue;
        b.ph += dt;
        const t = b.ph;
        b.g.position.set(this.batCenter.x + Math.sin(t * b.a) * 9 + Math.sin(t * 2.3) * 1.5, this.batCenter.y + Math.sin(t * b.b) * 2 + Math.sin(t * 3.1), this.batCenter.z + Math.cos(t * b.a * 1.3) * 7);
        const ahead = new V3(Math.cos(t * b.a) * 9, 0, -Math.sin(t * b.a * 1.3) * 9);
        b.g.rotation.y = Math.atan2(ahead.x, ahead.z);
        const fl = Math.sin(t * 24) * 0.9; b.ws[0].rotation.z = fl; b.ws[1].rotation.z = -fl;
        b.sq -= dt; if (b.sq <= 0) { b.sq = rnd(3, 9); if (c.playing && b.g.position.distanceTo(c.camera.position) < 14) this.audio.bat(b.g.position); }
      }
    }

    /* ---------------- polillas alrededor de la linterna ---------------- */
    _moths() {
      const mat = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x2a2620 });
      this.mothList = [];
      for (let i = 0; i < 5; i++) {
        const g = new THREE.Group(), ws = [];
        for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.02), mat); w.position.x = s * 0.0125; const p = new THREE.Group(); p.add(w); g.add(p); ws.push(p); }
        g.visible = false; this.scene.add(g);
        this.mothList.push({ g, ws, ph: Math.random() * 50, d: rnd(0.9, 2.6), r: rnd(0.15, 0.45) });
      }
    }
    _updateMoths(dt, c) {
      const on = c.fl && c.fl.on > 0.3 && c.storm.rain < 0.9;
      for (const m of this.mothList) {
        m.g.visible = on; if (!on) continue;
        m.ph += dt; const t = m.ph;
        const base = c.fl.pos.clone().addScaledVector(c.fl.dir, m.d + Math.sin(t * 0.7) * 0.3);
        m.g.position.set(base.x + Math.sin(t * 3.1) * m.r + Math.sin(t * 11) * 0.03, base.y + Math.cos(t * 2.3) * m.r * 0.7, base.z + Math.cos(t * 2.7) * m.r);
        m.g.rotation.y = t * 2; const fl = Math.sin(t * 40) * 1.1; m.ws[0].rotation.y = fl; m.ws[1].rotation.y = -fl;
      }
    }

    /* ---------------- sapos ---------------- */
    _frogs() {
      const skin = new THREE.MeshStandardMaterial({ color: 0x3f4a26, roughness: 0.35, envMapIntensity: 1 });
      const belly = new THREE.MeshStandardMaterial({ color: 0x8a8558, roughness: 0.5 });
      const build = () => {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); b.scale.set(1, 0.65, 1.25); b.position.y = 0.035; g.add(b);
        const bl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), belly); bl.scale.set(0.9, 0.4, 1.1); bl.position.y = 0.02; g.add(bl);
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), skin); e.position.set(s * 0.025, 0.065, 0.035); g.add(e);
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin); l.scale.set(0.6, 0.45, 1.4); l.position.set(s * 0.045, 0.015, -0.03); g.add(l);
        }
        g.scale.setScalar(1.5); return g;
      };
      const P = this.world.puddles.filter(p => T.distToPath(p.x, p.z) < 30).sort(() => Math.random() - 0.5).slice(0, 12);
      this.frogList = P.map(p => {
        const g = build(), a = Math.random() * 6.283, r = p.r + 0.25;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        g.position.set(x, this.world.groundHeight(x, z), z); g.rotation.y = a + Math.PI; this.scene.add(g);
        return { g, pud: p, home: new V3(x, g.position.y, z), rot: g.rotation.y, state: 'sit', t: 0, croakT: rnd(2, 10) };
      });
    }
    _updateFrogs(dt, c) {
      const P = c.player;
      for (const f of this.frogList) {
        const pos = f.g.position, dist = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
        if (f.state === 'sit') {
          f.croakT -= dt;
          if (f.croakT <= 0) { f.croakT = rnd(3, 11) * (1.4 - c.storm.rain * 0.5); if (c.playing && dist < 28) this.audio.croak(pos.clone().add(new V3(0, 0.1, 0))); }
          // respira: el cuello late
          f.g.scale.y = 1.5 * (1 + Math.sin(this.t * 6 + f.home.x) * 0.06);
          if (dist < 2.6 && c.playing) { f.state = 'jump'; f.t = 0; f.from = pos.clone(); f.to = new V3(f.pud.x, f.pud.y, f.pud.z); this.debug.frogJump++; }
        } else if (f.state === 'jump') {
          f.t += dt; const k = Math.min(1, f.t / 0.45);
          pos.lerpVectors(f.from, f.to, k); pos.y += Math.sin(k * Math.PI) * 0.35;
          if (k >= 1) { f.state = 'gone'; f.t = 0; f.g.visible = false; this.splashes.spawn(pos.x, pos.y, pos.z, 8); this.audio.plop(pos); }
        } else {
          f.t += dt;
          if (f.t > 25 && dist > 12) { f.state = 'sit'; f.g.visible = true; pos.copy(f.home); }
        }
      }
    }

    /* ---------------- ojos en la oscuridad ---------------- */
    _eyesDark() {
      this.dark = { g: eyes(0xd8ff9a, 0.11, 0.08), timer: rnd(35, 60), life: 0, state: 'off' };
      this.dark.g.visible = false; this.scene.add(this.dark.g);
    }
    _updateEyesDark(dt, c) {
      const E = this.dark;
      if (E.state === 'off') {
        E.timer -= dt;
        if (E.timer <= 0 && c.playing && c.storm.flash < 0.1) {
          E.timer = rnd(50, 110);
          const f = new V3(); c.camera.getWorldDirection(f); f.y = 0; f.normalize();
          const side = Math.random() < 0.5 ? -1 : 1, dir = f.applyAxisAngle(new V3(0, 1, 0), side * rnd(0.45, 0.9)), d = rnd(18, 32);
          const x = c.player.pos.x + dir.x * d, z = c.player.pos.z + dir.z * d;
          E.g.position.set(x, this.world.groundHeight(x, z) + rnd(0.4, 1.2), z);
          E.g.lookAt(c.camera.position);
          E.g.visible = true; E.state = 'on'; E.life = rnd(4, 8); E.t = 0; this.debug.eyes++;
        }
        return;
      }
      E.t += dt;
      const L = this.lit(E.g.position, c.fl, 45), dist = E.g.position.distanceTo(c.camera.position);
      const blink = (E.t % 2.7) < 0.12 ? 0 : 1;
      E.g.userData.mat.opacity = (0.32 + L * 1.6) * blink * Math.min(1, E.t * 2);
      if (L > 0.35 && !E.caught) { E.caught = true; E.life = Math.min(E.life, E.t + 0.35); }
      if (E.t > E.life || dist < 10) {
        E.state = 'off'; E.g.visible = false; E.caught = false;
        this.audio.rustle(E.g.position.clone(), 0.55); if (Math.random() < 0.5) this.audio.snap(E.g.position.clone(), 0.4);
      }
    }

    /* ---------------- hojas arrastradas por el viento ---------------- */
    _leaves() {
      const n = this.Q.leaves || 120;
      const c = T.canvas(64, 64), g = c.getContext('2d');
      g.fillStyle = '#6b4a22'; g.beginPath(); g.ellipse(32, 32, 28, 13, 0.5, 0, 7); g.fill();
      g.strokeStyle = '#3a2814'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 46); g.lineTo(56, 18); g.stroke();
      const mat = new THREE.MeshStandardMaterial({ map: T.tex(c), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.4 });
      this.leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.12), mat, n);
      this.leafMesh.frustumCulled = false; this.scene.add(this.leafMesh);
      this.leafData = [];
      for (let i = 0; i < n; i++) this.leafData.push({ p: new V3(rnd(-18, 18), rnd(0, 14), rnd(-18, 18)), v: rnd(0.6, 1.5), r: new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), s: new V3(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)), ph: rnd(0, 6) });
      this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._one = new V3(1, 1, 1);
    }
    _updateLeaves(dt, c) {
      const P = c.camera.position, st = c.storm, active = Math.floor(this.leafData.length * (0.2 + st.gust * 0.8));
      for (let i = 0; i < this.leafData.length; i++) {
        const L = this.leafData[i];
        L.p.y -= L.v * dt; L.ph += dt;
        L.p.x += (st.windX * (0.5 + st.gust) + Math.sin(L.ph * 2) * 0.6) * dt; L.p.z += (st.windZ * (0.5 + st.gust) + Math.cos(L.ph * 1.7) * 0.6) * dt;
        L.r.x += L.s.x * dt; L.r.y += L.s.y * dt; L.r.z += L.s.z * dt;
        let wx = P.x + L.p.x, wz = P.z + L.p.z;
        if (L.p.x > 18) L.p.x -= 36; if (L.p.x < -18) L.p.x += 36; if (L.p.z > 18) L.p.z -= 36; if (L.p.z < -18) L.p.z += 36;
        const gy = this.world.groundHeight(wx, wz);
        if (P.y + L.p.y - 1.6 < gy) { L.p.set(rnd(-18, 18), rnd(8, 15), rnd(-18, 18)); }
        this._q.setFromEuler(L.r);
        const vis = i < active ? 1 : 0.0001;
        this._m4.compose(new V3(P.x + L.p.x, P.y - 1.6 + L.p.y, P.z + L.p.z), this._q, this._one.set(vis, vis, vis));
        this.leafMesh.setMatrixAt(i, this._m4);
      }
      this.leafMesh.instanceMatrix.needsUpdate = true;
    }

    /* ---------------- hongos bioluminiscentes ---------------- */
    _mushrooms() {
      const parts = [], r = T.mulberry(77);
      for (let i = 0; i < 5; i++) {
        const x = (r() - 0.5) * 0.4, z = (r() - 0.5) * 0.3, h = 0.04 + r() * 0.08, cr = 0.025 + r() * 0.035;
        const st = new THREE.CylinderGeometry(cr * 0.25, cr * 0.3, h, 6); st.translate(x, h / 2, z); parts.push({ geo: st, mat: 0 });
        const cap = new THREE.SphereGeometry(cr, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(x, h, z); parts.push({ geo: cap, mat: 0 });
      }
      const geo = T.merge(parts);
      const mat = new THREE.MeshStandardMaterial({ color: 0xa8d8c0, emissive: 0x2fae86, emissiveIntensity: 0.55, roughness: 0.4 });
      this.shroomMat = mat;
      const spots = this.world.trees.filter(t => { const d = T.distToPath(t.x, t.z); return d > 2.5 && d < 14; }).sort(() => r() - 0.5).slice(0, this.Q.shrooms || 70);
      const M = new THREE.InstancedMesh(geo, mat, spots.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      spots.forEach((t, i) => {
        const a = r() * 6.283, d = 0.55 * t.scale + 0.15, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        q.setFromAxisAngle(new V3(0, 1, 0), a); m4.compose(new V3(x, this.world.groundHeight(x, z) - 0.01, z), q, new V3(1.4, 1.4, 1.4)); M.setMatrixAt(i, m4);
      });
      M.frustumCulled = false; this.scene.add(M);
    }

    /* ---------------- telarañas ---------------- */
    _webs() {
      const N = 256, c = T.canvas(N, N), g = c.getContext('2d'), cx = N / 2, cy = N / 2;
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2;
      const spokes = 14;
      for (let i = 0; i < spokes; i++) { const a = i / spokes * 6.283 + Math.random() * 0.1; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * N * 0.48, cy + Math.sin(a) * N * 0.48); g.stroke(); }
      g.lineWidth = 0.9; g.beginPath();
      for (let k = 0; k < 900; k++) { const a = k / 900 * 6.283 * 22, rr = 8 + k / 900 * N * 0.42; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.95; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      for (let i = 0; i < 140; i++) { const a = Math.random() * 6.283, rr = Math.random() * N * 0.45; g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1 + Math.random() * 1.6, 0, 7); g.fill(); }
      const mat = new THREE.MeshStandardMaterial({ map: T.tex(c), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15, metalness: 0.3, color: 0x9aa0a8, opacity: 0.85 });
      const cand = this.world.trees.filter(t => { const d = T.distToPath(t.x, t.z); return d > 2.4 && d < 5.5 && t.s.kind !== 'snag'; });
      const n = Math.min(this.Q.webs || 26, cand.length), r = T.mulberry(55);
      for (let i = 0; i < n; i++) {
        const t = cand[Math.floor(r() * cand.length)], s = 0.9 + r() * 0.9;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
        // entre el tronco y el sendero, mirando al caminante
        const near = T.PATH_PTS.reduce((b, p) => ((p[0] - t.x) ** 2 + (p[1] - t.z) ** 2 < (b[0] - t.x) ** 2 + (b[1] - t.z) ** 2 ? p : b), T.PATH_PTS[0]);
        const dx = near[0] - t.x, dz = near[1] - t.z, l = Math.hypot(dx, dz);
        const x = t.x + dx / l * (0.6 + s * 0.4), z = t.z + dz / l * (0.6 + s * 0.4);
        m.position.set(x, this.world.groundHeight(x, z) + 0.9 + r() * 1.3, z);
        m.rotation.y = Math.atan2(dx, dz) + Math.PI / 2 + (r() - 0.5) * 0.6; m.rotation.z = r() * 3;
        m.renderOrder = 3; this.scene.add(m);
      }
    }

    update(dt, c) {
      this.t += dt;
      this._updateDeer(dt, c); this._updateOwls(dt, c); this._updateBats(dt, c); this._updateMoths(dt, c);
      this._updateFrogs(dt, c); this._updateEyesDark(dt, c); this._updateLeaves(dt, c);
      this.shroomMat.emissiveIntensity = 0.45 + Math.sin(this.t * 0.8) * 0.1;
      if (c.playing) {
        this.howlT -= dt;
        if (this.howlT <= 0) { this.howlT = rnd(80, 170); const a = Math.random() * 6.283; this.audio.howl(c.camera.position.clone().add(new V3(Math.cos(a) * 160, 10, Math.sin(a) * 160))); }
      }
    }
  }

  window.TS.Fauna = Fauna;
})();
