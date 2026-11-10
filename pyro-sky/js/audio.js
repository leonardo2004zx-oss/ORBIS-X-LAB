/* PYRO SKY SIMULATOR — motor de audio (Web Audio API)
 *
 * Todo el sonido se sintetiza en tiempo real o se pre-renderiza a nivel de
 * muestra al activar el audio: no hay archivos externos ni licencias de
 * terceros. Cada cohete define su propio "perfil sonoro" (ver rockets.js):
 * mecha, despegue, ascenso, explosión, chisporroteo y cola de eco.
 *
 * Cadena: fuente → ganancia de voz → filtro de aire (distancia) → paneo →
 *         [seco | reverb (convolución) | eco de montaña (retardos)] → compresor → salida
 */
(function () {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);

  class PyroAudio {
    constructor() {
      this.ready = false;
      this.ctx = null;
      this.timeScale = 1;          // cámara lenta: baja tono y alarga
      this.realisticDelay = false; // retardo por velocidad del sonido
      this.listener = { x: 0, y: 2, z: 260, rx: 1, ry: 0, rz: 0 };
      this.stats = { events: {}, voices: 0 };
    }

    /* ---------- arranque (requiere gesto del usuario) ---------- */
    init() {
      if (this.ready) { this.ctx.resume(); return Promise.resolve(); }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
      const sr = ctx.sampleRate;

      this.out = ctx.createDynamicsCompressor();
      this.out.threshold.value = -16;
      this.out.knee.value = 12;
      this.out.ratio.value = 5;
      this.out.attack.value = 0.002;
      this.out.release.value = 0.3;

      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.out.connect(this.master);
      this.master.connect(ctx.destination);

      // analizador para el vúmetro y las pruebas automáticas
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(this.analyser);
      this._abuf = new Float32Array(this.analyser.fftSize);

      this.dry = ctx.createGain();
      this.dry.connect(this.out);

      // Reverb de valle: respuesta al impulso generada (≈4 s, estéreo, se oscurece con el tiempo)
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._makeIR(4.2, 3.6);
      this.reverbIn = ctx.createGain();
      this.reverbOut = ctx.createGain();
      this.reverbOut.gain.value = 0.9;
      this.reverbIn.connect(this.reverb);
      this.reverb.connect(this.reverbOut);
      this.reverbOut.connect(this.out);

      // Ecos discretos de las colinas (dos paredes a ≈95 m y ≈230 m)
      this.echoIn = ctx.createGain();
      this.echoOut = ctx.createGain();
      this.echoOut.gain.value = 0.9;
      const mkEcho = (time, cut, gain, pan, fb) => {
        const d = ctx.createDelay(3); d.delayTime.value = time;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
        const g = ctx.createGain(); g.gain.value = gain;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
        if (p.pan) p.pan.value = pan;
        this.echoIn.connect(d); d.connect(f); f.connect(g); g.connect(p); p.connect(this.echoOut);
        if (fb) { const fg = ctx.createGain(); fg.gain.value = fb; f.connect(fg); fg.connect(d); }
        p.connect(this.reverbIn);
      };
      mkEcho(0.56, 2600, 0.42, -0.55, 0);
      mkEcho(1.34, 1500, 0.30, 0.6, 0.28);
      this.echoOut.connect(this.out);

      // Fuentes de ruido reutilizables
      this.white = this._noiseBuffer(3, 'white');
      this.pink = this._noiseBuffer(3, 'pink');
      this.brown = this._noiseBuffer(4, 'brown');

      // Distorsión suave para el "crack" de la carga de apertura
      this.shaper = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; this.shaper[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); }

      // Texturas pre-renderizadas con variantes (para que dos eventos nunca suenen igual)
      this.bank = {
        fuse: [0, 1, 2].map(() => this._renderFuse(1.8)),
        crackle: [0, 1, 2].map(() => this._renderCrackle(1.6, 260, 1.0)),
        crackleFine: [0, 1].map(() => this._renderCrackle(2.4, 120, 0.45)),
        glitter: [0, 1].map(() => this._renderGlitter(4.2)),
        strobe: [0, 1].map(() => this._renderStrobe(2.6)),
        sizzle: [0, 1].map(() => this._renderGlitter(1.8, true)),
      };

      this.ready = true;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
      });
      return ctx.resume();
    }

    setVolume(v) { if (this.ready) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
    setReverb(v) {
      if (!this.ready) return;
      this.reverbOut.gain.setTargetAtTime(v * 1.4, this.ctx.currentTime, 0.1);
      this.echoOut.gain.setTargetAtTime(v * 1.4, this.ctx.currentTime, 0.1);
    }
    level() {
      if (!this.ready) return 0;
      this.analyser.getFloatTimeDomainData(this._abuf);
      let s = 0; for (let i = 0; i < this._abuf.length; i++) s += this._abuf[i] * this._abuf[i];
      return Math.sqrt(s / this._abuf.length);
    }
    _count(name) { this.stats.events[name] = (this.stats.events[name] || 0) + 1; }

    /* ---------- generación de buffers ---------- */
    _noiseBuffer(sec, kind) {
      const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.03) * 3.2; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
      return buf;
    }

    _makeIR(sec, rt60) {
      const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr);
      const buf = ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const env = Math.exp(-6.9 * t / rt60) * Math.min(1, t / 0.02);
          // el aire y el terreno se comen los agudos con el tiempo
          const a = 0.55 + 0.42 * Math.min(1, t / sec);
          lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
          d[i] = lp * env * 2.2;
        }
        // primeras reflexiones del suelo
        [0.011, 0.023, 0.041, 0.067].forEach((t, k) => {
          const i = Math.floor((t + c * 0.003) * sr); if (i < n) d[i] += (0.5 - k * 0.1) * (c ? -1 : 1);
        });
      }
      return buf;
    }

    // Chisporroteo: cientos de micro-estallidos con paneo y brillo aleatorio
    _renderCrackle(sec, pops, bright) {
      const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr);
      const buf = ctx.createBuffer(2, n, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let p = 0; p < pops; p++) {
        // densidad: crece rápido y se apaga
        const u = Math.pow(Math.random(), 0.8);
        const start = Math.floor(u * (n - 2000));
        const len = Math.floor(rnd(40, 260) * (bright > 0.8 ? 1 : 1.6));
        const amp = Math.pow(Math.random(), 1.8) * rnd(0.4, 1.0);
        const pan = Math.random();
        const tau = len / rnd(3, 6);
        const ring = rnd(0.15, 0.7); // resonancia del "pop"
        let y = 0, prev = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          y = w - ring * prev; prev = y;           // empuja energía hacia los agudos
          const s = y * amp * Math.exp(-i / tau) * (bright > 0.8 ? 1 : 0.7);
          L[start + i] += s * (1 - pan) * 1.4;
          R[start + i] += s * pan * 1.4;
        }
      }
      return buf;
    }

    // Brillo/siseo de purpurina (sauce dorado): ruido agudo continuo + destellos finos
    _renderGlitter(sec, short) {
      const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr);
      const buf = ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let prev = 0, lp = 0, mod = 0, modT = 0;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const env = short ? Math.pow(1 - t, 2) * Math.min(1, t * 30) : Math.min(1, t * 6) * Math.pow(1 - t, 1.6);
          if (--modT <= 0) { mod = Math.random(); modT = rnd(30, 300); }
          const w = Math.random() * 2 - 1;
          const hp = w - prev; prev = w;
          lp = lp * 0.6 + hp * 0.4;
          let s = lp * env * (0.25 + 0.5 * mod) * 0.6;
          if (Math.random() < 0.0016) s += (Math.random() * 2 - 1) * env * 1.2;
          d[i] = s;
        }
      }
      return buf;
    }

    // Mecha: chispeo irregular con "rasguño" inicial
    _renderFuse(sec) {
      const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr);
      const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
      let prev = 0, g = 0, gT = 0, bp1 = 0, bp2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        if (--gT <= 0) { g = Math.random() < 0.25 ? rnd(0.6, 1) : rnd(0.05, 0.35); gT = rnd(sr * 0.004, sr * 0.03); }
        const w = Math.random() * 2 - 1;
        const hp = w - prev * 0.9; prev = w;
        // resonador ~5 kHz
        const y = hp * 0.35 + 1.34 * bp1 - 0.72 * bp2; bp2 = bp1; bp1 = y;
        const strike = t < 0.09 ? 2.2 * Math.exp(-t / 0.03) : 0;
        d[i] = (y * 0.32 * g + w * strike * 0.6) * Math.min(1, (sec - t) * 8);
      }
      return buf;
    }

    // Estrobo: destellos semi-rítmicos ("tic-tic-tic")
    _renderStrobe(sec) {
      const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr);
      const buf = ctx.createBuffer(2, n, sr);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let k = 0; k < 140; k++) {
        const t0 = Math.floor(Math.pow(Math.random(), 0.7) * (n - 600));
        const pan = Math.random(), amp = rnd(0.2, 0.8) * (1 - t0 / n);
        let ph = 0; const f = rnd(2400, 5200) / sr * Math.PI * 2;
        for (let i = 0; i < 500; i++) {
          ph += f;
          const s = Math.sin(ph) * (Math.random() * 0.6 + 0.4) * amp * Math.exp(-i / 70);
          L[t0 + i] += s * (1 - pan); R[t0 + i] += s * pan;
        }
      }
      return buf;
    }

    /* ---------- espacialización ---------- */
    _spatial(pos) {
      const l = this.listener;
      const dx = pos.x - l.x, dy = pos.y - l.y, dz = pos.z - l.z;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const pan = Math.max(-1, Math.min(1, (dx * l.rx + dz * l.rz) / d * 1.3));
      const gain = Math.min(1.6, 260 / (60 + d)) ;
      const cutoff = Math.max(900, 19000 * Math.exp(-d / 520));
      const wet = Math.min(1, 0.22 + d / 900);
      const delay = this.realisticDelay ? d / 343 / Math.max(0.25, this.timeScale) : 0;
      return { d, pan, gain, cutoff, wet, delay };
    }

    // crea la cadena de una voz y devuelve su entrada
    _voice(pos, t0, life, opts) {
      const ctx = this.ctx, sp = this._spatial(pos);
      const inp = ctx.createGain();
      const air = ctx.createBiquadFilter(); air.type = 'lowpass';
      air.frequency.value = sp.cutoff * (opts.bright || 1); air.Q.value = 0.5;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (pan.pan) pan.pan.value = sp.pan * (opts.panAmt == null ? 1 : opts.panAmt);
      const dryG = ctx.createGain(); dryG.gain.value = sp.gain * (1 - sp.wet * 0.5);
      const revG = ctx.createGain(); revG.gain.value = sp.gain * sp.wet * (opts.reverb == null ? 0.5 : opts.reverb);
      const echoG = ctx.createGain(); echoG.gain.value = sp.gain * (opts.echo || 0);
      inp.connect(air); air.connect(pan);
      pan.connect(dryG); dryG.connect(this.dry);
      pan.connect(revG); revG.connect(this.reverbIn);
      if (opts.echo) { pan.connect(echoG); echoG.connect(this.echoIn); }
      this.stats.voices++;
      const kill = () => { try { inp.disconnect(); pan.disconnect(); this.stats.voices--; } catch (e) {} };
      setTimeout(kill, (t0 - ctx.currentTime + life + 0.5) * 1000);
      return { inp, air, pan, dryG, revG, sp };
    }

    _noise(buf, t0, dur, rate) {
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      if (rate) s.playbackRate.value = rate;
      const off = Math.random() * (buf.duration - 0.1);
      s.start(t0, off); s.stop(t0 + dur + 0.05);
      return s;
    }

    _env(g, t0, a, peak, decay, curve) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.setTargetAtTime(0.0001, t0 + a, decay / (curve || 4));
    }

    /* ======================================================
     *  ETAPA 1 — Encendido de la mecha
     * ====================================================== */
    fuse(pos, prof, dur) {
      if (!this.ready) return;
      this._count('fuse');
      const ctx = this.ctx, ts = this.timeScale, t0 = ctx.currentTime;
      const D = dur;
      const v = this._voice(pos, t0, D + 0.3, { reverb: 0.25, bright: 1.2 });
      const s = ctx.createBufferSource();
      s.buffer = this.bank.fuse[(Math.random() * 3) | 0];
      s.playbackRate.value = (prof.fusePitch || 1) * rnd(0.9, 1.1) * (ts < 1 ? 0.6 : 1);
      const g = ctx.createGain(); g.gain.value = 0.55 * (prof.fuseGain || 1);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      s.connect(hp); hp.connect(g); g.connect(v.inp);
      s.start(t0); s.stop(t0 + D);
      g.gain.setValueAtTime(0.55 * (prof.fuseGain || 1), t0 + D - 0.08);
      g.gain.linearRampToValueAtTime(0, t0 + D);
    }

    /* ======================================================
     *  ETAPA 2 — Impulso y despegue
     * ====================================================== */
    launch(pos, prof) {
      if (!this.ready) return;
      this._count('launch');
      const ctx = this.ctx, ts = this.timeScale, sl = ts < 1 ? 0.55 : 1;
      const t0 = ctx.currentTime;
      const L = prof.launch;
      const len = L.len / sl;
      const v = this._voice(pos, t0, len + 2, { reverb: 0.5, echo: L.echo || 0.15 });

      // golpe grave (la carga de elevación)
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(L.thump * 2.2 * sl, t0);
      o.frequency.exponentialRampToValueAtTime(L.thump * 0.7 * sl, t0 + 0.18 / sl);
      const og = ctx.createGain(); this._env(og, t0, 0.004, L.bass, 0.35 / sl, 3);
      o.connect(og); og.connect(v.inp); o.start(t0); o.stop(t0 + 1 / sl);

      // chorro de gas: ruido con barrido de filtro
      const n = this._noise(L.brown ? this.brown : this.white, t0, len, sl);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(L.f0 * sl, t0);
      f.frequency.exponentialRampToValueAtTime(L.f1 * sl, t0 + len * 0.6);
      const ng = ctx.createGain(); this._env(ng, t0, 0.015 / sl, L.noise, len, 2.5);
      n.connect(f); f.connect(ng); ng.connect(v.inp);
    }

    /* ======================================================
     *  ETAPA 3 — Silbido / zumbido / rugido del ascenso
     *  Voz continua controlada cuadro a cuadro desde la simulación.
     * ====================================================== */
    ascent(pos, prof) {
      if (!this.ready) return null;
      this._count('ascent');
      const ctx = this.ctx, t0 = ctx.currentTime, A = prof.ascent;
      const v = this._voice(pos, t0, 30, { reverb: 0.35, echo: 0.05, panAmt: 1 });
      const out = ctx.createGain(); out.gain.value = 0;
      out.connect(v.inp);
      const nodes = [];
      const h = { v, out, nodes, kind: A.kind, A, alive: true };

      if (A.kind === 'whistle') {
        // silbato de pirotecnia: tono puro que trepa + soplo resonante + aleteo
        const o1 = ctx.createOscillator(); o1.type = 'sine';
        const o2 = ctx.createOscillator(); o2.type = 'triangle';
        const g2 = ctx.createGain(); g2.gain.value = 0.18;
        const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(5, 8);
        const lfoG = ctx.createGain(); lfoG.gain.value = 18;
        lfo.connect(lfoG); lfoG.connect(o1.frequency); lfoG.connect(o2.detune);
        const nz = this._noise(this.white, t0, 30);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
        const ng = ctx.createGain(); ng.gain.value = 0.9;
        nz.connect(bp); bp.connect(ng); ng.connect(out);
        o1.connect(out); o2.connect(g2); g2.connect(out);
        [o1, o2, lfo].forEach(x => x.start(t0));
        h.o1 = o1; h.o2 = o2; h.bp = bp; nodes.push(o1, o2, lfo, nz);
      } else if (A.kind === 'hum') {
        // "hummer": diente de sierra modulado en amplitud → bzzzz
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 4;
        const am = ctx.createGain(); am.gain.value = 0.5;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 24;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
        lfo.connect(lfoG); lfoG.connect(am.gain);
        o.connect(lp); lp.connect(am); am.connect(out);
        const nz = this._noise(this.pink, t0, 30);
        const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 1;
        const ngn = ctx.createGain(); ngn.gain.value = 0.35;
        nz.connect(nf); nf.connect(ngn); ngn.connect(am);
        o.start(t0); lfo.start(t0);
        h.o1 = o; h.lp = lp; h.lfo = lfo; nodes.push(o, lfo, nz);
      } else {
        // 'hiss' (siseo), 'roar' (rugido), 'crackle' (siseo con chispas)
        const nz = this._noise(A.kind === 'roar' ? this.brown : this.white, t0, 30);
        const bp = ctx.createBiquadFilter(); bp.type = A.kind === 'roar' ? 'lowpass' : 'bandpass';
        bp.Q.value = A.kind === 'roar' ? 2 : 0.9;
        nz.connect(bp); bp.connect(out);
        h.bp = bp; nodes.push(nz);
        if (A.kind === 'roar') {
          const n2 = this._noise(this.white, t0, 30);
          const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 0.6;
          const g2 = ctx.createGain(); g2.gain.value = 0.28;
          n2.connect(f2); f2.connect(g2); g2.connect(out); nodes.push(n2); h.f2 = f2;
        }
        if (A.kind === 'crackle') {
          const c = ctx.createBufferSource(); c.buffer = this.bank.crackleFine[(Math.random() * 2) | 0]; c.loop = true;
          const cg = ctx.createGain(); cg.gain.value = 0.9;
          c.connect(cg); cg.connect(out); c.start(t0); nodes.push(c);
        }
      }
      return h;
    }

    // llamado cada cuadro: progreso 0..1, posición actual
    updateAscent(h, prog, pos) {
      if (!h || !h.alive) return;
      const ctx = this.ctx, t = ctx.currentTime, A = h.A;
      const ts = this.timeScale, sl = ts < 1 ? 0.55 : 1;
      const sp = this._spatial(pos);
      h.v.air.frequency.setTargetAtTime(sp.cutoff, t, 0.05);
      if (h.v.pan.pan) h.v.pan.pan.setTargetAtTime(sp.pan, t, 0.05);
      h.v.dryG.gain.setTargetAtTime(sp.gain * (1 - sp.wet * 0.5), t, 0.05);
      h.v.revG.gain.setTargetAtTime(sp.gain * sp.wet * 0.35, t, 0.05);
      const fadeIn = Math.min(1, prog * 12);
      let g;
      if (A.kind === 'whistle') {
        const f = (A.f0 + (A.f1 - A.f0) * Math.pow(prog, 0.75)) * sl;
        h.o1.frequency.setTargetAtTime(f, t, 0.03);
        h.o2.frequency.setTargetAtTime(f * 2.005, t, 0.03);
        h.bp.frequency.setTargetAtTime(f, t, 0.03);
        g = A.gain * fadeIn * (0.7 + 0.3 * Math.sin(prog * 40) * Math.sin(prog * 13));
      } else if (A.kind === 'hum') {
        const f = (A.f0 + (A.f1 - A.f0) * prog) * sl;
        h.o1.frequency.setTargetAtTime(f, t, 0.04);
        h.lfo.frequency.setTargetAtTime((A.rate || 24) * (0.8 + prog * 0.6) * sl, t, 0.05);
        h.lp.frequency.setTargetAtTime(900 + 1800 * prog, t, 0.05);
        g = A.gain * fadeIn;
      } else {
        const f = (A.f0 + (A.f1 - A.f0) * prog) * sl;
        h.bp.frequency.setTargetAtTime(f, t, 0.04);
        g = A.gain * fadeIn * Math.pow(1 - prog * 0.75, 1.3);
      }
      h.out.gain.setTargetAtTime(g, t, 0.04);
    }

    stopAscent(h, fast) {
      if (!h || !h.alive) return;
      h.alive = false;
      const t = this.ctx.currentTime;
      h.out.gain.cancelScheduledValues(t);
      h.out.gain.setTargetAtTime(0, t, fast ? 0.01 : 0.08);
      h.nodes.forEach(n => { try { n.stop(t + 0.6); } catch (e) {} });
    }

    /* ======================================================
     *  ETAPA 4 — Explosión principal (capas: crack, cuerpo, grave, retumbo)
     *  ETAPA 5 — Chisporroteo
     *  ETAPA 6 — Reverberación y eco
     * ====================================================== */
    burst(pos, prof, scale) {
      if (!this.ready) return;
      this._count('burst');
      const ctx = this.ctx, ts = this.timeScale, sl = ts < 1 ? 0.5 : 1;
      const B = prof.burst, sc = scale || 1;
      const sp0 = this._spatial(pos);
      const t0 = ctx.currentTime + sp0.delay + 0.005;
      const life = (B.rumble || 1.5) / sl + 4;
      const v = this._voice(pos, t0, life, { reverb: B.reverb, echo: B.echo });
      const vari = rnd(0.88, 1.14); // ninguna explosión suena idéntica
      const P = (f) => f * vari * sl;

      // 4a. Crack: transitorio corto, saturado
      const cr = this._noise(this.white, t0, 0.12, 1);
      const crF = ctx.createBiquadFilter(); crF.type = 'highpass'; crF.frequency.value = P(B.crackHz);
      const ws = ctx.createWaveShaper(); ws.curve = this.shaper;
      const crG = ctx.createGain(); this._env(crG, t0, 0.0015, B.crack * sc * (0.6 + 0.4 * sp0.cutoff / 19000), 0.05 / sl, 3);
      cr.connect(crF); crF.connect(ws); ws.connect(crG); crG.connect(v.inp);

      // 4b. Cuerpo: ruido con filtro que se cierra
      const body = this._noise(this.pink, t0, B.body / sl + 0.3, sl);
      const bF = ctx.createBiquadFilter(); bF.type = 'lowpass'; bF.Q.value = 0.8;
      bF.frequency.setValueAtTime(P(B.bodyHz), t0);
      bF.frequency.exponentialRampToValueAtTime(P(Math.max(120, B.bodyHz * 0.12)), t0 + B.body / sl);
      const bG = ctx.createGain(); this._env(bG, t0, 0.003, B.bodyGain * sc, B.body / sl, 3);
      body.connect(bF); bF.connect(bG); bG.connect(v.inp);

      // 4c. Golpe sub-grave (el pecho lo siente)
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(P(B.sub * 2.4), t0);
      o.frequency.exponentialRampToValueAtTime(P(B.sub * 0.55), t0 + 0.35 / sl);
      const oG = ctx.createGain(); this._env(oG, t0, 0.003, B.bass * sc, B.subLen / sl, 3);
      o.connect(oG); oG.connect(v.inp); o.start(t0); o.stop(t0 + B.subLen / sl + 1);

      // 4d. Retumbo largo (proyectiles grandes)
      if (B.rumble) {
        const r = this._noise(this.brown, t0, B.rumble / sl + 0.5, sl);
        const rF = ctx.createBiquadFilter(); rF.type = 'lowpass'; rF.frequency.value = P(220);
        const rG = ctx.createGain();
        rG.gain.setValueAtTime(0.0001, t0);
        rG.gain.linearRampToValueAtTime(B.rumbleGain * sc, t0 + 0.08 / sl);
        rG.gain.setTargetAtTime(0.0001, t0 + 0.1 / sl, B.rumble / sl / 3);
        r.connect(rF); rF.connect(rG); rG.connect(v.inp);
      }

      // 5. Chisporroteo / purpurina / estrobo de las estrellas
      if (B.tail) {
        const T = B.tail;
        const bufs = this.bank[T.kind];
        const s = ctx.createBufferSource();
        s.buffer = bufs[(Math.random() * bufs.length) | 0];
        s.playbackRate.value = (T.rate || 1) * rnd(0.9, 1.1) * sl;
        const tv = this._voice(pos, t0, 8 / sl, { reverb: T.reverb == null ? 0.5 : T.reverb, echo: 0.03, panAmt: 0.6, bright: 1.1 });
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.setValueAtTime(T.gain * sc, t0 + (T.delay || 0) / ts);
        s.connect(g); g.connect(tv.inp);
        s.start(t0 + (T.delay || 0) / ts);
        this._count('tail:' + T.kind);
      }
    }

    // micro-estallido aislado (crossette, crepitado sincronizado con la imagen)
    pop(pos, gain, hz) {
      if (!this.ready) return;
      const ctx = this.ctx, sp = this._spatial(pos), t0 = ctx.currentTime + sp.delay;
      const v = this._voice(pos, t0, 1.2, { reverb: 0.55, echo: 0.08 });
      const n = this._noise(this.white, t0, 0.06);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (hz || 2500) * rnd(0.8, 1.25); f.Q.value = 1.2;
      const g = ctx.createGain(); this._env(g, t0, 0.001, gain, 0.035, 3);
      n.connect(f); f.connect(g); g.connect(v.inp);
      this._count('pop');
    }
  }

  window.PyroAudio = PyroAudio;
})();
