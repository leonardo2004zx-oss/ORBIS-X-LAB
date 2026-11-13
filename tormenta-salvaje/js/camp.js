/* TORMENTA SALVAJE — el camping Los Alerces y los refugios del sendero
 *
 * Construye con geometría: arco de entrada, carpas (una se puede recorrer por dentro, con farol),
 * pabellón techado con mesas y farol colgante, fogatas apagadas, auto abandonado, cabaña del
 * guardaparques con puerta articulada y un refugio de troncos a mitad del sendero.
 * Devuelve objetos interactivos (pistas, pilas, llave) y zonas de refugio que cambian la acústica.
 */
(function () {
  'use strict';
  const T = window.TS, V3 = THREE.Vector3;

  class Camp {
    constructor(world, Q) {
      this.world = world; this.scene = world.scene; this.Q = Q;
      const C = this.C = new V3(T.CAMP.x, 0, T.CAMP.z);
      this.items = [];      // { id, kind, pos, mesh, label, taken }
      this.shelters = [];   // { name, test(x,z), level, rain, layer }
      this.lights = [];
      this.mats();
      const at = (dx, dz) => { const x = C.x + dx, z = C.z + dz; return new V3(x, world.groundHeight(x, z), z); };
      this.at = at;
      this._arch(); this._tents(at); this._pavilion(at(11, -5)); this._fires(at); this._car(at(-3, -17));
      this._cabin(at(-19, -11)); this._props(at); this._leanTo(); this._campPuddles(at);
      world.finalizePuddles();
      // fusionar todo lo estático: de cientos de mallas a unas pocas por material
      for (const g of this.bakeList) T.bake(g, o => o === this.cabin.hinge);
    }

    mats() {
      const w = (m) => { this.world.wetMats.push(m); m.userData.env = m.envMapIntensity; return m; };
      this.wood = w(new THREE.MeshStandardMaterial({ map: T.woodTexture('#4a3420'), roughness: 0.5, envMapIntensity: 0.7 }));
      this.woodDark = w(new THREE.MeshStandardMaterial({ map: T.woodTexture('#2e2116'), roughness: 0.55, envMapIntensity: 0.6 }));
      this.metal = w(new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.35, metalness: 0.7 }));
      this.stone = w(new THREE.MeshStandardMaterial({ map: T.rockTexture(), color: 0x6a6d70, roughness: 0.4 }));
      this.char = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.9 });
      this.ash = w(new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.3 }));
    }
    _collide(x, z, r) { this.world._addCollider(x, z, r); }
    // pared recta como cadena de colisionadores circulares
    _wall(x0, z0, x1, z1, r) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / (r * 1.4))); for (let i = 0; i <= n; i++) this._collide(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, r); }
    _shadow(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); (this.bakeList = this.bakeList || []).push(o); return o; }

    /* ---------- arco de entrada ---------- */
    _arch() {
      const P = T.pathCurve.getPointAt(0.965), Q2 = T.pathCurve.getPointAt(0.99);
      const g = new THREE.Group(), y = this.world.groundHeight(P.x, P.z);
      g.position.set(P.x, y, P.z); g.rotation.y = Math.atan2(Q2.x - P.x, Q2.z - P.z) + Math.PI / 2;
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(T.limb([new V3(s * 2.4, -0.3, 0), new V3(s * 2.4, 3.6, 0)], 0.16, 0.13, 8, 0.5), this.woodDark); g.add(post);
        this._collide(P.x + Math.cos(g.rotation.y) * s * 2.4, P.z - Math.sin(g.rotation.y) * s * 2.4, 0.3);
      }
      g.add(new THREE.Mesh(T.limb([new V3(-2.8, 3.45, 0), new V3(2.8, 3.5, 0)], 0.13, 0.12, 8, 0.5), this.woodDark));
      const c = T.canvas(512, 128), x = c.getContext('2d');
      x.fillStyle = '#4f3620'; x.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 30; i++) { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); const yy = Math.random() * 128; x.moveTo(0, yy); x.lineTo(512, yy + (Math.random() - 0.5) * 6); x.stroke(); }
      x.fillStyle = '#d8cfb8'; x.font = 'bold 56px Georgia, serif'; x.textAlign = 'center'; x.fillText('CAMPING LOS ALERCES', 256, 82);
      const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.08), [this.wood, this.wood, this.wood, this.wood, new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.5 })]);
      board.position.y = 3.0; g.add(board);
      // cadenas
      for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), this.metal); ch.position.set(s * 1.7, 3.38, 0); g.add(ch); }
      this.scene.add(this._shadow(g));
    }

    /* ---------- carpas ---------- */
    _dome(r, color, stripe, doorGap, sy) {
      const g = new THREE.Group();
      const fab = new THREE.MeshStandardMaterial({ map: T.fabricTexture(color, stripe), side: THREE.DoubleSide, roughness: 0.32, envMapIntensity: 1.0 });
      this.world.wetMats.push(fab); fab.userData.env = 1;
      const start = doorGap ? doorGap / 2 : 0, len = Math.PI * 2 - (doorGap || 0);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 12, start, len, 0, Math.PI / 2), fab);
      dome.scale.y = sy || 0.72;
      // arrugas y lona que cede con el agua
      const P = dome.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = 1 - Math.sin(Math.atan2(z, x) * 4) * 0.025 * (y / r) - (y > r * 0.7 ? 0.04 : 0); P.setXYZ(i, x * k, y, z * k); }
      dome.geometry.computeVertexNormals();
      g.add(dome);
      // varillas cruzadas
      for (const a of [0.78, -0.78]) { const pole = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, 0.012, 5, 30, Math.PI), this.metal); pole.rotation.y = a; pole.scale.y = sy || 0.72; g.add(pole); }
      g.userData.fab = fab;
      if (doorGap) {
        // faldón de la puerta enrollado
        const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, r * 0.9, 8), fab); flap.rotation.z = 0.2; flap.position.set(-Math.cos(doorGap / 2) * r * 0.98, r * 0.45, Math.sin(doorGap / 2) * r * 0.98); g.add(flap);
      }
      // vientos con estacas
      const lineMat = new THREE.LineBasicMaterial({ color: 0x8c8c80 });
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2 + Math.PI / 4, top = new V3(Math.cos(a) * r * 0.75, r * 0.5, Math.sin(a) * r * 0.75), st = new V3(Math.cos(a) * r * 1.7, 0.05, Math.sin(a) * r * 1.7);
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, st]), lineMat));
      }
      return { g, fab };
    }
    _tents(at) {
      // carpa roja: se puede entrar (refugio con farol encendido)
      const red = at(-7, 5), R = 2.3;   // carpa familiar: ~1,9 m de alto, se puede entrar
      const t1 = this._dome(R, '#8e1d17', '#2a1210', 1.0, 0.82);
      // la lona deja pasar el resplandor del farol: brilla desde adentro
      t1.fab.emissive = new THREE.Color(0x6a1e08); t1.fab.emissiveIntensity = 0.38; this.redFab = t1.fab; t1.g.position.copy(red); t1.g.rotation.y = Math.PI; // la abertura de la esfera queda en +X, hacia el claro
      this.scene.add(this._shadow(t1.g));
      // colisión: perímetro salvo la puerta (+X)
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.55) continue; this._collide(red.x + Math.cos(a) * R, red.z - Math.sin(a) * R, 0.18); }
      // interior: piso, bolsa de dormir, mochila, farol
      const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.97, 24), new THREE.MeshStandardMaterial({ color: 0x3a1a14, roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.position.set(red.x, red.y + 0.03, red.z); this.scene.add(floor);
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.28, 1.2, 4, 10) : new THREE.CylinderGeometry(0.28, 0.28, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.5 }));
      bag.rotation.x = Math.PI / 2; bag.scale.y = 1; bag.scale.z = 0.45; bag.position.set(red.x - 0.4, red.y + 0.16, red.z + 0.3); bag.rotation.z = 0.3; this.scene.add(bag);
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.25), new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 0.7 })); pack.position.set(red.x - 0.9, red.y + 0.25, red.z - 0.6); pack.rotation.y = 0.5; this.scene.add(pack);
      const lamp = this._lantern(); lamp.position.set(red.x + 0.55, red.y + 0.04, red.z - 0.55); this.scene.add(lamp);
      this.tentLight = this._light(lamp.position.clone().add(new V3(0, 0.25, 0)), 0xffa64a, 1.4, 8);
      this._halo(lamp.position.clone().add(new V3(0, 0.12, 0)), 0.5);
      this.redTent = { pos: red, r: R };
      this.shelters.push({ name: 'carpa', level: 0.9, rain: 1, layer: 'tent', test: (x, z) => Math.hypot(x - red.x, z - red.z) < R * 0.85 });
      this.near.push({ pos: red, r: 5, layer: 'tent' });
      // diario dentro de la carpa
      this._item('diario', 'note', 'Leer el diario', new V3(red.x - 0.2, red.y + 0.32, red.z + 0.35), this._paper());
      // carpa naranja cerrada (más adelante: se mueve sola)
      const or = at(-13, -5), t2 = this._dome(1.5, '#b4561c', '#3a2414', 0); t2.g.position.copy(or); t2.g.rotation.y = 1.2; this.scene.add(this._shadow(t2.g));
      this.orangeTent = t2; this.near.push({ pos: or, r: 4, layer: 'tent' });
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; this._collide(or.x + Math.cos(a) * 1.5, or.z + Math.sin(a) * 1.5, 0.2); }
      // carpa verde derrumbada
      const gr = at(3, 11), t3 = this._dome(1.6, '#2f4a2e', '#18241a', 0);
      t3.g.position.copy(gr); t3.g.scale.set(1.15, 0.22, 1); t3.g.rotation.set(0.08, 2.1, 0.12); this.scene.add(this._shadow(t3.g));
      this._item('pilas1', 'battery', 'Agarrar las pilas', at(-11.6, -3.2).add(new V3(0, 0.05, 0)), this._battery());
    }
    _lantern() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 12), this.metal));
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }));
      glass.position.y = 0.1; g.add(glass);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.07, 12), this.metal); top.position.y = 0.2; g.add(top);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 4, 12), this.metal); ring.position.y = 0.25; g.add(ring);
      g.userData.glass = glass;
      return g;
    }
    _halo(pos, size) {
      const c = T.canvas(64, 64), g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,200,120,0.9)'); grd.addColorStop(0.3, 'rgba(255,150,60,0.35)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.tex(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.copy(pos); s.scale.setScalar(size); s.renderOrder = 6; this.scene.add(s); return s;
    }
    _light(pos, color, intensity, dist) {
      const L = new THREE.PointLight(color, intensity, dist, 1.4); L.position.copy(pos); this.scene.add(L);
      L.userData.base = intensity; this.lights.push(L); return L;
    }

    /* ---------- pabellón techado ---------- */
    _pavilion(p) {
      const g = new THREE.Group(); g.position.copy(p); g.rotation.y = 0.2;
      const W = 8, D = 5, H = 2.7;
      for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, -D / 2], [0, D / 2]]) {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, H, 0.2).translate(x, H / 2, z), this.woodDark));
      }
      // vigas y techo a dos aguas
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.18, 0.18).translate(0, H, -D / 2), this.woodDark));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.18, 0.18).translate(0, H, D / 2), this.woodDark));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.2, 0.2).translate(0, H + 1.0, 0), this.woodDark));
      for (const s of [-1, 1]) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 1.0, 0.06, D * 0.62), this.wood);
        roof.position.set(0, H + 0.55, s * D * 0.27); roof.rotation.x = s * 0.38; g.add(roof);
      }
      // mesas de picnic
      const table = (x, z) => {
        const t = new THREE.Group(); t.position.set(x, 0, z);
        t.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.8).translate(0, 0.76, 0), this.wood));
        for (const s of [-1, 1]) { t.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.28).translate(0, 0.45, s * 0.62), this.wood)); t.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 1.5).translate(s * 0.75, 0.38, 0), this.woodDark)); }
        g.add(t);
      };
      table(-2, 0); table(2, 0);
      // farol colgante
      const lamp = this._lantern(); lamp.position.set(0, H - 0.45, 0); g.add(lamp);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 3).translate(0, H - 0.05, 0), this.metal));
      this.scene.add(this._shadow(g)); g.updateMatrixWorld(true);
      const wp = new V3(); lamp.getWorldPosition(wp);
      this.pavLight = this._light(wp.clone().add(new V3(0, 0.1, 0)), 0xffb060, 3.4, 15);
      this._halo(wp.clone().add(new V3(0, 0.1, 0)), 0.9);
      // colisiones: postes y mesas
      const toW = (x, z) => new V3(x, 0, z).applyMatrix4(g.matrixWorld);
      [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, -D / 2], [0, D / 2]].forEach(([x, z]) => { const q = toW(x, z); this._collide(q.x, q.z, 0.22); });
      [-2, 2].forEach(x => { const a = toW(x - 0.7, 0), b = toW(x + 0.7, 0); this._wall(a.x, a.z, b.x, b.z, 0.55); });
      this.pav = { g, W, D, toW };
      this.shelters.push({ name: 'pabellón', level: 0.35, rain: 0.6, layer: 'roof', test: (x, z) => { const l = new V3(x, 0, z).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()); return Math.abs(l.x) < W / 2 + 0.3 && Math.abs(l.z) < D / 2 + 0.3; } });
      this.near.push({ pos: p, r: 9, layer: 'roof' });
      // libro de registro y pilas sobre las mesas
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.6 }));
      this._item('registro', 'note', 'Leer el libro de registro', toW(-2.3, 0.1).setY(p.y + 0.82), book);
      this._item('pilas2', 'battery', 'Agarrar las pilas', toW(2.4, -0.15).setY(p.y + 0.8), this._battery());
      // radio portátil (para eventos posteriores)
      const radio = new THREE.Group();
      radio.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.09), new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.4 })));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.35, 4), this.metal); ant.position.set(0.1, 0.24, 0); ant.rotation.z = -0.3; radio.add(ant);
      const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.04), new THREE.MeshBasicMaterial({ color: 0x3a5a2a })); dial.position.set(-0.05, 0.03, 0.047); radio.add(dial);
      radio.position.copy(toW(1.6, 0.2)).setY(p.y + 0.87); radio.rotation.y = 0.4; this.scene.add(radio);
      this.radio = { g: radio, dial, pos: radio.position.clone() };
    }

    /* ---------- fogatas apagadas ---------- */
    _fire(p, logs) {
      const g = new THREE.Group(); g.position.copy(p);
      const rock = new THREE.IcosahedronGeometry(0.18, 1);
      for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2, m = new THREE.Mesh(rock, this.stone); m.position.set(Math.cos(a) * 0.75, 0.06, Math.sin(a) * 0.75); m.scale.set(1 + Math.random() * 0.4, 0.7, 1); m.rotation.y = Math.random() * 3; g.add(m); }
      const ash = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), this.ash); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02; g.add(ash);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.3; g.add(new THREE.Mesh(T.limb([new V3(Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45), new V3(Math.cos(a) * 0.05, 0.22, Math.sin(a) * 0.05)], 0.05, 0.035, 6, 1), this.char)); }
      if (logs) for (const s of [-1, 1]) { const L = new THREE.Mesh(T.limb([new V3(-0.9, 0.22, s * 1.7), new V3(0.9, 0.24, s * 1.75)], 0.2, 0.18, 9, 0.5), this.woodDark); g.add(L); }
      this.scene.add(this._shadow(g));
      this._collide(p.x, p.z, 0.85);
      if (logs) for (const s of [-1, 1]) this._wall(p.x - 0.8, p.z + s * 1.72, p.x + 0.8, p.z + s * 1.72, 0.25);
    }
    _fires(at) { this._fire(at(-1, -1), true); this._fire(at(16, 5), false); }

    /* ---------- auto abandonado ---------- */
    _car(p) {
      const g = new THREE.Group(); g.position.copy(p); g.rotation.y = 0.35;
      const sh = new THREE.Shape();
      // perfil lateral de una rural vieja (largo 4.6 m)
      [[-2.3, 0.28], [-2.3, 0.75], [-2.2, 0.95], [-1.25, 1.02], [-0.95, 1.5], [1.65, 1.52], [1.95, 1.05], [2.3, 0.95], [2.3, 0.28]].forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
      const body = new THREE.ExtrudeGeometry(sh, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
      body.translate(0, 0, -0.86);
      const paint = new THREE.MeshStandardMaterial({ color: 0x3b4836, roughness: 0.28, metalness: 0.45, envMapIntensity: 1.3 });
      this.world.wetMats.push(paint); paint.userData.env = 1.3;
      g.add(new THREE.Mesh(body, paint));
      const glass = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.6 });
      this.world.wetMats.push(glass); glass.userData.env = 1.6;
      const win = new THREE.Shape(); [[-1.15, 1.06], [-0.9, 1.44], [1.6, 1.46], [1.85, 1.07]].forEach(([x, y], i) => i ? win.lineTo(x, y) : win.moveTo(x, y));
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.ShapeGeometry(win), glass); w.position.z = s * 0.93; if (s < 0) w.rotation.y = Math.PI, w.scale.x = -1; g.add(w); }
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), glass); ws.position.set(-1.1, 1.26, 0); ws.rotation.set(0, -Math.PI / 2, -0.95); g.add(ws);
      const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }), rim = new THREE.MeshStandardMaterial({ color: 0x777a7d, roughness: 0.3, metalness: 0.8 });
      for (const [x, z] of [[-1.45, 0.88], [1.45, 0.88], [-1.45, -0.88], [1.45, -0.88]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), tire); w.rotation.x = Math.PI / 2; w.position.set(x, 0.32, z); g.add(w);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.25, 12), rim); r.rotation.x = Math.PI / 2; r.position.set(x, 0.32, z); g.add(r);
      }
      for (const z of [-0.6, 0.6]) {
        const hl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.1, metalness: 0.5 })); hl.position.set(-2.37, 0.78, z); hl.rotation.y = -Math.PI / 2; g.add(hl);
        const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x5a0d0a, roughness: 0.3 })); tl.position.set(2.37, 0.8, z); tl.rotation.y = Math.PI / 2; g.add(tl);
      }
      // barro en las puertas
      const mud = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 1.84), new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.6, transparent: true, opacity: 0.55 })); mud.position.y = 0.45; g.add(mud);
      g.position.y -= 0.12; g.rotation.z = 0.03; // hundido en el barro
      this.scene.add(this._shadow(g)); g.updateMatrixWorld(true);
      const toW = (x, z) => new V3(x, 0, z).applyMatrix4(g.matrixWorld);
      const a = toW(-2.1, 0), b = toW(2.1, 0); this._wall(a.x, a.z, b.x, b.z, 1.0);
      this.car = { g, toW, door: toW(-0.3, 1.25).setY(p.y + 1.0) };
      this.near.push({ pos: p, r: 5, layer: 'metal' });
      this.items.push({ id: 'guantera', kind: 'key', label: 'Revisar la guantera', pos: toW(-0.7, 1.1).setY(p.y + 1.0), r: 2.6, mesh: null, taken: false });
      this._item('pilas3', 'battery', 'Agarrar las pilas', toW(1.4, 1.35).setY(this.world.groundHeight(toW(1.4, 1.35).x, toW(1.4, 1.35).z) + 0.04), this._battery());
    }

    /* ---------- cabaña del guardaparques ---------- */
    _cabin(p) {
      const g = new THREE.Group(); g.position.copy(p); g.rotation.y = -0.6;
      const W = 5, D = 4, H = 2.4, R = 0.13;
      const logWall = (x0, z0, x1, z1, gap) => {
        for (let y = R; y < H; y += R * 1.9) {
          if (gap) { const mid = 0.5, gw = 1.0 / Math.hypot(x1 - x0, z1 - z0) / 2; if (y < 2.05) {
            g.add(new THREE.Mesh(T.limb([new V3(x0, y, z0), new V3(x0 + (x1 - x0) * (mid - gw), y, z0 + (z1 - z0) * (mid - gw))], R, R, 7, 0.5), this.woodDark));
            g.add(new THREE.Mesh(T.limb([new V3(x0 + (x1 - x0) * (mid + gw), y, z0 + (z1 - z0) * (mid + gw)), new V3(x1, y, z1)], R, R, 7, 0.5), this.woodDark)); continue; } }
          g.add(new THREE.Mesh(T.limb([new V3(x0 - (x1 - x0) * 0.04, y, z0 - (z1 - z0) * 0.04), new V3(x1 + (x1 - x0) * 0.04, y, z1 + (z1 - z0) * 0.04)], R, R, 7, 0.5), this.woodDark));
        }
      };
      logWall(-W / 2, D / 2, W / 2, D / 2, true);   // frente con puerta (+Z)
      logWall(-W / 2, -D / 2, W / 2, -D / 2); logWall(-W / 2, -D / 2, -W / 2, D / 2); logWall(W / 2, -D / 2, W / 2, D / 2);
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 0.08, D * 0.66), this.wood); r.position.set(0, H + 0.62, s * D * 0.29); r.rotation.x = -s * 0.55; g.add(r); }
      const gable = new THREE.Shape(); gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, 1.25); gable.closePath();
      for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), this.woodDark); m.rotation.y = Math.PI / 2; m.position.set(s * W / 2, H, 0); m.material = this.woodDark; g.add(m); }
      // ventana y cartel
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: 0.05, metalness: 0.9 })); win.position.set(1.4, 1.4, D / 2 + R + 0.01); g.add(win);
      const c = T.canvas(256, 64), x = c.getContext('2d'); x.fillStyle = '#3d2a18'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#d8cfb8'; x.font = 'bold 26px Georgia, serif'; x.textAlign = 'center'; x.fillText('GUARDAPARQUES', 128, 42);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.5 })); sign.position.set(0, 2.3, D / 2 + R + 0.02); g.add(sign);
      // puerta articulada
      const hinge = new THREE.Group(); hinge.position.set(-0.5, 0, D / 2); g.add(hinge);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.06).translate(0.5, 1.0, 0), this.wood); hinge.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.metal); knob.position.set(0.88, 1.0, 0.05); hinge.add(knob);
      // interior: catre, mesa, estante
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 1.9).translate(-1.7, 0.22, -0.7), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.8 })); g.add(bed);
      const tbl = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.7).translate(1.4, 0.78, -1.2), this.wood); g.add(tbl);
      for (const [xx, zz] of [[0.95, -0.9], [1.85, -0.9], [0.95, -1.5], [1.85, -1.5]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.06).translate(xx, 0.39, zz), this.woodDark));
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.wood); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; g.add(floor);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.woodDark); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
      this.scene.add(this._shadow(g)); g.updateMatrixWorld(true);
      const toW = (x, z) => new V3(x, 0, z).applyMatrix4(g.matrixWorld);
      const wall = (a, b) => { const A = toW(...a), B = toW(...b); this._wall(A.x, A.z, B.x, B.z, 0.22); };
      wall([-W / 2, -D / 2], [W / 2, -D / 2]); wall([-W / 2, -D / 2], [-W / 2, D / 2]); wall([W / 2, -D / 2], [W / 2, D / 2]);
      wall([-W / 2, D / 2], [-0.6, D / 2]); wall([0.6, D / 2], [W / 2, D / 2]);
      // la puerta cerrada bloquea el paso: colisionador que se quita al abrir
      const dc = toW(0, D / 2); this.doorCollider = { x: dc.x, z: dc.z, r: 0.55 }; this.world.colliders.push(this.doorCollider);
      const k = ((dc.x / 8) | 0) + ':' + ((dc.z / 8) | 0); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const kk = (((dc.x / 8) | 0) + i) + ':' + (((dc.z / 8) | 0) + j); if (!this.world.cell.has(kk)) this.world.cell.set(kk, []); this.world.cell.get(kk).push(this.doorCollider); }
      this.cabin = { g, hinge, toW, W, D, open: false, doorPos: toW(0, D / 2 + 0.6).setY(p.y + 1.2), center: toW(0, -0.3) };
      this.items.push({ id: 'puerta', kind: 'door', label: 'Abrir la puerta de la cabaña', pos: this.cabin.doorPos, r: 2.4, mesh: null, taken: false });
      this.shelters.push({ name: 'cabaña', level: 0.85, rain: 1, layer: 'roof', test: (x, z) => { if (!this.cabin.open) return false; const l = new V3(x, 0, z).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()); return Math.abs(l.x) < W / 2 - 0.1 && Math.abs(l.z) < D / 2 - 0.05; } });
      this.near.push({ pos: p, r: 6, layer: 'roof' });
    }
    openDoor() {
      this.cabin.open = true; this.doorCollider.r = 0; this.cabin.opening = 0;
    }

    /* ---------- utilería del camping ---------- */
    _props(at) {
      // tacho de basura volcado, canilla, tendedero
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.85, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x2c3a2c, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
      const b = at(7, 2); bin.position.set(b.x, b.y + 0.3, b.z); bin.rotation.set(Math.PI / 2 - 0.1, 0.8, 0); this.scene.add(this._shadow(bin));
      const tap = at(13, -11); const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15).translate(0, 0.5, 0), this.woodDark); post.position.copy(tap); this.scene.add(post);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), this.metal); spout.rotation.z = Math.PI / 2; spout.position.set(tap.x + 0.12, tap.y + 0.8, tap.z); this.scene.add(spout);
      this._collide(tap.x, tap.z, 0.2);
      // reposeras abandonadas
      for (const [dx, dz, r] of [[-3, 7, 0.4], [-4.5, 8, 1.6]]) {
        const p = at(dx, dz), g = new THREE.Group(); g.position.copy(p); g.rotation.y = r;
        const fabric = new THREE.MeshStandardMaterial({ color: 0x1f3a5a, roughness: 0.4, side: THREE.DoubleSide });
        const seat = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.45), fabric); seat.rotation.x = -1.3; seat.position.y = 0.38; g.add(seat);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.55), fabric); back.rotation.x = -0.25; back.position.set(0, 0.68, -0.25); g.add(back);
        for (const s of [-1, 1]) g.add(new THREE.Mesh(T.limb([new V3(s * 0.25, 0, 0.25), new V3(s * 0.25, 0.9, -0.32)], 0.012, 0.012, 4, 1), this.metal));
        if (r > 1) g.rotation.z = 1.4; // volcada por el viento
        this.scene.add(this._shadow(g));
      }
    }

    /* ---------- refugio de troncos a mitad del sendero ---------- */
    _leanTo() {
      const P = T.pathCurve.getPointAt(0.55), Q2 = T.pathCurve.getPointAt(0.56);
      const dx = Q2.x - P.x, dz = Q2.z - P.z, l = Math.hypot(dx, dz), nx = dz / l, nz = -dx / l;
      const x = P.x + nx * 5.5, z = P.z + nz * 5.5, y = this.world.groundHeight(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(-nx, -nz);
      const W = 3.2, D = 2.2;
      for (const s of [-1, 1]) {
        g.add(new THREE.Mesh(T.limb([new V3(s * W / 2, -0.2, D / 2), new V3(s * W / 2, 2.0, D / 2)], 0.1, 0.08, 7, 0.5), this.woodDark));
        g.add(new THREE.Mesh(T.limb([new V3(s * W / 2, -0.2, -D / 2), new V3(s * W / 2, 0.9, -D / 2)], 0.1, 0.08, 7, 0.5), this.woodDark));
      }
      // techo inclinado de troncos y pared trasera
      for (let i = 0; i < 9; i++) { const t = i / 8; g.add(new THREE.Mesh(T.limb([new V3(-W / 2 - 0.2, 2.0 - t * 1.15, D / 2 - t * D), new V3(W / 2 + 0.2, 2.0 - t * 1.15, D / 2 - t * D)], 0.11, 0.1, 7, 0.4), this.wood)); }
      for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(T.limb([new V3(-W / 2, 0.15 + i * 0.22, -D / 2 - 0.05), new V3(W / 2, 0.15 + i * 0.22, -D / 2 - 0.05)], 0.1, 0.1, 7, 0.4), this.woodDark));
      this.scene.add(this._shadow(g)); g.updateMatrixWorld(true);
      const toW = (a, b) => new V3(a, 0, b).applyMatrix4(g.matrixWorld);
      const A = toW(-W / 2, -D / 2 - 0.1), B = toW(W / 2, -D / 2 - 0.1); this._wall(A.x, A.z, B.x, B.z, 0.2);
      for (const s of [-1, 1]) { const q = toW(s * W / 2, D / 2); this._collide(q.x, q.z, 0.15); }
      this.leanTo = { pos: new V3(x, y, z) };
      this.shelters.push({ name: 'refugio', level: 0.4, rain: 0.7, layer: 'roof', test: (px, pz) => { const l = new V3(px, 0, pz).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()); return Math.abs(l.x) < W / 2 && l.z > -D / 2 && l.z < D / 2 - 0.2; } });
      this.near.push({ pos: this.leanTo.pos, r: 6, layer: 'roof' });
      this._item('pilas4', 'battery', 'Agarrar las pilas', toW(0.6, -0.4).setY(y + 0.05), this._battery());
    }

    _campPuddles(at) { [[2, -6, 1.8], [6, 9, 1.2], [-9, -11, 1.5], [12, 1, 1.1], [-2, 14, 1.4], [8, -15, 1.3]].forEach(([dx, dz, r]) => { const p = at(dx, dz); this.world.addPuddle(p.x, p.z, r); }); }

    /* ---------- objetos recogibles ---------- */
    _paper() { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.7, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.rotation.z = 0.4; return m; }
    _battery() {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xc28a1a, roughness: 0.3, metalness: 0.6 }));
        b.rotation.z = Math.PI / 2; b.position.z = s * 0.016; g.add(b);
      }
      g.scale.setScalar(2.2); return g;
    }
    _item(id, kind, label, pos, mesh) {
      if (mesh) { mesh.position.copy(pos); this.scene.add(mesh); }
      this.items.push({ id, kind, label, pos, mesh, r: 2.4, taken: false });
    }
    take(it) { it.taken = true; if (it.mesh) this.scene.remove(it.mesh); }

    // estado del entorno para el audio y la lluvia
    shelterAt(x, z) { for (const s of this.shelters) if (s.test(x, z)) return s; return null; }
    near = [];
    layersAt(x, z) {
      const out = { tent: 0, roof: 0, metal: 0 };
      for (const n of this.near) { const d = Math.hypot(n.pos.x - x, n.pos.z - z); out[n.layer] = Math.max(out[n.layer], Math.max(0, 1 - d / n.r) * 0.35); }
      return out;
    }

    update(dt, time) {
      // faroles que titilan; la puerta se abre con inercia
      for (const L of this.lights) L.intensity = L.userData.base * (0.85 + Math.sin(time * 13 + L.position.x) * 0.05 + Math.random() * 0.1);
      if (this.cabin.open && this.cabin.opening < 1) { this.cabin.opening = Math.min(1, this.cabin.opening + dt * 0.7); this.cabin.hinge.rotation.y = -Math.sin(this.cabin.opening * Math.PI / 2) * 1.7; }
    }
  }

  window.TS.Camp = Camp;
})();
