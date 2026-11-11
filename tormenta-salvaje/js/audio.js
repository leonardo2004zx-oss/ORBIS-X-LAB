/* TORMENTA SALVAJE — motor de audio (Web Audio API)
 *
 * Todo se sintetiza: no hay archivos externos ni licencias de terceros.
 * Las texturas complejas (lluvia sobre hojas, barro, charcos, truenos, pasos) se
 * generan muestra a muestra al iniciar —miles de gotas individuales con su propia
 * resonancia— y se reproducen en bucle con variaciones; no son osciladores simples.
 *
 * Buses:  exterior (lluvia, viento, truenos) → filtro de refugio ─┐
 *         jugador (pasos, respiración, ropa) ─────────────────────┼→ compresor → master
 *         posicional (HRTF: crujidos, eventos) → reverb del bosque ┘
 */
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);

  class StormAudio {
    constructor() { this.ready = false; this.vol = { master: 0.9, rain: 1, thunder: 1 }; this.stats = {}; }

    init() {
      if (this.ready) return this.ctx.resume();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
      const sr = this.sr = ctx.sampleRate;

      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
      this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
      this.comp.connect(this.master); this.master.connect(ctx.destination);
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.master.connect(this.analyser); this._ab = new Float32Array(512);

      // reverb del bosque: difusa, oscura, ~2,4 s
      this.reverb = ctx.createConvolver(); this.reverb.buffer = this._ir(2.6, 2.2);
      this.revIn = ctx.createGain(); this.revOut = ctx.createGain(); this.revOut.gain.value = 0.55;
      this.revIn.connect(this.reverb); this.reverb.connect(this.revOut); this.revOut.connect(this.comp);

      // bus exterior con filtro de refugio (dentro de carpa/auto se amortigua)
      this.outdoor = ctx.createGain();
      this.shelterLP = ctx.createBiquadFilter(); this.shelterLP.type = 'lowpass'; this.shelterLP.frequency.value = 20000; this.shelterLP.Q.value = 0.5;
      this.outdoor.connect(this.shelterLP); this.shelterLP.connect(this.comp);
      this.duck = ctx.createGain(); this.duck.gain.value = 1;      // silencios repentinos
      this.duck.connect(this.outdoor);
      this.rainBus = ctx.createGain(); this.rainBus.connect(this.duck);
      this.thunderBus = ctx.createGain(); this.thunderBus.connect(this.outdoor); this.thunderBus.connect(this.revIn);
      this.windBus = ctx.createGain(); this.windBus.connect(this.duck);
      this.player = ctx.createGain(); this.player.gain.value = 0.9; this.player.connect(this.comp);
      this.pos3d = ctx.createGain(); this.pos3d.connect(this.shelterLP); this.pos3d.connect(this.revIn);

      // ruidos base
      this.white = this._noise(3, 0); this.pink = this._noise(3, 1); this.brown = this._noise(4, 2);

      // --- texturas de lluvia (estéreo, en bucle) ---
      this.bufs = {
        leaves: this._renderDrops(5, 2600, 2400, 7200, 0.0012, 0.004, 0.55),
        mud: this._renderDrops(5, 1300, 260, 1400, 0.004, 0.014, 0.8, true),
        puddle: this._renderBubbles(5, 240),
        thunderFar: [this._renderThunder(false), this._renderThunder(false)],
        thunderNear: [this._renderThunder(true), this._renderThunder(true)],
        stepMud: [0, 1, 2, 3, 4, 5].map(() => this._renderStep('mud')),
        stepPuddle: [0, 1, 2, 3].map(() => this._renderStep('puddle')),
        stepLeaves: [0, 1, 2, 3].map(() => this._renderStep('leaves')),
        snap: [0, 1, 2].map(() => this._renderSnap()),
        cloth: [0, 1, 2, 3].map(() => this._renderCloth()),
      };
      this._rainLayers(); this._windLayers(); this._breathLayer();
      this.ready = true;
      document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend(); else ctx.resume(); });
      return ctx.resume();
    }

    setVolumes(v) {
      Object.assign(this.vol, v); if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
      this.rainBus.gain.setTargetAtTime(this.vol.rain, t, 0.05);
      this.thunderBus.gain.setTargetAtTime(this.vol.thunder, t, 0.05);
    }
    level() { if (!this.ready) return 0; this.analyser.getFloatTimeDomainData(this._ab); let s = 0; for (const x of this._ab) s += x * x; return Math.sqrt(s / this._ab.length); }
    _c(k) { this.stats[k] = (this.stats[k] || 0) + 1; }

    /* ================= síntesis de buffers ================= */
    _noise(sec, kind) {
      const n = Math.floor(sec * this.sr), b = this.ctx.createBuffer(1, n, this.sr), d = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, l = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 0) d[i] = w;
        else if (kind === 1) { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.03) * 3; }
        else { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; }
      }
      return b;
    }
    _ir(sec, rt) {
      const n = Math.floor(sec * this.sr), b = this.ctx.createBuffer(2, n, this.sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c); let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / this.sr, a = 0.6 + 0.38 * Math.min(1, t / sec);
          lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
          d[i] = lp * Math.exp(-6.9 * t / rt) * Math.min(1, t / 0.015) * 2;
        }
      }
      return b;
    }
    // miles de gotas: cada una es un pulso amortiguado con su propia resonancia
    _renderDrops(sec, perSec, f0, f1, d0, d1, amp, soft) {
      const sr = this.sr, n = Math.floor(sec * sr), b = this.ctx.createBuffer(2, n, sr);
      const L = b.getChannelData(0), R = b.getChannelData(1), N = Math.floor(perSec * sec);
      for (let k = 0; k < N; k++) {
        const st = Math.floor(Math.random() * n), f = f0 * Math.pow(f1 / f0, Math.random()), dur = rnd(d0, d1);
        const len = Math.floor(dur * sr * 4), a = Math.pow(Math.random(), 2.4) * amp, pan = Math.random(), w = 2 * Math.PI * f / sr;
        let ph = Math.random() * 6.28;
        for (let i = 0; i < len; i++) {
          const t = i / sr, env = (soft ? Math.min(1, i / (sr * 0.0015)) : 1) * Math.exp(-t / dur);
          ph += w * (1 + (soft ? 0.25 * Math.exp(-t / dur) : 0));
          const s = (Math.sin(ph) * 0.7 + (Math.random() * 2 - 1) * (soft ? 0.6 : 0.3)) * env * a;
          const j = (st + i) % n; L[j] += s * (1 - pan * 0.8); R[j] += s * (0.2 + pan * 0.8);
        }
      }
      return b;
    }
    // gotas en charcos: "plink" de burbuja con el tono subiendo
    _renderBubbles(sec, perSec) {
      const sr = this.sr, n = Math.floor(sec * sr), b = this.ctx.createBuffer(2, n, sr);
      const L = b.getChannelData(0), R = b.getChannelData(1);
      for (let k = 0; k < perSec * sec; k++) {
        const st = Math.floor(Math.random() * n), f = rnd(650, 2100), dur = rnd(0.012, 0.04), a = Math.pow(Math.random(), 2) * 0.5, pan = Math.random();
        let ph = 0; const len = Math.floor(dur * 4 * sr);
        for (let i = 0; i < len; i++) {
          const t = i / sr; ph += 2 * Math.PI * f * (1 + t / dur * 0.4) / sr;
          const s = Math.sin(ph) * Math.exp(-t / dur) * a * Math.min(1, i / 30);
          const j = (st + i) % n; L[j] += s * (1 - pan); R[j] += s * pan;
        }
        // impacto previo
        for (let i = 0; i < 90; i++) { const s = (Math.random() * 2 - 1) * a * 0.4 * Math.exp(-i / 25); const j = (st - 90 + i + n) % n; L[j] += s; R[j] += s; }
      }
      return b;
    }
    // trueno: retumbos superpuestos de ruido grave; el cercano empieza con un chasquido desgarrador
    _renderThunder(near) {
      const sr = this.sr, sec = near ? 10 : 11, n = Math.floor(sec * sr), b = this.ctx.createBuffer(2, n, sr);
      const rolls = []; const nr = near ? 6 : 5;
      for (let i = 0; i < nr; i++) rolls.push({ t: (near ? 0.25 : 0.5) + Math.pow(Math.random(), 1.4) * (near ? 5 : 6.5), w: rnd(0.4, 1.4), a: rnd(0.4, 1) * (i === 0 ? 1 : 0.8) });
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c); let l1 = 0, l2 = 0, l3 = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          let env = 0;
          for (const r of rolls) { const x = (t - r.t) / r.w; if (x > -3 && x < 6) env += r.a * (x < 0 ? Math.exp(-x * x * 2) : Math.exp(-x * 0.9)); }
          const attack = Math.min(1, t / (near ? 0.04 : 0.6));
          const w = Math.random() * 2 - 1;
          l1 = l1 * 0.985 + w * 0.015; l2 = l2 * 0.94 + w * 0.06; l3 = l3 * 0.8 + w * 0.2;
          let s = (l1 * 9 + l2 * 1.6 * (near ? 1.2 : 0.5)) * env * attack;
          s *= 0.7 + 0.3 * Math.sin(t * rnd(2, 3) + c);       // aleteo
          if (near) {
            // chasquido inicial con crepitado
            if (t < 0.35) s += (w * 0.9 + l3 * 1.5) * Math.exp(-t / 0.07) * (Math.random() < 0.3 ? 2.2 : 1) * 1.4;
            if (t < 1.2) s += Math.sin(t * 2 * Math.PI * (55 - t * 20)) * Math.exp(-t / 0.5) * 0.9;
          }
          d[i] = Math.tanh(s * 0.9) * 0.95;
        }
      }
      return b;
    }
    _renderStep(kind) {
      const sr = this.sr, sec = 0.45, n = Math.floor(sec * sr), b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      let lp = 0, ph = 0, bp1 = 0, bp2 = 0;
      const fStart = rnd(900, 1400), fEnd = rnd(250, 420);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        let s = 0;
        if (kind === 'mud') {
          // golpe sordo + chapoteo pegajoso con succión al despegar la bota
          s += Math.sin(t * 2 * Math.PI * rnd(70, 75)) * Math.exp(-t / 0.03) * 0.8;
          const f = fStart + (fEnd - fStart) * Math.min(1, t / 0.14), wf = 2 * Math.PI * f / sr, r = 0.96;
          const y = w * 0.4 + 2 * r * Math.cos(wf) * bp1 - r * r * bp2; bp2 = bp1; bp1 = y;
          s += y * 0.09 * Math.exp(-t / 0.09) * Math.min(1, t / 0.006);
          if (t > 0.17 && t < 0.24) { ph += 2 * Math.PI * (280 + (t - 0.17) * 2000) / sr; s += Math.sin(ph) * Math.exp(-(t - 0.17) / 0.02) * 0.25; }
        } else if (kind === 'puddle') {
          lp = lp * 0.6 + w * 0.4;
          s += (w - lp) * Math.exp(-t / 0.07) * 0.7 + lp * Math.exp(-t / 0.12) * 0.5;
          if (Math.random() < 0.004 && t < 0.3) { ph = 0; }
          ph += 2 * Math.PI * (700 + t * 1500) / sr; s += Math.sin(ph) * Math.exp(-((t - 0.05) ** 2) / 0.0008) * 0.3;
          s += Math.sin(t * 2 * Math.PI * 80) * Math.exp(-t / 0.03) * 0.5;
        } else {
          // hojas mojadas y ramitas: crujido corto
          lp = lp * 0.3 + w * 0.7;
          s += lp * Math.exp(-t / 0.08) * (Math.random() < 0.08 ? 2.5 : 0.6) * 0.5;
          s += Math.sin(t * 2 * Math.PI * 90) * Math.exp(-t / 0.025) * 0.6;
        }
        d[i] = s;
      }
      return b;
    }
    _renderSnap() {
      const sr = this.sr, n = Math.floor(0.6 * sr), b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      let hp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1, h = w - hp; hp = w;
        let s = h * Math.exp(-t / 0.006) * 2.2;                                            // quiebre
        if (t > 0.01 && t < 0.18) s += h * (Math.random() < 0.06 ? 1.5 : 0.1) * Math.exp(-(t - 0.01) / 0.05); // astillas
        s += Math.sin(t * 2 * Math.PI * 180) * Math.exp(-t / 0.04) * 0.6;                   // golpe de madera
        d[i] = s;
      }
      return b;
    }
    _renderCloth() {
      const sr = this.sr, n = Math.floor(0.35 * sr), b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      let lp = 0, hp = 0; const dur = rnd(0.12, 0.22);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1; lp = lp * 0.5 + w * 0.5; const h = lp - hp; hp = lp;
        const env = Math.sin(Math.min(1, t / dur) * Math.PI) * (t < dur ? 1 : 0);
        d[i] = h * env * (0.6 + 0.4 * Math.random()) * 0.5;
      }
      return b;
    }

    /* ================= capas continuas ================= */
    _loop(buf, gain, out, rate) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate;
      const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(out); s.start(0, Math.random() * buf.duration);
      return g;
    }
    _rainLayers() {
      const ctx = this.ctx;
      // lluvia torrencial general: ruido rosa conformado
      const wash = ctx.createBufferSource(); wash.buffer = this.pink; wash.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
      this.washG = ctx.createGain(); this.washG.gain.value = 0;
      wash.connect(hp); hp.connect(lp); lp.connect(this.washG); this.washG.connect(this.rainBus); wash.start();
      // detalle: hojas, barro y charcos (dos copias desfasadas para que el bucle no se note)
      this.leavesG = ctx.createGain(); this.leavesG.connect(this.rainBus);
      this._loop(this.bufs.leaves, 0.5, this.leavesG, 1); this._loop(this.bufs.leaves, 0.5, this.leavesG, 0.93);
      this.mudG = ctx.createGain(); this.mudG.connect(this.rainBus);
      this._loop(this.bufs.mud, 0.6, this.mudG, 1); this._loop(this.bufs.mud, 0.5, this.mudG, 1.07);
      this.puddleG = ctx.createGain(); this.puddleG.gain.value = 0; this.puddleG.connect(this.rainBus);
      this._loop(this.bufs.puddle, 0.8, this.puddleG, 1);
      this.rainBus.connect(this.revIn);
    }
    _windLayers() {
      const ctx = this.ctx;
      const low = ctx.createBufferSource(); low.buffer = this.brown; low.loop = true;
      const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 380;
      this.windLowG = ctx.createGain(); this.windLowG.gain.value = 0;
      low.connect(lf); lf.connect(this.windLowG); this.windLowG.connect(this.windBus); low.start();
      // silbido entre ramas: dos bandas resonantes que derivan
      this.whistle = [];
      for (let i = 0; i < 2; i++) {
        const s = ctx.createBufferSource(); s.buffer = this.pink; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 7; f.frequency.value = 600 + i * 350;
        const g = ctx.createGain(); g.gain.value = 0;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = i ? 0.6 : -0.6;
        s.connect(f); f.connect(g); g.connect(p); p.connect(this.windBus); s.start(0, Math.random() * 2);
        this.whistle.push({ f, g });
      }
      // follaje sacudido por las ráfagas
      const rs = ctx.createBufferSource(); rs.buffer = this.white; rs.loop = true;
      const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2600; rf.Q.value = 0.6;
      this.rustleG = ctx.createGain(); this.rustleG.gain.value = 0;
      rs.connect(rf); rf.connect(this.rustleG); this.rustleG.connect(this.windBus); rs.start();
      this.windBus.connect(this.revIn);
    }
    _breathLayer() {
      const ctx = this.ctx;
      const s = ctx.createBufferSource(); s.buffer = this.pink; s.loop = true;
      this.breathF = ctx.createBiquadFilter(); this.breathF.type = 'bandpass'; this.breathF.Q.value = 1.6; this.breathF.frequency.value = 1100;
      const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 2400; f2.gain.value = 6;
      this.breathG = ctx.createGain(); this.breathG.gain.value = 0;
      s.connect(this.breathF); this.breathF.connect(f2); f2.connect(this.breathG); this.breathG.connect(this.player); s.start();
      this.breathPh = 0;
    }

    /* ================= actualización por cuadro ================= */
    // st: { rain, wind, gust, leafCover (0..1), puddleNear (0..1), exertion (0..1), shelter (0..1), dt }
    update(st) {
      if (!this.ready) return;
      const t = this.ctx.currentTime, k = 0.15;
      const r = st.rain;
      this.washG.gain.setTargetAtTime(0.05 + r * r * 0.42, t, k);
      this.leavesG.gain.setTargetAtTime((0.12 + r * 0.6) * (0.35 + st.leafCover * 0.75), t, k);
      this.mudG.gain.setTargetAtTime(0.15 + r * 0.55, t, k);
      this.puddleG.gain.setTargetAtTime(st.puddleNear * (0.2 + r * 0.8), t, 0.3);
      // viento y ráfagas
      const w = st.wind, g = st.gust;
      this.windLowG.gain.setTargetAtTime(0.05 + w * 0.32 + g * 0.25, t, 0.4);
      this.whistle.forEach((W, i) => {
        W.g.gain.setTargetAtTime(g * g * 0.09 * (i ? 0.8 : 1), t, 0.5);
        W.f.frequency.setTargetAtTime(500 + i * 380 + g * 420 + Math.sin(t * (0.3 + i * 0.2)) * 120, t, 0.6);
      });
      this.rustleG.gain.setTargetAtTime((0.02 + g * 0.12) * (0.3 + st.leafCover), t, 0.3);
      // respiración: ritmo y volumen según el esfuerzo
      const ex = st.exertion;
      this.breathPh += st.dt * (0.22 + ex * 0.65);
      const cyc = this.breathPh % 1, inhale = cyc < 0.42;
      const env = inhale ? Math.sin(cyc / 0.42 * Math.PI) : Math.sin((cyc - 0.42) / 0.58 * Math.PI) * 1.2;
      this.breathG.gain.setTargetAtTime(Math.max(0, env) * (0.006 + ex * ex * 0.16), t, 0.04);
      this.breathF.frequency.setTargetAtTime(inhale ? 1500 + ex * 500 : 950 + ex * 250, t, 0.08);
      // refugio: el exterior se apaga y se oscurece
      const sh = st.shelter;
      this.shelterLP.frequency.setTargetAtTime(20000 * (1 - sh) + 700 * sh, t, 0.3);
      this.outdoor.gain.setTargetAtTime(1 - sh * 0.45, t, 0.3);
    }

    setListener(cam) {
      if (!this.ready) return;
      const L = this.ctx.listener, p = cam.position, f = new THREE.Vector3(), u = cam.up;
      cam.getWorldDirection(f);
      if (L.positionX) {
        const t = this.ctx.currentTime;
        L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
        L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
        L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
      } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
      this.cam = cam;
    }

    /* ================= sonidos puntuales ================= */
    _panner(pos, refDist) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = refDist || 3; p.rolloffFactor = 1.1; p.maxDistance = 200;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      p.connect(this.pos3d);
      return p;
    }
    _play(buf, out, gain, rate, when) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate || 1;
      const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(out); s.start(when || this.ctx.currentTime);
      s.onended = () => { try { g.disconnect(); } catch (e) {} };
      return s;
    }
    step(surface, run) {
      if (!this.ready) return;
      this._c('step:' + surface);
      const set = surface === 'puddle' ? this.bufs.stepPuddle : surface === 'leaves' ? this.bufs.stepLeaves : this.bufs.stepMud;
      this._play(set[(Math.random() * set.length) | 0], this.player, (run ? 0.75 : 0.5) * rnd(0.8, 1.1), rnd(0.88, 1.12));
      if (Math.random() < 0.7) this._play(this.bufs.cloth[(Math.random() * 4) | 0], this.player, (run ? 0.35 : 0.18) * rnd(0.7, 1), rnd(0.9, 1.2));
      if (surface === 'leaves' && Math.random() < (run ? 0.12 : 0.05)) this.snap(null, 0.45);
    }
    snap(pos, gain) {
      if (!this.ready) return;
      this._c('snap');
      const out = pos ? this._panner(pos, 4) : this.player;
      this._play(this.bufs.snap[(Math.random() * 3) | 0], out, gain || 0.7, rnd(0.85, 1.15));
    }
    click() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 2400; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g); g.connect(this.player); o.start(t); o.stop(t + 0.05);
      this._play(this.bufs.snap[0], this.player, 0.08, 3);
    }
    // trueno: distancia en metros → retardo (velocidad del sonido), filtro y volumen; dirección → paneo
    thunder(dist, dirX) {
      if (!this.ready) return 0;
      const near = dist < 900, ctx = this.ctx;
      this._c(near ? 'thunderNear' : 'thunderFar');
      const delay = Math.min(7, dist / 343);
      const set = near ? this.bufs.thunderNear : this.bufs.thunderFar;
      const s = ctx.createBufferSource(); s.buffer = set[(Math.random() * 2) | 0]; s.playbackRate.value = rnd(0.82, 1.08);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = near ? 9000 - dist * 4 : Math.max(250, 1400 - dist * 0.25);
      const g = ctx.createGain(); g.gain.value = near ? 1.3 - dist / 1500 : Math.max(0.25, 0.9 - dist / 6000);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = Math.max(-0.8, Math.min(0.8, dirX || 0));
      s.connect(f); f.connect(g); g.connect(p); p.connect(this.thunderBus);
      s.start(ctx.currentTime + delay);
      return delay;
    }
    // crujido de tronco: fricción "stick-slip" (pulsos) a través de resonancias de madera
    creak(pos, gain) {
      if (!this.ready) return;
      this._c('creak');
      const ctx = this.ctx, t0 = ctx.currentTime, dur = rnd(0.8, 2.2), out = this._panner(pos, 6);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f0 = rnd(18, 40); o.frequency.setValueAtTime(f0, t0);
      o.frequency.linearRampToValueAtTime(f0 * rnd(1.6, 3), t0 + dur * 0.6); o.frequency.linearRampToValueAtTime(f0 * rnd(0.8, 1.4), t0 + dur);
      const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = rnd(450, 900); b1.Q.value = 9;
      const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = rnd(1300, 2100); b2.Q.value = 12;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime((gain || 0.6), t0 + 0.15); g.gain.setValueAtTime(gain || 0.6, t0 + dur - 0.3); g.gain.linearRampToValueAtTime(0, t0 + dur);
      o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }
    // silencio repentino: todo el exterior cae casi a cero y vuelve
    silence(sec) {
      if (!this.ready) return;
      this._c('silence');
      const t = this.ctx.currentTime, g = this.duck.gain;
      g.cancelScheduledValues(t); g.setTargetAtTime(0.04, t, 0.25); g.setTargetAtTime(1, t + sec, 0.6);
    }
  }

  window.TS.StormAudio = StormAudio;
})();
