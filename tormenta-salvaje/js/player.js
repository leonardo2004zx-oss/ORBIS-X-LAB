/* TORMENTA SALVAJE — jugador en primera persona: controles, movimiento, resistencia, pasos y linterna */
(function () {
  'use strict';
  const T = window.TS, V3 = THREE.Vector3;

  /* ---------------- Entrada (teclado/ratón y táctil) ---------------- */
  class Input {
    constructor(canvas, ui) {
      this.keys = {}; this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 };
      this.run = false; this.sens = 1; this.onAction = () => {};
      this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
      this.canvas = canvas; this.enabled = false;
      addEventListener('keydown', e => {
        if (!this.enabled && e.code !== 'Escape' && e.code !== 'KeyM' && e.code !== 'Tab') return;
        this.keys[e.code] = true;
        if (e.code === 'KeyE') this.onAction('interact');
        if (e.code === 'KeyF') this.onAction('flashlight');
        if (e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); this.onAction('map'); }
        if (e.code === 'Escape') this.onAction('pause');
      });
      addEventListener('keyup', e => { this.keys[e.code] = false; });
      // ratón: pointer lock si el navegador lo permite; si no, arrastrar
      canvas.addEventListener('click', () => { if (this.enabled && !this.touch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } });
      document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked && this.enabled && !this.touch && this._wasLocked) this.onAction('pause'); this._wasLocked = this.locked; });
      let drag = null;
      canvas.addEventListener('mousedown', e => { if (!this.locked) drag = { x: e.clientX, y: e.clientY }; });
      addEventListener('mouseup', () => { drag = null; });
      addEventListener('mousemove', e => {
        if (!this.enabled) return;
        if (this.locked) { this.look.x += e.movementX * 0.0022 * this.sens; this.look.y += e.movementY * 0.0022 * this.sens; }
        else if (drag) { this.look.x += (e.clientX - drag.x) * 0.004 * this.sens; this.look.y += (e.clientY - drag.y) * 0.004 * this.sens; drag.x = e.clientX; drag.y = e.clientY; }
      });
      this._touchUI(ui);
    }
    _touchUI(ui) {
      const stick = ui.stick, knob = ui.knob, lookZone = ui.lookZone;
      let sid = null, sc = null; const lk = new Map();
      const R = 52;
      stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; sid = t.identifier; const b = stick.getBoundingClientRect(); sc = { x: b.left + b.width / 2, y: b.top + b.height / 2 }; this._stick(t, sc, R, knob); }, { passive: false });
      stick.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === sid) this._stick(t, sc, R, knob); }, { passive: false });
      const endS = e => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; this.move.x = 0; this.move.y = 0; knob.style.transform = 'translate(-50%,-50%)'; } };
      stick.addEventListener('touchend', endS); stick.addEventListener('touchcancel', endS);
      lookZone.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) lk.set(t.identifier, { x: t.clientX, y: t.clientY }); }, { passive: false });
      lookZone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) { const p = lk.get(t.identifier); if (!p) continue; this.look.x += (t.clientX - p.x) * 0.0055 * this.sens; this.look.y += (t.clientY - p.y) * 0.0055 * this.sens; p.x = t.clientX; p.y = t.clientY; }
      }, { passive: false });
      const endL = e => { for (const t of e.changedTouches) lk.delete(t.identifier); };
      lookZone.addEventListener('touchend', endL); lookZone.addEventListener('touchcancel', endL);
      const hold = (el, on) => {
        el.addEventListener('touchstart', e => { e.preventDefault(); on(true); el.classList.add('on'); }, { passive: false });
        const off = e => { on(false); el.classList.remove('on'); }; el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
      };
      hold(ui.runBtn, v => { this.runTouch = v; });
      const tap = (el, a) => el.addEventListener('touchstart', e => { e.preventDefault(); this.onAction(a); }, { passive: false });
      tap(ui.useBtn, 'interact'); tap(ui.lightBtn, 'flashlight');
      ui.pauseBtn.addEventListener('click', () => this.onAction('pause'));
    }
    _stick(t, c, R, knob) {
      let dx = t.clientX - c.x, dy = t.clientY - c.y; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.move.x = dx / R; this.move.y = -dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    axes() {
      let x = this.move.x, y = this.move.y;
      if (this.keys.KeyW || this.keys.ArrowUp) y += 1; if (this.keys.KeyS || this.keys.ArrowDown) y -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) x += 1; if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y, run: !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.runTouch) };
    }
    takeLook() { const l = { x: this.look.x, y: this.look.y }; this.look.x = 0; this.look.y = 0; return l; }
  }

  /* ---------------- Linterna en mano ---------------- */
  class Flashlight {
    constructor(scene, camera, Q) {
      this.on = true; this.battery = 1; this.flicker = 0;
      const L = this.light = new THREE.SpotLight(0xffe6c2, 2.8, 46, 0.38, 0.45, 0.95);
      L.castShadow = !!Q.shadows;
      if (Q.shadows) { L.shadow.mapSize.set(Q.shadows, Q.shadows); L.shadow.camera.near = 0.3; L.shadow.camera.far = 32; L.shadow.bias = -0.0015; L.shadow.radius = 2; }
      scene.add(L); scene.add(L.target);
      // haz volumétrico: discos de luz a lo largo del eje (se ven bien desde la primera persona),
      // con ruido animado para que parezca neblina y lluvia iluminada
      this.coneU = { uTime: { value: 0 }, uI: { value: 1 } };
      const sliceMat = new THREE.ShaderMaterial({
        uniforms: this.coneU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'attribute float aK; varying vec2 vUv; varying float vK; varying vec3 vW; void main(){ vUv=uv; vK=aK; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
        fragmentShader: `uniform float uTime, uI; varying vec2 vUv; varying float vK; varying vec3 vW;
          float h(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}
          float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
          void main(){
            float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
            float prof = pow(1.0 - r, 1.7) * (0.35 + 0.65 * smoothstep(0.0, 0.5, 1.0 - r));
            float mist = 0.45 + 0.55 * n3(vW * 0.9 + vec3(uTime * 0.4, -uTime * 1.2, uTime * 0.3));
            float fall = (1.0 - vK) * (1.0 - vK);
            gl_FragColor = vec4(vec3(1.0, 0.9, 0.74) * prof * mist * fall * 0.075 * uI, 1.0);
          }`,
      });
      const slices = Q.beam || 14, geos = [];
      for (let i = 0; i < slices; i++) {
        const k = (i + 0.5) / slices, d = 0.6 + k * k * 17, rad = Math.tan(0.36) * d + 0.05;
        const g = new THREE.PlaneGeometry(rad * 2, rad * 2); g.translate(0, 0, -d);
        g.setAttribute('aK', new THREE.Float32BufferAttribute(new Array(4).fill(k), 1));
        geos.push(g);
      }
      const merged = new THREE.BufferGeometry();
      const pos = [], uv = [], ak = [], idx = []; let off = 0;
      geos.forEach(g => { pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); ak.push(...g.attributes.aK.array); g.index.array.forEach(i => idx.push(i + off)); off += 4; });
      merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); merged.setAttribute('aK', new THREE.Float32BufferAttribute(ak, 1)); merged.setIndex(idx);
      this.cone = new THREE.Mesh(merged, sliceMat);
      this.cone.frustumCulled = false; this.cone.renderOrder = 7; scene.add(this.cone);
      // mano con guante, manga mojada y linterna
      this.hand = this._handModel(); camera.add(this.hand);
      this.dir = new V3(0, 0, -1); this.pos = new V3();
      this.cos = Math.cos(0.38 * 0.8);
    }
    _handModel() {
      const g = new THREE.Group();
      const glove = new THREE.MeshStandardMaterial({ color: 0x080807, roughness: 0.75, metalness: 0.0, fog: false, envMapIntensity: 0.12 });
      const sleeve = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.25, metalness: 0.1, fog: false, envMapIntensity: 0.5 });
      const metal = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.3, metalness: 0.85, fog: false, envMapIntensity: 0.5 });
      // linterna (eje −Z)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.22, 16), metal); body.rotation.x = Math.PI / 2; g.add(body);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.07, 18), metal); head.rotation.x = Math.PI / 2; head.position.z = -0.14; g.add(head);
      this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: 0xfff1d6, fog: false }));
      this.lens.position.z = -0.176; this.lens.rotation.y = Math.PI; g.add(this.lens);
      for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0025, 6, 16), metal); r.position.z = 0.02 + i * 0.012; g.add(r); }
      // puño: nudillos y pulgar alrededor del cuerpo
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), glove); fist.scale.set(1.15, 0.95, 1.5); fist.position.set(0.012, -0.004, 0.035); g.add(fist);
      const fingers = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), glove); fingers.scale.set(0.9, 1.25, 1.9); fingers.position.set(-0.022, -0.006, 0.03); g.add(fingers);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.012, 0.04, 4, 8) : new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), glove);
      thumb.rotation.x = Math.PI / 2.4; thumb.position.set(0.006, 0.032, 0.0); g.add(thumb);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 14), glove); wrist.rotation.x = Math.PI / 2; wrist.position.set(0.02, -0.02, 0.12); g.add(wrist);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.5, 16), sleeve); arm.rotation.x = Math.PI / 2.2; arm.position.set(0.04, -0.07, 0.38); g.add(arm);
      g.position.set(0.21, -0.23, -0.48);
      g.rotation.set(0.04, 0.1, 0); g.scale.setScalar(0.9);
      g.traverse(o => { o.renderOrder = 20; });
      return g;
    }
    toggle() { this.on = !this.on; }
    update(dt, time, camera, moveAmt, runAmt) {
      // la luz sigue la mirada con un leve retraso y vaivén al caminar
      const want = new V3(); camera.getWorldDirection(want);
      this.dir.lerp(want, 1 - Math.exp(-dt * 11)).normalize();
      const right = new V3().crossVectors(want, camera.up).normalize();
      this.pos.copy(camera.position).addScaledVector(right, 0.18).add(new V3(0, -0.2, 0)).addScaledVector(want, 0.2);
      if (this.on) this.battery = Math.max(0, this.battery - dt / 720);   // ~12 min de luz por carga completa
      let I = this.on ? 1 : 0;
      if (this.on && this.battery < 0.2 && Math.random() < 0.02) this.flicker = 0.15;
      if (this.flicker > 0) { this.flicker -= dt; I *= Math.random() < 0.5 ? 0.1 : 0.7; }
      I *= 0.6 + 0.4 * Math.min(1, this.battery / 0.3);
      if (this.battery <= 0.02) I *= 0.08 + Math.random() * 0.06;          // sin pilas: apenas un resplandor
      const L = this.light;
      L.intensity = 2.8 * I; L.position.copy(this.pos); L.target.position.copy(this.pos).addScaledVector(this.dir, 10);
      this.cone.position.copy(this.pos).addScaledVector(this.dir, 0.05);
      this.cone.lookAt(this.pos.clone().add(this.dir));
      this.cone.rotateY(Math.PI);
      this.cone.visible = I > 0.02; this.coneU.uI.value = I; this.coneU.uTime.value = time;
      this.lens.material.color.setScalar(0.25 + I * 0.75);
      // balanceo de la mano
      const bob = Math.sin(time * (runAmt ? 11 : 7)) * 0.006 * moveAmt, sway = Math.cos(time * (runAmt ? 5.5 : 3.5)) * 0.008 * moveAmt;
      this.hand.position.set(0.21 + sway, -0.23 + bob - runAmt * 0.03, -0.48);
      this.hand.rotation.x = 0.06 + runAmt * 0.12 + bob * 2;
      return I;
    }
  }

  /* ---------------- Jugador ---------------- */
  class Player {
    constructor(world, camera, audio, splashes) {
      this.world = world; this.camera = camera; this.audio = audio; this.splashes = splashes;
      this.pos = new V3(0, 0, 172); this.yaw = 0; this.pitch = 0; this.vel = new V3();
      this.stamina = 1; this.exertion = 0.1; this.stride = 0; this.bob = 0; this.moving = 0; this.running = 0;
      this.eye = 1.62; this.surface = 'mud';
    }
    surfaceAt(x, z) {
      for (const p of this.world.puddles) if ((p.x - x) ** 2 + (p.z - z) ** 2 < p.r * p.r * 0.55) return 'puddle';
      return T.distToPath(x, z) > 2.6 ? 'leaves' : 'mud';
    }
    update(dt, input, frozen) {
      const lk = input.takeLook();
      this.yaw -= lk.x; this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - lk.y));
      const ax = frozen ? { x: 0, y: 0, run: false } : input.axes();
      const mag = Math.min(1, Math.hypot(ax.x, ax.y));
      const wantRun = ax.run && mag > 0.3 && this.stamina > 0.05 && ax.y > -0.2;
      const runK = wantRun ? 1 : 0;
      this.running += (runK - this.running) * (1 - Math.exp(-dt * 5));
      // pendiente: subir cuesta más
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x;
      const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
      const h0 = this.world.groundHeight(this.pos.x, this.pos.z), h1 = this.world.groundHeight(this.pos.x + mx * 0.6, this.pos.z + mz * 0.6);
      const slope = (h1 - h0) / 0.6;
      const surf = this.surfaceAt(this.pos.x, this.pos.z);
      let speed = (1.75 + this.running * 2.6) * mag * Math.max(0.45, 1 - Math.max(0, slope) * 0.9) * (surf === 'puddle' ? 0.85 : 1);
      const tx = mx * speed, tz = mz * speed;
      const acc = 1 - Math.exp(-dt * (mag > 0 ? 7 : 9));
      this.vel.x += (tx - this.vel.x) * acc; this.vel.z += (tz - this.vel.z) * acc;
      let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      // colisiones con troncos, rocas y estructuras
      for (let it = 0; it < 2; it++) for (const c of this.world.collidersNear(nx, nz)) {
        const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + 0.32;
        if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; }
      }
      const lim = T.HALF - 6; nx = Math.max(-lim, Math.min(lim, nx)); nz = Math.max(-lim, Math.min(lim, nz)); // borde del terreno
      const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.pos.x = nx; this.pos.z = nz; this.pos.y = this.world.groundHeight(nx, nz);
      this.moving = Math.min(1, moved / dt / 1.75);
      // resistencia y respiración
      if (this.running > 0.5 && moved > 0) this.stamina = Math.max(0, this.stamina - dt / 11);
      else this.stamina = Math.min(1, this.stamina + dt / (this.moving > 0.2 ? 16 : 7));
      const exT = Math.max(this.running * this.moving * 0.85, (1 - this.stamina) * 0.9, 0.08);
      this.exertion += (exT - this.exertion) * (1 - Math.exp(-dt * (exT > this.exertion ? 0.9 : 0.25)));
      // pasos
      this.stride += moved;
      const strideLen = 0.72 + this.running * 0.45;
      if (this.stride >= strideLen) {
        this.stride -= strideLen; this.surface = surf;
        this.audio.step(surf, this.running > 0.5);
        if (surf === 'puddle') this.splashes.spawn(this.pos.x, this.pos.y + 0.03, this.pos.z, 10);
      }
      this.bob += moved * (Math.PI / strideLen);
      // cámara: balanceo de cabeza suave
      const c = this.camera, bobY = Math.sin(this.bob * 2) * 0.035 * this.moving * (1 + this.running * 0.6), bobX = Math.cos(this.bob) * 0.025 * this.moving;
      this.eye += ((this.crouch ? 1.28 : 1.62) - this.eye) * (1 - Math.exp(-dt * 6));   // agacharse dentro de la carpa
      c.position.set(this.pos.x + rx * bobX, this.pos.y + this.eye + bobY, this.pos.z + rz * bobX);
      c.rotation.set(0, 0, 0); c.rotation.order = 'YXZ';
      c.rotation.y = this.yaw; c.rotation.x = this.pitch; c.rotation.z = -bobX * 0.15;
    }
  }

  Object.assign(window.TS, { Input, Flashlight, Player });
})();
