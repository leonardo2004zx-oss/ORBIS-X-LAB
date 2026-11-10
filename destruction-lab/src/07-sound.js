/* ------------------------------------------------------------------ sound (WebAudio, synthesized) */
const Sfx = {
  ctx: null, master: null, noise: null, rumbleGain: null, lastCrumble: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      this.master = ctx.createGain(); this.master.gain.value = settings.sound ? 0.9 : 0;
      this.master.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.5 + last * 3; }
      this.noise = buf;
      this.loops = {};
      this.makeLoop('wind', 'bandpass', 420, 0.7); this.makeLoop('water', 'lowpass', 520, 0.6); this.makeLoop('rain', 'highpass', 2600, 0.4); this.makeLoop('hum', 'lowpass', 70, 2); this.makeLoop('lava', 'lowpass', 220, 0.8);
      // continuous rumble for earthquakes
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 75;
      this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
      src.connect(lp); lp.connect(this.rumbleGain); this.rumbleGain.connect(this.master); src.start();
    } catch (e) { this.ctx = null; }
  },
  ok() { return this.ctx && this.ctx.state === 'running' && settings.sound; },
  setEnabled(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05); },
  noiseSrc(t, dur) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * 1.2); s.stop(t + dur); return s; },
  boom(s, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay, dur = 1.4 + s * 2.2;
    const n = this.noiseSrc(t, dur + 0.2);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400 + s * 2500, t); lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 + s * 0.6, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(lp); lp.connect(g); g.connect(this.master);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const og = c.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.9 + s * 0.6);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1.6 + s);
  },
  whoosh(dur) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noiseSrc(t, dur + 0.1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
    n.connect(bp); bp.connect(g); g.connect(this.master);
  },
  crumble(v = 1) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    if (t - this.lastCrumble < 0.07) return; this.lastCrumble = t;
    const n = this.noiseSrc(t, 0.35);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(250, 900); bp.Q.value = 0.9;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 + 0.18 * Math.min(1, v), t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(bp); bp.connect(g); g.connect(this.master);
  },
  makeLoop(name, type, freq, q) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.master); src.start(0, Math.random());
    this.loops[name] = g;
  },
  loop(name, level) { if (!this.ctx || !this.loops) return; const g = this.loops[name]; if (g && Math.abs(g.gain.value - level) > 0.005) g.gain.setTargetAtTime(settings.sound ? level : 0, this.ctx.currentTime, 0.3); },
  thunder(delay) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const n = this.noiseSrc(t, 0.3); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(hp); hp.connect(g); g.connect(this.master);
    const n2 = this.noiseSrc(t + 0.05, 3.2); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(1.0, t + 0.15); g2.gain.exponentialRampToValueAtTime(0.001, t + 3.1);
    n2.connect(lp); lp.connect(g2); g2.connect(this.master);
  },
  rumble(level) { if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(settings.sound ? level : 0, this.ctx.currentTime, 0.25); },
};

