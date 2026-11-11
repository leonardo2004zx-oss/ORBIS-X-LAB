// Orbi y el Faro de Cristal — plataformas 3D original.
import * as THREE from './vendor/three.module.min.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/* ======================================================================
   Render
   ====================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = 0xbfe3ff;
scene.fog = new THREE.Fog(FOG, 90, 320);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 900);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Cielo con degradado
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3a7ff0) },
      mid: { value: new THREE.Color(FOG) },
      bot: { value: new THREE.Color(0xfbeaff) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, pow(-h, 0.6)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
  })
);
sky.renderOrder = -1;
scene.add(sky);

const sun = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
sun.position.set(260, 300, 180);
scene.add(sun);

scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x6d8a4a, 1.15));
const dirLight = new THREE.DirectionalLight(0xfff0d0, 2.4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
Object.assign(dirLight.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
dirLight.shadow.bias = -0.0008;
dirLight.shadow.normalBias = 0.03;
scene.add(dirLight, dirLight.target);

const matCache = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return matCache.get(key);
}
function shade(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}
// Ruido determinista por posición (los vértices duplicados se mueven igual)
function hashNoise(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function roughen(geo, amount) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = hashNoise(Math.round(x * 10), Math.round(y * 10), Math.round(z * 10)) - 0.5;
    p.setXYZ(i, x * (1 + n * amount), y, z * (1 + n * amount));
  }
  geo.computeVertexNormals();
  return geo;
}

/* ======================================================================
   Audio (sintetizado)
   ====================================================================== */
const audio = {
  ctx: null, master: null, music: null, sfx: null, muted: false, nextNote: 0, step: 0,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.nextNote = this.ctx.currentTime + 0.1;
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  },
  tone(freq, dur = 0.12, type = 'square', vol = 0.25, slide = 0, when = 0, dest = null) {
    if (!this.ctx) return;
    const t = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  noise(dur = 0.25, vol = 0.4, freq = 900) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
  },
  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'jump': this.tone(330, 0.16, 'square', 0.12, 660); break;
      case 'jump2': this.tone(392, 0.18, 'square', 0.12, 880); break;
      case 'jump3': this.tone(440, 0.3, 'square', 0.12, 1320); this.tone(660, 0.3, 'triangle', 0.1, 1760, t + 0.08); break;
      case 'long': this.tone(260, 0.3, 'sawtooth', 0.08, 520); break;
      case 'wall': this.tone(500, 0.12, 'square', 0.12, 900); break;
      case 'coin': this.tone(988, 0.08, 'square', 0.1, 0, t); this.tone(1319, 0.22, 'square', 0.1, 0, t + 0.07); break;
      case 'frag': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.15, 0, t + i * 0.06)); break;
      case 'stomp': this.tone(600, 0.15, 'square', 0.15, 120); break;
      case 'pound': this.noise(0.3, 0.6, 500); this.tone(120, 0.25, 'sine', 0.4, 40); break;
      case 'hurt': this.tone(400, 0.35, 'sawtooth', 0.15, 90); break;
      case 'spring': this.tone(200, 0.35, 'sine', 0.3, 900); break;
      case 'tick': this.tone(1200, 0.04, 'square', 0.06); break;
      case 'switch': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, 0, t + i * 0.08)); break;
      case 'appear': [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, 0, t + i * 0.1)); break;
      case 'life': [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, 0, t + i * 0.08)); break;
      case 'boss': this.tone(110, 0.6, 'sawtooth', 0.2, 55); this.noise(0.5, 0.4, 300); break;
      case 'bosshit': this.tone(220, 0.3, 'square', 0.2, 80); this.tone(880, 0.15, 'square', 0.1, 440, t + 0.1); break;
      case 'die': [523, 494, 466, 440, 415, 392].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, 0, t + i * 0.12)); break;
      case 'crystal': {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
        seq.forEach((f, i) => { this.tone(f, 0.22, 'square', 0.1, 0, t + i * 0.11); this.tone(f / 2, 0.22, 'triangle', 0.12, 0, t + i * 0.11); });
        this.tone(2093, 0.9, 'triangle', 0.12, 0, t + seq.length * 0.11);
        break;
      }
    }
  },
  // Música original: secuenciador sencillo (melodía + bajo + arpegio)
  melody: [
    [4, null, 7, null, 9, 7, 4, 2], [0, 2, 4, null, 7, null, null, null],
    [5, null, 9, null, 12, 9, 5, 4], [2, 4, 5, 7, 4, null, null, null],
    [4, null, 7, null, 9, 7, 4, 2], [0, 2, 4, null, 12, 14, 12, 9],
    [10, 9, 7, 5, 4, 5, 7, 9], [7, null, 4, null, 0, null, null, null],
  ],
  bass: [0, -3, -7, -5, 0, -3, -2, -5],
  update() {
    if (!this.ctx || this.muted) return;
    const spb = 60 / 128 / 2;
    while (this.nextNote < this.ctx.currentTime + 0.25) {
      const bar = Math.floor(this.step / 8) % 8, s = this.step % 8;
      const n = this.melody[bar][s];
      const hz = (semi, base) => base * Math.pow(2, semi / 12);
      if (n !== null) this.tone(hz(n, 523.25), spb * 1.6, 'square', 0.07, 0, this.nextNote, this.music);
      if (s % 2 === 0) {
        const root = this.bass[bar] + (s % 4 === 2 ? 7 : 0);
        this.tone(hz(root, 130.81), spb * 1.8, 'triangle', 0.22, 0, this.nextNote, this.music);
      }
      const arp = [0, 4, 7, 12][s % 4] + this.bass[bar];
      this.tone(hz(arp, 261.63), spb * 0.6, 'triangle', 0.035, 0, this.nextNote, this.music);
      this.nextNote += spb;
      this.step++;
    }
  },
};

/* ======================================================================
   Entrada
   ====================================================================== */
const keys = new Set();
const pressed = new Set();
const input = { mx: 0, my: 0, jump: false, jumpPressed: false, crouch: false, crouchPressed: false, camX: 0, camY: 0, pausePressed: false };
const touch = { active: false, sx: 0, sy: 0, jump: false, pound: false, camId: null, lx: 0, ly: 0, stickId: null };
let camManualIdle = 10;

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const canvas = renderer.domElement;
let dragging = false;
canvas.addEventListener('mousedown', () => {
  if (game.state === 'play' && document.pointerLockElement !== canvas && !touch.active) {
    canvas.requestPointerLock?.();
  }
  dragging = true;
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (game.state !== 'play') return;
  if (document.pointerLockElement === canvas || dragging) {
    cam.yaw -= e.movementX * 0.0028;
    cam.pitch = clamp(cam.pitch + e.movementY * 0.002, 0.02, 1.25);
    camManualIdle = 0;
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && game.state === 'play') setPaused(true);
});
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 1.2, 6, 20); }, { passive: true });

// Táctil
function setupTouch() {
  if (touch.active) return;
  touch.active = true;
  $('touch').hidden = false;
  const stick = $('stick'), knob = $('knob');
  const radius = 55;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    const r = stick.getBoundingClientRect();
    touch.stickId = t.identifier;
    touch.sx = r.left + r.width / 2;
    touch.sy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) {
        let dx = t.clientX - touch.sx, dy = t.clientY - touch.sy;
        const d = Math.hypot(dx, dy);
        if (d > radius) { dx *= radius / d; dy *= radius / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touch.lx = dx / radius;
        touch.ly = -dy / radius;
      } else if (t.identifier === touch.camId) {
        cam.yaw -= (t.clientX - touch.cx) * 0.006;
        cam.pitch = clamp(cam.pitch + (t.clientY - touch.cy) * 0.004, 0.02, 1.25);
        touch.cx = t.clientX;
        touch.cy = t.clientY;
        camManualIdle = 0;
      }
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) {
        touch.stickId = null; touch.lx = 0; touch.ly = 0;
        knob.style.transform = '';
      }
      if (t.identifier === touch.camId) touch.camId = null;
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    if (touch.camId === null) { touch.camId = t.identifier; touch.cx = t.clientX; touch.cy = t.clientY; }
  }, { passive: true });
  const hold = (el, prop) => {
    el.addEventListener('touchstart', (e) => { touch[prop] = true; e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', (e) => { touch[prop] = false; e.preventDefault(); }, { passive: false });
  };
  hold($('btnJump'), 'jump');
  hold($('btnPound'), 'pound');
  $('btnPause').addEventListener('touchstart', (e) => { e.preventDefault(); setPaused(true); }, { passive: false });
}
addEventListener('touchstart', setupTouch, { once: true, passive: true });

let prevPadJump = false, prevPadCrouch = false, prevPadStart = false, prevTouchJump = false, prevTouchPound = false;
function readInput() {
  let mx = 0, my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1;
  let jump = keys.has('Space') || keys.has('KeyK') || keys.has('KeyJ');
  let crouch = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC') || keys.has('KeyL');
  let jumpPressed = pressed.has('Space') || pressed.has('KeyK') || pressed.has('KeyJ');
  let crouchPressed = pressed.has('ShiftLeft') || pressed.has('ShiftRight') || pressed.has('KeyC') || pressed.has('KeyL');
  let camX = 0, camY = 0;
  if (keys.has('KeyQ')) camX -= 1;
  if (keys.has('KeyE')) camX += 1;
  let pausePressed = pressed.has('Escape') || pressed.has('KeyP') || pressed.has('Enter');

  // Táctil
  if (touch.active) {
    mx += touch.lx; my += touch.ly;
    jump = jump || touch.jump;
    crouch = crouch || touch.pound;
    if (touch.jump && !prevTouchJump) jumpPressed = true;
    if (touch.pound && !prevTouchPound) crouchPressed = true;
    prevTouchJump = touch.jump; prevTouchPound = touch.pound;
  }
  // Mando
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    mx += dz(gp.axes[0] || 0);
    my -= dz(gp.axes[1] || 0);
    camX += dz(gp.axes[2] || 0);
    camY += dz(gp.axes[3] || 0);
    const pj = gp.buttons[0]?.pressed;
    const pc = gp.buttons[1]?.pressed || gp.buttons[2]?.pressed || gp.buttons[6]?.pressed || gp.buttons[7]?.pressed;
    const ps = gp.buttons[9]?.pressed;
    if (pj && !prevPadJump) jumpPressed = true;
    if (pc && !prevPadCrouch) crouchPressed = true;
    if (ps && !prevPadStart) pausePressed = true;
    jump = jump || pj; crouch = crouch || pc;
    prevPadJump = pj; prevPadCrouch = pc; prevPadStart = ps;
    break;
  }
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  Object.assign(input, { mx, my, jump, jumpPressed, crouch, crouchPressed, camX, camY, pausePressed });
  if (pressed.has('KeyM')) toggleMute();
  pressed.clear();
}

/* ======================================================================
   Colisiones del mundo
   ====================================================================== */
const solids = [];
const movers = [];
const STEP = 0.45;

function makeSolid(o) {
  o.active = o.active !== false;
  o.delta = new THREE.Vector3();
  solids.push(o);
  return o;
}
function topAt(s, x, z) {
  if (s.type === 'box') return s.max.y;
  if (s.type === 'cyl') return s.y1;
  const c = s.axis === 'x' ? x : z;
  const t = clamp((c - s.a0) / (s.a1 - s.a0), 0, 1);
  return s.h0 + (s.h1 - s.h0) * t;
}
function bottomOf(s, x, z) {
  if (s.type === 'box') return s.min.y;
  if (s.type === 'cyl') return s.y0;
  return topAt(s, x, z) - s.thick;
}
function inFoot(s, x, z, pad) {
  if (s.type === 'box') return x > s.min.x - pad && x < s.max.x + pad && z > s.min.z - pad && z < s.max.z + pad;
  if (s.type === 'cyl') { const dx = x - s.cx, dz = z - s.cz; const r = s.r + pad; return dx * dx + dz * dz < r * r; }
  const a = s.axis === 'x' ? x : z, c = s.axis === 'x' ? z : x;
  return a > Math.min(s.a0, s.a1) - pad && a < Math.max(s.a0, s.a1) + pad && c > s.c0 - pad && c < s.c1 + pad;
}
function pushOut(s, x, z, r) {
  if (s.type === 'cyl') {
    const dx = x - s.cx, dz = z - s.cz, d = Math.hypot(dx, dz), rr = s.r + r;
    if (d >= rr) return null;
    if (d < 1e-6) return [rr, 0];
    const k = (rr - d) / d;
    return [dx * k, dz * k];
  }
  if (s.type !== 'box') return null;
  const cx = clamp(x, s.min.x, s.max.x), cz = clamp(z, s.min.z, s.max.z);
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; return [dx * k, dz * k]; }
  const l = x - s.min.x, rt = s.max.x - x, b = z - s.min.z, f = s.max.z - z, m = Math.min(l, rt, b, f);
  if (m === l) return [-(l + r), 0];
  if (m === rt) return [rt + r, 0];
  if (m === b) return [0, -(b + r)];
  return [0, f + r];
}
function groundAt(x, z, maxY, pad = 0) {
  let best = -Infinity, bs = null;
  for (const s of solids) {
    if (!s.active || !inFoot(s, x, z, pad)) continue;
    const t = topAt(s, x, z);
    if (t <= maxY && t > best) { best = t; bs = s; }
  }
  return { y: best, s: bs };
}
function pointInSolid(x, y, z) {
  for (const s of solids) {
    if (!s.active || s.noCam || !inFoot(s, x, z, 0)) continue;
    if (y < topAt(s, x, z) + 0.2 && y > bottomOf(s, x, z) - 0.2) return true;
  }
  return false;
}

/* ======================================================================
   Construcción del nivel
   ====================================================================== */
function addBox(cx, top, cz, sx, sy, sz, color, opt = {}) {
  const m = shade(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), opt.material || mat(color)), opt.shadow !== false);
  m.position.set(cx, top - sy / 2, cz);
  scene.add(m);
  const s = makeSolid({
    type: 'box', mesh: m,
    min: new THREE.Vector3(cx - sx / 2, top - sy, cz - sz / 2),
    max: new THREE.Vector3(cx + sx / 2, top, cz + sz / 2),
    spring: opt.spring, slide: opt.slide, active: opt.active, move: opt.move, noCam: opt.noCam,
  });
  if (opt.move) { s.base = m.position.clone(); movers.push(s); }
  return s;
}
function addCyl(cx, cz, r, y0, y1, color, opt = {}) {
  const m = shade(new THREE.Mesh(new THREE.CylinderGeometry(opt.rTop ?? r, r, y1 - y0, opt.seg || 20), opt.material || mat(color)), opt.shadow !== false);
  m.position.set(cx, (y0 + y1) / 2, cz);
  if (opt.visible !== false) scene.add(m);
  return makeSolid({ type: 'cyl', cx, cz, r, y0, y1, mesh: m, spring: opt.spring, noCam: opt.noCam });
}
function addRamp(o) {
  const L = o.a1 - o.a0, dh = o.h1 - o.h0, len = Math.hypot(L, dh), ang = Math.atan2(dh, L), w = o.c1 - o.c0;
  const thick = o.thick || 0.6;
  const geo = o.axis === 'x' ? new THREE.BoxGeometry(len, thick, w) : new THREE.BoxGeometry(w, thick, len);
  const m = shade(new THREE.Mesh(geo, mat(o.color)));
  const ma = (o.a0 + o.a1) / 2, mc = (o.c0 + o.c1) / 2, my = (o.h0 + o.h1) / 2 - thick / 2;
  if (o.axis === 'x') { m.position.set(ma, my, mc); m.rotation.z = ang; } else { m.position.set(mc, my, ma); m.rotation.x = -ang; }
  scene.add(m);
  return makeSolid({ type: 'ramp', ...o, thick, mesh: m, slideDir: Math.sign(o.h0 - o.h1) * Math.sign(L) });
}
function addIsland(cx, cz, r, top, grass = 0x6cc551) {
  const g = new THREE.Group();
  const grassM = shade(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.8, 32), mat(grass)), false);
  grassM.position.y = top - 0.4;
  const dirt = shade(new THREE.Mesh(roughen(new THREE.CylinderGeometry(r * 0.99, r * 0.94, 2.4, 18), 0.05), mat(0xb5793f)), false);
  dirt.position.y = top - 2;
  const cone = new THREE.Mesh(roughen(new THREE.ConeGeometry(r * 0.94, r * 1.1, 12, 3), 0.12), mat(0x8c6a52));
  cone.rotation.x = Math.PI;
  cone.position.y = top - 3.2 - r * 0.55;
  g.add(grassM, dirt, cone);
  g.position.set(cx, 0, cz);
  scene.add(g);
  return makeSolid({ type: 'cyl', cx, cz, r, y0: top - 3.2, y1: top, mesh: grassM });
}

// --- Decoración
const decoClouds = [];
function cloudPuff(x, y, z, s = 1) {
  const g = new THREE.Group();
  const m = mat(0xffffff, { emissive: 0x334455 });
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.6, 2.8) * s, 1), m);
    b.position.set((i - n / 2) * 2.2 * s, rand(-0.4, 0.8) * s, rand(-1, 1) * s);
    g.add(b);
  }
  g.position.set(x, y, z);
  scene.add(g);
  decoClouds.push({ g, speed: rand(0.6, 1.4) });
  return g;
}
function tree(x, z, y = 0, h = 3) {
  addCyl(x, z, 0.55, y, y + h, 0x8a5a33, { seg: 7 });
  const leafM = mat(0x3fa34d);
  for (let i = 0; i < 3; i++) {
    const c = shade(new THREE.Mesh(new THREE.ConeGeometry(2.4 - i * 0.6, 2.2, 8), i === 1 ? mat(0x4cb85a) : leafM));
    c.position.set(x, y + h + 0.5 + i * 1.2, z);
    scene.add(c);
  }
}
function rock(x, z, y, r) {
  const m = shade(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(0x9aa0aa)));
  m.position.set(x, y + r * 0.5, z);
  m.rotation.set(rand(0, 3), rand(0, 3), 0);
  scene.add(m);
  makeSolid({ type: 'cyl', cx: x, cz: z, r: r * 0.85, y0: y, y1: y + r * 1.2, mesh: m });
}
function flowers(cx, cz, rad, n, y = 0) {
  const cols = [0xff6fa5, 0xfff36b, 0xffffff, 0xb48cff];
  const stemG = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), headG = new THREE.IcosahedronGeometry(0.14, 0);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), r = Math.sqrt(Math.random()) * rad;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const st = new THREE.Mesh(stemG, mat(0x3c8f3c)); st.position.set(x, y + 0.2, z);
    const hd = new THREE.Mesh(headG, mat(cols[i % cols.length])); hd.position.set(x, y + 0.42, z);
    scene.add(st, hd);
  }
}
function sign(x, z, y, text, rotY = 0) {
  const g = new THREE.Group();
  const post = shade(new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18), mat(0x7a4d2b)));
  post.position.y = 0.7;
  const board = shade(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.14), mat(0xd9a066)));
  board.position.y = 1.5;
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.02), mat(0x5a3416));
  mark.position.set(0, 1.55, 0.08);
  const dot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.02), mat(0x5a3416));
  dot.position.set(0, 1.2, 0.08);
  g.add(post, board, mark, dot);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  scene.add(g);
  makeSolid({ type: 'cyl', cx: x, cz: z, r: 0.35, y0: y, y1: y + 2, mesh: post, noCam: true });
  signs.push({ x, z, y, text });
}
const signs = [];

// Mar de nubes inferior
const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), new THREE.MeshLambertMaterial({ color: 0xf4f0ff }));
cloudSea.rotation.x = -Math.PI / 2;
cloudSea.position.y = -45;
scene.add(cloudSea);
for (let i = 0; i < 40; i++) {
  const a = rand(0, TAU), r = rand(60, 260);
  cloudPuff(Math.cos(a) * r, rand(-40, -30), Math.sin(a) * r, rand(2, 4));
}
for (let i = 0; i < 22; i++) {
  const a = rand(0, TAU), r = rand(70, 220);
  cloudPuff(Math.cos(a) * r, rand(10, 55), Math.sin(a) * r, rand(1, 2.2));
}

// ---------- Isla principal (Prado Nimbo)
const SPAWN = new THREE.Vector3(0, 0, 14);
addIsland(0, 0, 30, 0, 0x5fb848);
flowers(0, 0, 26, 140, 0);
tree(14, -6); tree(19, 7); tree(-17, -10); tree(-22, 7); tree(9, 22); tree(-6, -25, 0, 2.6); tree(23, -15, 0, 2.4);
rock(-9, 9, 0, 1.1); rock(24, 2, 0, 1.4); rock(-25, -4, 0, 1.2); rock(5, -22, 0, 0.9);

// Terrazas
addBox(18, 1.2, 14, 6, 1.2, 6, 0x9fd36a);
addBox(18.8, 2.4, 14.8, 3.6, 1.2, 3.6, 0x8cc95c);

// Faro de Cristal
const TOWER = { x: 0, z: -12 };
addCyl(TOWER.x, TOWER.z, 4, -1, 29.4, 0xf5f1e8, { seg: 24 });
for (let i = 0; i < 5; i++) {
  const band = new THREE.Mesh(new THREE.CylinderGeometry(4.06, 4.06, 1.6, 24), mat(0xe2474b));
  band.position.set(TOWER.x, 3 + i * 6, TOWER.z);
  scene.add(band);
}
for (let i = 0; i < 6; i++) {
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.2), mat(0x2b3a67));
  const a = i * 1.7 + 0.4, y = 6 + i * 4;
  win.position.set(TOWER.x + Math.sin(a) * 4.02, y, TOWER.z + Math.cos(a) * 4.02);
  win.rotation.y = a;
  scene.add(win);
}
addCyl(TOWER.x, TOWER.z, 5.5, 29.4, 30.2, 0xd8d2c4, { seg: 24 });
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * TAU;
  addCyl(TOWER.x + Math.cos(a) * 3.4, TOWER.z + Math.sin(a) * 3.4, 0.25, 30.2, 34, 0xd8d2c4, { seg: 6 });
}
const roof = shade(new THREE.Mesh(new THREE.ConeGeometry(4.6, 3, 12), mat(0xe2474b)));
roof.position.set(TOWER.x, 35.4, TOWER.z);
scene.add(roof);
const roofCap = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.3, 12), mat(0xb83236));
roofCap.position.set(TOWER.x, 34, TOWER.z);
scene.add(roofCap);
const lampMat = new THREE.MeshStandardMaterial({ color: 0xbff6ff, emissive: 0x6fdfff, emissiveIntensity: 0.1, transparent: true, opacity: 0.9 });
const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), lampMat);
lamp.position.set(TOWER.x, 36.3 - 1.4, TOWER.z);
lamp.position.y = 33.3;
scene.add(lamp);
const beam = new THREE.Mesh(
  new THREE.ConeGeometry(6, 70, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false })
);
beam.geometry.translate(0, -35, 0);
beam.rotation.z = Math.PI / 2;
const beamPivot = new THREE.Group();
beamPivot.position.copy(lamp.position);
beamPivot.add(beam);
scene.add(beamPivot);

// Escalera en espiral alrededor del faro
const towerSteps = [];
for (let i = 0; i < 15; i++) {
  const a = Math.PI * 0.5 + i * 0.75;
  const x = TOWER.x + Math.cos(a) * 7.2, z = TOWER.z + Math.sin(a) * 7.2;
  const top = 1.8 + i * 1.9;
  addBox(x, top, z, 2.8, 0.6, 2.8, i % 2 ? 0xe9d8b5 : 0xd9c39a);
  towerSteps.push({ x, z, top });
}

// Muelles (resortes)
const springs = [];
function addSpring(x, z, y) {
  const base = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.3, 14), mat(0x3a3f63)));
  base.position.set(x, y + 0.15, z);
  const top = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 14), mat(0xff4f7b)));
  top.position.set(x, y + 0.42, z);
  scene.add(base, top);
  const s = makeSolid({ type: 'cyl', cx: x, cz: z, r: 0.9, y0: y, y1: y + 0.5, spring: true, mesh: top });
  springs.push({ s, top, y, squash: 0 });
}
addSpring(-10, 2, 0);
addBox(-14, 5.5, -2, 4, 1, 4, 0xc8a0ff);

// Botón de las nubes
const button = { x: -12, z: 20, pressed: false, timer: 0, lastTick: 0 };
{
  const base = shade(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.3, 18), mat(0x6c7086)));
  base.position.set(button.x, 0.15, button.z);
  scene.add(base);
  button.solid = addCyl(button.x, button.z, 1.25, 0, 0.6, 0xff3d57, { seg: 18 });
  button.mesh = button.solid.mesh;
}
// Plataformas de nube temporales
const cloudSteps = [];
[[-8, 1.6, 33], [-4, 3.4, 37.5], [0, 5.2, 42], [4, 7, 46.5], [2, 8.8, 51], [-2, 10.6, 55.5]].forEach(([x, top, z]) => {
  const s = addBox(x, top, z, 3.2, 0.8, 3.2, 0xffffff, { material: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x88aacc, transparent: true, opacity: 0.95 }), active: false });
  s.mesh.visible = false;
  cloudSteps.push(s);
});

// Isla alta del cielo (sur) y tobogán de regreso
addIsland(0, 64, 8, 12, 0x86d86a);
flowers(0, 64, 6, 30, 12);
tree(-4, 68, 12, 2.2);
addRamp({ axis: 'z', a0: 27, a1: 57, h0: 0, h1: 12, c0: 6.5, c1: 10.5, color: 0x6fd3ff, slide: true });

// ---------- Hacia el este: Isla del Viento
addBox(35, 1.5, 0, 4, 1, 4, 0xd9c39a);
addBox(45, 3, 0, 4, 0.8, 4, 0xffb347, { move: { axis: 'x', amp: 5, speed: 0.7 } });
addBox(55, 4.5, 0, 4, 1, 4, 0xd9c39a);
addBox(60, 4.5, 0, 3.4, 0.8, 3.4, 0xffb347, { move: { axis: 'y', amp: 2.2, speed: 0.8, phase: -Math.PI / 2 } });
const EAST = { x: 74, z: 0, top: 7 };
addIsland(EAST.x, EAST.z, 11, EAST.top, 0x7fd65e);
flowers(EAST.x, EAST.z, 9, 50, EAST.top);
tree(68, -6, 7, 2.6);
addCyl(78, -4, 1.6, 7, 14, 0xb3b9c9, { seg: 10 });
addBox(76, 12, 0, 3, 0.8, 3, 0xc8a0ff);
addSpring(72, 5, 7);

// ---------- Hacia el oeste: Puente y Arena del Rey
addRamp({ axis: 'x', a0: -28, a1: -58.5, h0: 0, h1: 4, c0: -2.6, c1: 2.6, color: 0xa86b3c });
for (let x = -30; x > -58; x -= 4) {
  const h = (x + 28) / -30.5 * 4;
  for (const z of [-2.8, 2.8]) {
    const p = shade(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), mat(0x7a4d2b)));
    p.position.set(x, h + 0.4, z);
    scene.add(p);
  }
}
const ARENA = { x: -74, z: 0, top: 4, r: 16 };
addIsland(ARENA.x, ARENA.z, ARENA.r, ARENA.top, 0xa7c76a);
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * TAU + 0.3;
  if (Math.abs(Math.cos(a) - 1) < 0.05) continue;
  const px = ARENA.x + Math.cos(a) * 15, pz = ARENA.z + Math.sin(a) * 15;
  if (px > ARENA.x + 13) continue; // deja libre la entrada del puente
  addCyl(px, pz, 0.8, ARENA.top, ARENA.top + 3 + (i % 3), 0xb3b9c9, { seg: 8 });
}

// Pedestal de los fragmentos
addCyl(16, -18, 1.6, 0, 1, 0xe0d7ff, { seg: 12 });

// Carteles
sign(3.5, 9, 0, 'Encadena saltos al aterrizar: <b>salto, doble salto y triple salto</b>. Corre y pulsa <b>Shift + Espacio</b> para un salto largo.', 0.3);
sign(-9, 17, 0, 'Haz un <b>golpe en el suelo</b> (Shift en el aire) sobre el botón rojo… ¡y date prisa!', -0.6);
sign(26, 3, 0, 'Al este, la Isla del Viento. ¡Espera a que las plataformas lleguen a ti!', 1.5);
sign(-25, 4, 0, 'Al oeste vive el <b>Rey Pedrusco</b>. Cuando se maree tras su gran salto, ¡salta sobre su cabeza!', -1.5);
sign(13, -15, 0, 'Encuentra los <b>8 fragmentos azules</b> escondidos en las islas y aparecerá un Cristal en este pedestal.', 0.8);
sign(-3.5, 9, 0, 'Reúne <b>50 monedas</b> y un Cristal aparecerá aquí, en el prado. Las monedas también te curan.', -0.3);

/* ======================================================================
   Objetos coleccionables
   ====================================================================== */
const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18).rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0x8a5a00, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.35 });
const coins = [];
function addCoin(x, y, z, pop = false) {
  const m = shade(new THREE.Mesh(coinGeo, coinMat));
  m.position.set(x, y, z);
  scene.add(m);
  const c = { m, alive: true, vy: pop ? rand(6, 9) : 0, vx: pop ? rand(-2, 2) : 0, vz: pop ? rand(-2, 2) : 0, falling: pop, age: 0 };
  coins.push(c);
  return c;
}
function ringCoins(cx, y, cz, r, n) {
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; addCoin(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); }
}
function lineCoins(a, b, n, yFn) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t);
    addCoin(x, yFn ? yFn(x, z) : lerp(a[1], b[1], t), z);
  }
}
ringCoins(0, 0.9, 4, 3, 8);
towerSteps.forEach((s) => addCoin(s.x, s.top + 0.9, s.z));
addCoin(35, 2.4, 0);
lineCoins([41, 4.1, 0], [50, 4.1, 0], 4);
ringCoins(EAST.x, EAST.top + 0.9, EAST.z, 5, 8);
lineCoins([-31, 0, 0], [-55, 0, 0], 6, (x) => (x + 28) / -30.5 * 4 + 0.9);
ringCoins(ARENA.x, ARENA.top + 0.9, ARENA.z, 8, 8);
lineCoins([-15.5, 6.4, -2], [-12.5, 6.4, -2], 4);
lineCoins([17.6, 3.3, 14.8], [20, 3.3, 14.8], 3);
cloudSteps.forEach((s) => addCoin((s.min.x + s.max.x) / 2, s.max.y + 0.9, (s.min.z + s.max.z) / 2));
ringCoins(0, 12.9, 64, 4, 6);
lineCoins([8.5, 0, 50], [8.5, 0, 32], 6, (x, z) => (z - 27) / 30 * 12 + 0.9);

// Fragmentos azules
const fragGeo = new THREE.OctahedronGeometry(0.42, 0);
const fragMat = new THREE.MeshStandardMaterial({ color: 0x4fc3ff, emissive: 0x1a6fff, emissiveIntensity: 0.8, roughness: 0.2 });
const frags = [];
[
  [towerSteps[7].x, towerSteps[7].top + 1.1, towerSteps[7].z],
  [14, 5.2, -6],
  [-14, 6.7, -2],
  [76, 13.2, 0],
  [-44, (-44 + 28) / -30.5 * 4 + 1.1, 0],
  [-85, 5.2, 9],
  [-4, 13.4, 60],
  [8.5, (42 - 27) / 30 * 12 + 1.2, 42],
].forEach(([x, y, z]) => {
  const m = shade(new THREE.Mesh(fragGeo, fragMat));
  m.position.set(x, y, z);
  scene.add(m);
  frags.push({ m, alive: true, by: y });
});

// Vidas extra
const lifeMat = new THREE.MeshStandardMaterial({ color: 0x5cff8d, emissive: 0x0c8a3a, emissiveIntensity: 0.7 });
const lifeOrbs = [];
[[0, 1.2, -26], [3, 13.2, 68]].forEach(([x, y, z]) => {
  const m = shade(new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), lifeMat));
  m.position.set(x, y, z);
  scene.add(m);
  lifeOrbs.push({ m, alive: true, by: y });
});

// Cristales
const CRYSTALS = [
  { id: 'faro', name: 'La cima del Faro', hint: 'Sube la escalera en espiral del faro.', pos: [0, 31.8, -12], color: 0x8ff0ff, visible: true },
  { id: 'viento', name: 'El pilar de la Isla del Viento', hint: 'Cruza las plataformas del este y usa el muelle.', pos: [78, 15.6, -4], color: 0x9dff8f, visible: true },
  { id: 'rey', name: 'La caída del Rey Pedrusco', hint: 'Vence al jefe de la arena del oeste.', pos: [-74, 6.2, 0], color: 0xffc46b, visible: false },
  { id: 'fragmentos', name: 'Ocho fragmentos azules', hint: 'Reúne los 8 fragmentos y vuelve al pedestal.', pos: [16, 2.8, -18], color: 0x6fc8ff, visible: false },
  { id: 'nubes', name: 'El interruptor de las nubes', hint: 'Golpea el botón rojo y sube por las nubes.', pos: [0, 14.2, 64], color: 0xff9be0, visible: true },
  { id: 'monedas', name: 'El tesoro de 50 monedas', hint: 'Reúne 50 monedas en una sola partida.', pos: [0, 2.2, 4], color: 0xfff27a, visible: false },
];
const crystalGeo = new THREE.OctahedronGeometry(0.9, 0);
const haloGeo = new THREE.SphereGeometry(1.5, 16, 12);
CRYSTALS.forEach((c) => {
  const g = new THREE.Group();
  const m = shade(new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1, flatShading: true })));
  m.scale.y = 1.4;
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.18, depthWrite: false }));
  g.add(m, halo);
  g.position.set(...c.pos);
  scene.add(g);
  c.g = g; c.gem = m; c.halo = halo; c.active = c.visible; c.appear = c.visible ? 1 : 0;
  g.visible = c.visible;
});

/* ======================================================================
   Partículas
   ====================================================================== */
const partGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const partPool = [];
for (let i = 0; i < 220; i++) {
  const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  m.visible = false;
  scene.add(m);
  partPool.push({ m, life: 0, max: 1, v: new THREE.Vector3(), g: 0 });
}
let partIdx = 0;
function burst(pos, color, n, speed = 4, grav = 12, life = 0.6, size = 1, up = 0.5) {
  for (let i = 0; i < n; i++) {
    const p = partPool[partIdx++ % partPool.length];
    p.m.material.color.setHex(color);
    p.m.position.copy(pos);
    p.m.scale.setScalar(size * rand(0.6, 1.2));
    p.m.visible = true;
    const a = rand(0, TAU);
    p.v.set(Math.cos(a) * rand(0.3, 1) * speed, rand(0, 1) * speed * up + speed * up * 0.5, Math.sin(a) * rand(0.3, 1) * speed);
    p.g = grav;
    p.life = p.max = life * rand(0.7, 1.2);
  }
}
function updateParticles(dt) {
  for (const p of partPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.v.y -= p.g * dt;
    p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
    p.m.material.opacity = Math.min(1, (p.life / p.max) * 1.6);
  }
}

/* ======================================================================
   Orbi (jugador)
   ====================================================================== */
function buildOrbi() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = 0.8;
  root.add(model);
  model.add(spin);
  const skin = new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.55 });
  const body = shade(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), skin));
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffe2b8, roughness: 0.6 }));
  belly.position.set(0, -0.12, 0.27);
  belly.scale.set(1, 1, 0.6);
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const eyeB = new THREE.MeshBasicMaterial({ color: 0x14182e });
  const eyes = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), eyeW);
    w.scale.set(0.85, 1.25, 0.6);
    w.position.set(sx * 0.2, 0.17, 0.53);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeB);
    b.position.set(sx * 0.2, 0.18, 0.62);
    spin.add(w, b);
    eyes.push(w, b);
  }
  const blush = new THREE.MeshBasicMaterial({ color: 0xff4f7b, transparent: true, opacity: 0.5 });
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), blush);
    c.position.set(sx * 0.36, 0.0, 0.5);
    c.rotation.y = sx * 0.6;
    spin.add(c);
  }
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0x2fb3ff, roughness: 0.7 });
  const scarf = shade(new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.11, 8, 24), scarfMat));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = -0.2;
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.15, -0.2, -0.6);
  const tail = shade(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.55), scarfMat));
  tail.position.z = -0.25;
  tailPivot.add(tail);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0x3a3f63 }));
  ant.position.set(0, 0.8, -0.05);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff27a, emissive: 0xffd23f, emissiveIntensity: 1 }));
  orb.position.set(0, 1.05, -0.05);
  const handMat = new THREE.MeshStandardMaterial({ color: 0xff8f57, roughness: 0.55 });
  const hands = [-1, 1].map((sx) => {
    const h = shade(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), handMat));
    h.position.set(sx * 0.66, -0.1, 0.05);
    spin.add(h);
    return h;
  });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x6b3b2a, roughness: 0.7 });
  const feet = [-1, 1].map((sx) => {
    const f = shade(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), footMat));
    f.scale.set(1, 0.6, 1.4);
    f.position.set(sx * 0.26, -0.66, 0.05);
    spin.add(f);
    return f;
  });
  spin.add(body, belly, scarf, tailPivot, ant, orb);
  return { root, model, spin, hands, feet, tailPivot, orb, eyes };
}

const orbi = buildOrbi();
scene.add(orbi.root);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

const R = 0.48, H = 1.5;
const RUN = 9.5, GRAV = 38;
const player = {
  pos: SPAWN.clone(), vel: new THREE.Vector3(), facing: Math.PI,
  grounded: true, ground: null, state: 'ground', combo: 0, sinceLand: 1, coyote: 0, jumpBuf: 0,
  cutable: false, airTime: 0, wallTimer: 0, wallN: [0, 0], poundTimer: 0, hurtTimer: 0, invuln: 0,
  frozen: 0, squash: 1, runPhase: 0, flip: 0, flipSpeed: 0, celebrate: 0, dead: false,
};

/* ======================================================================
   Enemigos
   ====================================================================== */
const enemies = [];
const bloMat = new THREE.MeshStandardMaterial({ color: 0x8e5bd6, roughness: 0.4 });
function addBloblo(x, z, y) {
  const g = new THREE.Group();
  const body = shade(new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 12), bloMat));
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.62;
  g.add(body);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    w.position.set(sx * 0.26, 0.85, 0.66);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14182e }));
    b.position.set(sx * 0.26, 0.83, 0.8);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.06), new THREE.MeshBasicMaterial({ color: 0x2a1640 }));
    brow.position.set(sx * 0.26, 1.06, 0.74);
    brow.rotation.z = sx * 0.4;
    g.add(w, b, brow);
  }
  const bump = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
  bump.position.y = 1.35;
  g.add(bump);
  g.position.set(x, y, z);
  scene.add(g);
  enemies.push({ kind: 'blob', g, body, home: new THREE.Vector3(x, y, z), x, z, y, dir: rand(0, TAU), t: rand(0, 5), alive: true, dying: 0, speed: 0 });
}
const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a3f63, roughness: 0.5 });
const spikeTipMat = new THREE.MeshStandardMaterial({ color: 0xdfe3f0, roughness: 0.3 });
function addRoller(path, speed, phase = 0) {
  const g = new THREE.Group();
  const ball = shade(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), spikeMat));
  g.add(ball);
  const ico = new THREE.IcosahedronGeometry(0.75, 0);
  const p = ico.attributes.position;
  const seen = new Set();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const k = v.toArray().map((n) => n.toFixed(2)).join();
    if (seen.has(k)) continue;
    seen.add(k);
    const c = shade(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), spikeTipMat));
    c.position.copy(v.clone().multiplyScalar(1.15));
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    g.add(c);
  }
  scene.add(g);
  enemies.push({ kind: 'roller', g, path, speed, t: phase, alive: true });
}
addBloblo(12, 3, 0); addBloblo(-18, 12, 0); addBloblo(20, -12, 0);
addBloblo(71, -3, EAST.top); addBloblo(80, 4, EAST.top);
addBloblo(3, 61, 12);
const bridgeY = (x) => (x + 28) / -30.5 * 4;
[[-36, 2.4, 0], [-44, 3.1, 1.6], [-52, 2.7, 3.1]].forEach(([x, sp, ph]) => {
  addRoller((t) => [x, bridgeY(x) + 0.95, Math.sin(t) * 2], sp, ph);
});
addRoller((t) => [EAST.x + Math.cos(t) * 8.5, EAST.top + 0.95, EAST.z + Math.sin(t) * 8.5], 0.55, 0);

// ---------- Jefe: Rey Pedrusco
const boss = (() => {
  const g = new THREE.Group();
  const body = shade(new THREE.Mesh(roughen(new THREE.DodecahedronGeometry(2.2, 1), 0.06), mat(0x8f8a93)));
  body.position.y = 2.1;
  body.scale.set(1, 0.95, 1);
  g.add(body);
  const face = new THREE.Group();
  face.position.set(0, 2.4, 1.9);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    e.position.set(sx * 0.6, 0.2, 0);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14182e }));
    p.position.set(sx * 0.6, 0.18, 0.25);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.14), mat(0x4b4650));
    brow.position.set(sx * 0.6, 0.62, 0.15);
    brow.rotation.z = sx * 0.35;
    face.add(e, p, brow);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0x2a2530 }));
  mouth.position.set(0, -0.5, 0.15);
  face.add(mouth);
  g.add(face);
  const crown = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0x7a4d00, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.5, 10), gold);
  crown.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 5), gold);
    sp.position.set(Math.cos(a) * 1.0, 0.55, Math.sin(a) * 1.0);
    crown.add(sp);
  }
  crown.position.y = 4.2;
  g.add(crown);
  const stars = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
    s.position.set(Math.cos((i / 4) * TAU) * 1.6, 0, Math.sin((i / 4) * TAU) * 1.6);
    stars.add(s);
  }
  stars.position.y = 5;
  stars.visible = false;
  g.add(stars);
  for (const sx of [-1, 1]) {
    const arm = shade(new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), mat(0x7c7780)));
    arm.position.set(sx * 2.3, 1.6, 0.3);
    g.add(arm);
  }
  g.position.set(ARENA.x - 4, ARENA.top, ARENA.z);
  g.rotation.y = Math.PI / 2;
  scene.add(g);
  return {
    g, body, stars, crown, x: ARENA.x - 4, z: ARENA.z, y: ARENA.top, hp: 3, state: 'sleep', t: 0, facing: Math.PI / 2,
    from: new THREE.Vector2(), to: new THREE.Vector2(), flash: 0, scale: 1,
  };
})();

/* ======================================================================
   Estado del juego / HUD
   ====================================================================== */
const SAVE_KEY = 'orbi-faro-save-v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ crystals: [...game.crystals], muted: audio.muted })); } catch { /* sin almacenamiento */ }
}
const saved = loadSave();
const game = {
  state: 'title', time: 0, playTime: 0, coins: 0, frags: 0, hearts: 3, lives: 4,
  crystals: new Set(saved.crystals || []), shake: 0, bannerTimer: 0, won: false,
};
audio.muted = !!saved.muted;

CRYSTALS.forEach((c) => {
  if (game.crystals.has(c.id)) {
    // Ya conseguido: se muestra translúcido como recuerdo
    c.gem.material.transparent = true;
    c.gem.material.opacity = 0.35;
  }
});
if (game.crystals.has('rey')) { boss.state = 'gone'; boss.g.visible = false; }

const cam = { yaw: 0, pitch: 0.32, dist: 11, target: new THREE.Vector3().copy(SPAWN).add(new THREE.Vector3(0, 1.4, 0)) };

function updateHUD() {
  $('hudCrystals').textContent = game.crystals.size;
  $('hudCoins').textContent = game.coins;
  $('hudFrags').textContent = game.frags;
  $('hudFragBox').hidden = game.frags === 0 || game.frags >= 8 && game.crystals.has('fragmentos');
  $('hudLives').textContent = game.lives;
  $('hudHearts').innerHTML = [0, 1, 2].map((i) => `<span class="heart${i < game.hearts ? '' : ' empty'}">♥</span>`).join('');
}
function banner(title, sub = '', dur = 2.6) {
  $('bannerTitle').textContent = title;
  $('bannerSub').innerHTML = sub;
  const b = $('banner');
  b.hidden = true;
  void b.offsetWidth;
  b.hidden = false;
  game.bannerTimer = dur;
}
function renderCrystalList() {
  $('crystalList').innerHTML = CRYSTALS.map((c) => {
    const done = game.crystals.has(c.id);
    return `<li class="${done ? 'done' : ''}"><span class="gem">◆</span><span>${done ? c.name : '???'}<small>${c.hint}</small></span></li>`;
  }).join('');
}
function setPaused(p) {
  if (p && game.state !== 'play') return;
  if (!p && game.state !== 'pause') return;
  game.state = p ? 'pause' : 'play';
  $('pause').hidden = !p;
  if (p) {
    renderCrystalList();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  $('muteBtn').textContent = 'Sonido: ' + (audio.muted ? 'no' : 'sí');
  writeSave();
}
$('muteBtn').textContent = 'Sonido: ' + (audio.muted ? 'no' : 'sí');
$('muteBtn').addEventListener('click', toggleMute);
$('resumeBtn').addEventListener('click', () => setPaused(false));
let resetArmed = false;
$('resetBtn').addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    $('resetBtn').textContent = '¿Seguro? Pulsa otra vez';
    setTimeout(() => { resetArmed = false; $('resetBtn').textContent = 'Borrar progreso'; }, 3000);
    return;
  }
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nada */ }
  location.reload();
});
function startGame() {
  if (game.state !== 'title') return;
  audio.init();
  game.state = 'play';
  $('title').hidden = true;
  $('hud').hidden = false;
  updateHUD();
  banner('Islas Nimbo', game.crystals.size ? `Cristales: ${game.crystals.size} de 6` : 'Encuentra los 6 Cristales del Faro', 3);
}
$('startBtn').addEventListener('click', startGame);

/* ======================================================================
   Lógica del jugador
   ====================================================================== */
function hurt(fromX, fromZ, dmg = 1) {
  const p = player;
  if (p.invuln > 0 || p.dead || p.frozen > 0) return;
  game.hearts -= dmg;
  updateHUD();
  audio.play('hurt');
  game.shake = 0.3;
  burst(new THREE.Vector3(p.pos.x, p.pos.y + 0.8, p.pos.z), 0xff5d8f, 10, 5);
  if (game.hearts <= 0) { die(); return; }
  p.invuln = 1.8;
  const dx = p.pos.x - fromX, dz = p.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
  p.vel.set((dx / d) * 9, 9, (dz / d) * 9);
  p.grounded = false;
  p.state = 'hurt';
  p.hurtTimer = 0.5;
  p.combo = 0;
}
function die() {
  const p = player;
  if (p.dead) return;
  p.dead = true;
  audio.play('die');
  $('fade').classList.add('on');
  setTimeout(() => {
    game.lives -= 1;
    if (game.lives < 0) {
      game.lives = 4;
      game.coins = 0;
      banner('¡Fin del juego!', 'Tus Cristales siguen a salvo. ¡Inténtalo de nuevo!', 3);
    }
    game.hearts = 3;
    p.pos.copy(SPAWN);
    p.vel.set(0, 0, 0);
    p.facing = Math.PI;
    p.state = 'ground';
    p.grounded = true;
    p.invuln = 1.5;
    p.dead = false;
    cam.yaw = 0;
    cam.target.copy(SPAWN).y += 1.4;
    updateHUD();
    $('fade').classList.remove('on');
  }, 1100);
}

function doJump(vy, kind) {
  const p = player;
  p.vel.y = vy;
  p.grounded = false;
  p.ground = null;
  p.jumpBuf = 0;
  p.coyote = 0;
  p.squash = 1.35;
  p.airTime = 0;
  audio.play(kind);
  burst(new THREE.Vector3(p.pos.x, p.pos.y + 0.1, p.pos.z), 0xf5f0e0, 5, 2.5, 4, 0.4, 0.8, 0.3);
}

function updatePlayer(dt) {
  const p = player;
  p.invuln -= dt;
  p.celebrate = Math.max(0, p.celebrate - dt);
  if (p.dead) return;
  if (p.frozen > 0) { p.frozen -= dt; p.vel.set(0, 0, 0); return; }

  // Dirección deseada relativa a la cámara
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let dx = fx * input.my + rx * input.mx, dz = fz * input.my + rz * input.mx;
  const mag = Math.min(1, Math.hypot(dx, dz));
  if (mag > 0.001) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }

  if (input.jumpPressed) p.jumpBuf = 0.14;
  else p.jumpBuf -= dt;
  p.coyote -= dt;
  p.wallTimer -= dt;
  if (p.grounded) p.sinceLand += dt;
  else p.airTime += dt;
  if (p.grounded && p.sinceLand > 0.25 && p.combo) p.combo = 0;

  const sp = Math.hypot(p.vel.x, p.vel.z);

  if (p.state === 'pound') {
    p.poundTimer -= dt;
    p.vel.x = 0; p.vel.z = 0;
    if (p.poundTimer > 0) p.vel.y = 0;
    else p.vel.y = -34;
  } else if (p.state === 'hurt') {
    p.hurtTimer -= dt;
    if (p.hurtTimer <= 0 && p.grounded) p.state = 'ground';
    p.vel.y -= GRAV * dt;
  } else {
    // Velocidad horizontal
    const crouching = input.crouch && p.grounded;
    const slide = p.grounded && p.ground && p.ground.slide;
    let tx = dx * RUN * mag, tz = dz * RUN * mag;
    if (crouching) { tx = 0; tz = 0; }
    let acc;
    if (p.grounded) acc = slide ? 6 : (mag > 0.05 ? 48 : 34);
    else acc = p.state === 'long' ? 3 : 20;
    const keepMomentum = !p.grounded && mag < 0.05;
    if (!keepMomentum) {
      const ddx = tx - p.vel.x, ddz = tz - p.vel.z, dl = Math.hypot(ddx, ddz), stepA = acc * dt;
      if (dl <= stepA) { p.vel.x = tx; p.vel.z = tz; } else { p.vel.x += (ddx / dl) * stepA; p.vel.z += (ddz / dl) * stepA; }
    }
    if (slide) {
      const g = p.ground;
      const k = 30 * dt * g.slideDir;
      if (g.axis === 'z') p.vel.z += k; else p.vel.x += k;
      const s2 = Math.hypot(p.vel.x, p.vel.z);
      if (s2 > 22) { p.vel.x *= 22 / s2; p.vel.z *= 22 / s2; }
    }
    // Orientación
    const vsp = Math.hypot(p.vel.x, p.vel.z);
    if (p.state !== 'long') {
      if (mag > 0.1) p.facing += angDiff(p.facing, Math.atan2(dx, dz)) * Math.min(1, dt * (p.grounded ? 16 : 6));
      else if (slide && vsp > 1) p.facing += angDiff(p.facing, Math.atan2(p.vel.x, p.vel.z)) * Math.min(1, dt * 8);
    }

    // Saltos
    if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
      if (input.crouch && sp > 4 && p.grounded) {
        const s = Math.max(sp * 1.45, 15.5);
        p.vel.x = Math.sin(p.facing) * s;
        p.vel.z = Math.cos(p.facing) * s;
        doJump(10, 'long');
        p.state = 'long'; p.combo = 0; p.cutable = false;
      } else if (p.combo === 2 && p.sinceLand < 0.25 && sp > 6) {
        doJump(19.5, 'jump3');
        p.state = 'triple'; p.combo = 3; p.cutable = false; p.flip = 0;
      } else if (p.combo === 1 && p.sinceLand < 0.25 && sp > 3) {
        doJump(15.5, 'jump2');
        p.state = 'air'; p.combo = 2; p.cutable = true;
      } else {
        doJump(13, 'jump');
        p.state = 'air'; p.combo = 1; p.cutable = true;
      }
    } else if (p.jumpBuf > 0 && !p.grounded && p.wallTimer > 0) {
      const [nx, nz] = p.wallN;
      p.vel.x = nx * 10;
      p.vel.z = nz * 10;
      p.facing = Math.atan2(nx, nz);
      doJump(14.5, 'wall');
      p.state = 'air'; p.combo = 0; p.cutable = false; p.wallTimer = 0;
      burst(new THREE.Vector3(p.pos.x - nx * 0.5, p.pos.y + 1, p.pos.z - nz * 0.5), 0xffffff, 6, 3);
    }
    // Altura variable
    if (p.cutable && !input.jump && p.vel.y > 0) { p.vel.y *= 0.5; p.cutable = false; }
    // Golpe en el suelo
    if (input.crouchPressed && !p.grounded && p.airTime > 0.08) {
      p.state = 'pound';
      p.poundTimer = 0.26;
      p.vel.set(0, 0, 0);
      p.flip = 0;
      p.cutable = false;
      audio.tone(700, 0.2, 'triangle', 0.1, 300);
    }
    p.vel.y -= GRAV * dt;
  }
  if (p.state !== 'pound') p.vel.y = Math.max(p.vel.y, -32);

  // --- Integración con colisiones (sub-pasos)
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) physicsStep(h);

  if (p.pos.y < -28) die();
}

function physicsStep(dt) {
  const p = player;
  const prevFeet = p.pos.y;
  const prevHead = p.pos.y + H;
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;

  // Paredes
  for (const s of solids) {
    if (!s.active || s.type === 'ramp') continue;
    const top = topAt(s, p.pos.x, p.pos.z), bot = bottomOf(s, p.pos.x, p.pos.z);
    if (p.pos.y >= top - STEP || p.pos.y + H <= bot) continue;
    const push = pushOut(s, p.pos.x, p.pos.z, R);
    if (!push) continue;
    p.pos.x += push[0];
    p.pos.z += push[1];
    const pl = Math.hypot(push[0], push[1]) || 1;
    const nx = push[0] / pl, nz = push[1] / pl;
    const vn = p.vel.x * nx + p.vel.z * nz;
    if (vn < 0) {
      if (!p.grounded && -vn > 3) { p.wallN = [nx, nz]; p.wallTimer = 0.2; }
      p.vel.x -= nx * vn;
      p.vel.z -= nz * vn;
    }
  }

  // Vertical
  p.pos.y += p.vel.y * dt;
  if (p.vel.y <= 0) {
    const reach = p.grounded ? 0.6 : 0.02;
    let best = -Infinity, bs = null;
    for (const s of solids) {
      if (!s.active || !inFoot(s, p.pos.x, p.pos.z, R * 0.55)) continue;
      const t = topAt(s, p.pos.x, p.pos.z);
      if (t <= prevFeet + STEP && t >= p.pos.y - reach && t > best) { best = t; bs = s; }
    }
    if (bs) {
      p.pos.y = best;
      if (!p.grounded) land(bs);
      p.ground = bs;
      p.grounded = true;
      if (p.vel.y < 0) p.vel.y = 0;
    } else if (p.grounded) {
      p.grounded = false;
      p.ground = null;
      p.coyote = 0.1;
      p.airTime = 0;
      if (p.state === 'ground') p.state = 'air';
    }
  } else {
    p.grounded = false;
    // Techos
    for (const s of solids) {
      if (!s.active || s.type !== 'box' || !inFoot(s, p.pos.x, p.pos.z, -R * 0.3)) continue;
      if (prevHead <= s.min.y + 0.05 && p.pos.y + H > s.min.y) {
        p.pos.y = s.min.y - H;
        p.vel.y = 0;
        p.cutable = false;
      }
    }
  }
}

function land(s) {
  const p = player;
  const wasPound = p.state === 'pound';
  const fall = -p.vel.y;
  p.sinceLand = 0;
  p.wallTimer = 0;
  if (s.spring) {
    const sp = springs.find((x) => x.s === s);
    if (sp) sp.squash = 1;
    p.vel.y = wasPound ? 27 : 22;
    p.state = 'air';
    p.combo = 0;
    p.cutable = false;
    p.grounded = false;
    p.squash = 1.5;
    p.flip = 0;
    p.state = 'triple';
    audio.play('spring');
    return true;
  }
  p.squash = wasPound ? 0.55 : clamp(1 - fall * 0.02, 0.65, 0.95);
  if (wasPound) {
    audio.play('pound');
    game.shake = 0.35;
    burst(new THREE.Vector3(p.pos.x, p.pos.y + 0.1, p.pos.z), 0xffffff, 18, 7, 6, 0.5, 1, 0.2);
    p.frozen = 0.18;
    if (s === button.solid) pressButton();
    p.combo = 0;
  } else if (fall > 8) {
    burst(new THREE.Vector3(p.pos.x, p.pos.y + 0.1, p.pos.z), 0xf5f0e0, 6, 3, 4, 0.4, 0.8, 0.2);
  }
  if (p.state === 'triple' || p.state === 'long' || p.state === 'hurt') p.combo = 0;
  if (p.state === 'long') { p.vel.x *= 0.5; p.vel.z *= 0.5; }
  if (p.state !== 'hurt' || p.hurtTimer <= 0) p.state = 'ground';
  p.flip = 0;
  return false;
}

function animatePlayer(dt) {
  const p = player, o = orbi;
  o.root.position.copy(p.pos);
  o.model.rotation.y = p.facing;
  p.squash = lerp(p.squash, 1, 1 - Math.exp(-dt * 10));
  o.model.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
  const sp = Math.hypot(p.vel.x, p.vel.z);
  const t = game.time;
  o.spin.rotation.set(0, 0, 0);
  o.spin.position.y = 0.8;
  if (p.celebrate > 0) {
    o.spin.rotation.y = (1 - p.celebrate / 2) * TAU * 2;
    o.spin.position.y = 0.8 + Math.abs(Math.sin(p.celebrate * 5)) * 0.6;
    o.hands.forEach((hd, i) => hd.position.set((i ? 1 : -1) * 0.6, 0.55, 0.1));
  } else if (p.grounded) {
    const crouch = input.crouch && sp < 1;
    p.runPhase += dt * sp * 1.6;
    const k = Math.min(1, sp / RUN);
    o.feet.forEach((f, i) => {
      const ph = p.runPhase + (i ? Math.PI : 0);
      f.position.z = 0.05 + Math.sin(ph) * 0.32 * k;
      f.position.y = -0.66 + Math.max(0, Math.cos(ph)) * 0.18 * k;
    });
    o.hands.forEach((hd, i) => {
      const ph = p.runPhase + (i ? 0 : Math.PI);
      hd.position.set((i ? 1 : -1) * 0.66, -0.1 + Math.abs(Math.sin(ph)) * 0.1 * k, 0.05 + Math.sin(ph) * 0.3 * k);
    });
    o.spin.position.y = 0.8 + Math.abs(Math.sin(p.runPhase)) * 0.08 * k - (crouch ? 0.25 : 0);
    o.spin.rotation.x = k * 0.18;
    if (crouch) o.model.scale.y *= 0.8;
    if (sp > 6 && Math.random() < dt * 10) burst(new THREE.Vector3(p.pos.x, p.pos.y + 0.1, p.pos.z), 0xf5f0e0, 1, 1.2, 2, 0.35, 0.7, 0.4);
  } else {
    o.feet.forEach((f, i) => { f.position.z = 0.05 + (i ? 0.2 : -0.15); f.position.y = -0.55; });
    o.hands.forEach((hd, i) => hd.position.set((i ? 1 : -1) * 0.7, 0.25, 0.05));
    if (p.state === 'triple') {
      p.flip += dt * 11;
      o.spin.rotation.x = Math.min(p.flip, TAU * 1.0);
      if (p.flip > TAU) o.spin.rotation.x = 0;
    } else if (p.state === 'long') {
      o.spin.rotation.x = 1.1;
      o.hands.forEach((hd, i) => hd.position.set((i ? 1 : -1) * 0.45, 0.2, 0.55));
    } else if (p.state === 'pound') {
      p.flip += dt * 26;
      o.spin.rotation.x = p.poundTimer > 0 ? Math.min(p.flip, TAU) : 0;
      if (p.poundTimer <= 0) o.model.scale.set(0.85, 1.2, 0.85);
    } else if (p.state === 'hurt') {
      o.spin.rotation.x = -0.5;
    } else {
      o.spin.rotation.x = clamp(-p.vel.y * 0.015, -0.3, 0.3);
    }
  }
  o.tailPivot.rotation.x = Math.sin(t * 14) * 0.25 - Math.min(0.9, sp * 0.06) - (p.grounded ? 0 : 0.4);
  o.tailPivot.rotation.y = Math.sin(t * 9) * 0.2;
  o.orb.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.3;
  o.root.visible = !(p.invuln > 0 && Math.floor(t * 18) % 2 === 0) && !p.dead;

  // Sombra circular
  const gnd = groundAt(p.pos.x, p.pos.z, p.pos.y + 0.1);
  if (gnd.s) {
    const hgt = p.pos.y - gnd.y;
    blob.visible = true;
    blob.position.set(p.pos.x, gnd.y + 0.04, p.pos.z);
    const sc = clamp(1 - hgt * 0.04, 0.4, 1);
    blob.scale.setScalar(sc);
    blob.material.opacity = 0.35 * sc;
  } else blob.visible = false;
}

/* ======================================================================
   Mundo dinámico
   ====================================================================== */
function updateMovers(t) {
  for (const s of movers) {
    const mv = s.move;
    const c = s.base.clone();
    c[mv.axis] += Math.sin(t * mv.speed + (mv.phase || 0)) * mv.amp;
    s.delta.subVectors(c, s.mesh.position);
    s.mesh.position.copy(c);
    s.min.add(s.delta);
    s.max.add(s.delta);
  }
  if (player.grounded && player.ground && player.ground.move) player.pos.add(player.ground.delta);
}

function pressButton() {
  if (button.pressed) return;
  button.pressed = true;
  button.timer = 16;
  button.lastTick = 16;
  audio.play('switch');
  banner('¡Nubes sólidas!', 'Tienes 16 segundos', 1.8);
  cloudSteps.forEach((s, i) => { s.active = true; s.mesh.visible = true; s.mesh.scale.setScalar(0.01); s.appearDelay = i * 0.12; });
}
function updateButton(dt) {
  button.mesh.scale.y = lerp(button.mesh.scale.y, button.pressed ? 0.3 : 1, 1 - Math.exp(-dt * 20));
  button.mesh.position.y = 0.3 * button.mesh.scale.y;
  cloudSteps.forEach((s) => {
    if (!s.mesh.visible) return;
    s.appearDelay = (s.appearDelay || 0) - dt;
    if (s.appearDelay <= 0) s.mesh.scale.setScalar(lerp(s.mesh.scale.x, 1, 1 - Math.exp(-dt * 10)));
    s.mesh.position.y = s.max.y - 0.4 + Math.sin(game.time * 2 + s.min.x) * 0.05;
  });
  const timerEl = $('timer');
  if (!button.pressed) { timerEl.hidden = true; return; }
  button.timer -= dt;
  timerEl.hidden = false;
  timerEl.textContent = Math.ceil(Math.max(0, button.timer));
  if (button.timer < button.lastTick - 1) {
    button.lastTick = Math.ceil(button.timer);
    audio.play('tick');
  }
  const blink = button.timer < 4 && Math.floor(button.timer * 6) % 2 === 0;
  cloudSteps.forEach((s) => { s.mesh.material.opacity = blink ? 0.35 : 0.95; });
  if (button.timer <= 0) {
    button.pressed = false;
    cloudSteps.forEach((s) => { s.active = false; s.mesh.visible = false; });
    if (player.ground && cloudSteps.includes(player.ground)) { player.grounded = false; player.ground = null; }
    audio.tone(500, 0.3, 'triangle', 0.1, 200);
  }
}

function collectAll(dt) {
  const p = player;
  const cx = p.pos.x, cy = p.pos.y + 0.75, cz = p.pos.z;
  const near = (v, r) => (v.x - cx) ** 2 + (v.y - cy) ** 2 + (v.z - cz) ** 2 < r * r;
  for (const c of coins) {
    if (!c.alive) continue;
    c.age += dt;
    if (c.falling) {
      c.vy -= 25 * dt;
      c.m.position.x += c.vx * dt;
      c.m.position.z += c.vz * dt;
      c.m.position.y += c.vy * dt;
      const g = groundAt(c.m.position.x, c.m.position.z, c.m.position.y + 1);
      if (c.vy < 0 && c.m.position.y < g.y + 0.6) {
        c.m.position.y = g.y + 0.6;
        c.vy = Math.abs(c.vy) > 3 ? -c.vy * 0.4 : 0;
        if (!c.vy) c.falling = false;
      }
      if (c.m.position.y < -30) { c.alive = false; scene.remove(c.m); continue; }
    }
    c.m.rotation.y += dt * 3.5;
    if (!p.dead && c.age > 0.3 && near(c.m.position, 1.15)) {
      c.alive = false;
      scene.remove(c.m);
      game.coins += 1;
      audio.play('coin');
      burst(c.m.position, 0xffd23f, 6, 3, 6, 0.4, 0.7);
      if (game.coins % 10 === 0 && game.hearts < 3) game.hearts += 1;
      if (game.coins === 50) revealCrystal('monedas');
      updateHUD();
    }
  }
  for (const f of frags) {
    if (!f.alive) continue;
    f.m.rotation.y += dt * 2;
    f.m.position.y = f.by + Math.sin(game.time * 3 + f.by) * 0.15;
    if (!p.dead && near(f.m.position, 1.2)) {
      f.alive = false;
      scene.remove(f.m);
      game.frags += 1;
      audio.play('frag');
      burst(f.m.position, 0x4fc3ff, 12, 4, 4, 0.6);
      banner(`Fragmento ${game.frags} de 8`, game.frags === 8 ? '¡Un Cristal ha aparecido en el pedestal!' : '', 1.6);
      if (game.frags === 8) revealCrystal('fragmentos');
      updateHUD();
    }
  }
  for (const l of lifeOrbs) {
    if (!l.alive) continue;
    l.m.position.y = l.by + Math.sin(game.time * 2.5) * 0.2;
    if (!p.dead && near(l.m.position, 1.2)) {
      l.alive = false;
      scene.remove(l.m);
      game.lives += 1;
      audio.play('life');
      banner('¡Vida extra!', '', 1.4);
      burst(l.m.position, 0x5cff8d, 14, 4, 4, 0.6);
      updateHUD();
    }
  }
  for (const c of CRYSTALS) {
    if (!c.g.visible) continue;
    c.appear = Math.min(1, c.appear + dt * 1.5);
    c.g.scale.setScalar(c.appear);
    c.gem.rotation.y += dt * 1.8;
    c.g.position.y = c.pos[1] + Math.sin(game.time * 2) * 0.25;
    c.halo.scale.setScalar(1 + Math.sin(game.time * 4) * 0.08);
    if (!c.active || p.dead || p.frozen > 0) continue;
    if (Math.hypot(c.g.position.x - cx, c.g.position.y - cy, c.g.position.z - cz) < 1.7) collectCrystal(c);
  }
}
function revealCrystal(id) {
  const c = CRYSTALS.find((x) => x.id === id);
  if (!c || c.g.visible) return;
  c.g.visible = true;
  c.active = true;
  c.appear = 0;
  audio.play('appear');
  burst(new THREE.Vector3(...c.pos), c.color, 24, 6, 3, 1);
  if (id === 'monedas') banner('¡50 monedas!', 'Un Cristal ha aparecido en el prado', 2.2);
}
function collectCrystal(c) {
  c.active = false;
  const isNew = !game.crystals.has(c.id);
  game.crystals.add(c.id);
  writeSave();
  burst(c.g.position, c.color, 40, 8, 4, 1.2, 1.2);
  c.g.visible = false;
  audio.play('crystal');
  player.frozen = 2.0;
  player.celebrate = 2.0;
  player.vel.set(0, 0, 0);
  game.hearts = 3;
  updateHUD();
  banner(isNew ? '¡Cristal conseguido!' : '¡Cristal recuperado otra vez!', `${c.name} · ${game.crystals.size} de 6`, 3);
  if (game.crystals.size === 6 && !game.won) {
    game.won = true;
    setTimeout(() => {
      const min = Math.floor(game.playTime / 60), sec = Math.floor(game.playTime % 60);
      banner('¡El Faro brilla de nuevo!', `Has reunido los 6 Cristales en ${min}:${String(sec).padStart(2, '0')} · ${game.coins} monedas<br>¡Gracias por jugar!`, 7);
      audio.play('life');
    }, 3200);
  }
}

function updateEnemies(dt) {
  const p = player;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.kind === 'roller') {
      e.t += dt * e.speed;
      const [x, y, z] = e.path(e.t);
      const pv = e.g.position.clone();
      e.g.position.set(x, y, z);
      const mv = e.g.position.clone().sub(pv);
      if (mv.lengthSq() > 0) {
        const axis = new THREE.Vector3(mv.z, 0, -mv.x).normalize();
        e.g.rotateOnWorldAxis(axis, mv.length() / 0.75);
      }
      const d = Math.hypot(x - p.pos.x, y - (p.pos.y + 0.75), z - p.pos.z);
      if (d < 1.45) hurt(x, z);
      continue;
    }
    // Bloblo
    if (e.dying > 0) {
      e.dying -= dt;
      e.g.scale.set(1 + (0.4 - e.dying) * 2, Math.max(0.05, e.dying / 0.4 * 0.3), 1 + (0.4 - e.dying) * 2);
      if (e.dying <= 0) { e.alive = false; scene.remove(e.g); }
      continue;
    }
    e.t += dt;
    const toP = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
    const homeD = Math.hypot(e.home.x - e.x, e.home.z - e.z);
    let target = null;
    if (toP < 9 && Math.abs(p.pos.y - e.y) < 4 && !p.dead) { target = Math.atan2(p.pos.x - e.x, p.pos.z - e.z); e.speed = 3.6; }
    else if (homeD > 5) { target = Math.atan2(e.home.x - e.x, e.home.z - e.z); e.speed = 2; }
    else { if (Math.random() < dt * 0.6) e.dir = rand(0, TAU); e.speed = 1.5; }
    if (target !== null) e.dir += angDiff(e.dir, target) * Math.min(1, dt * 5);
    const nx = e.x + Math.sin(e.dir) * e.speed * dt, nz = e.z + Math.cos(e.dir) * e.speed * dt;
    const g = groundAt(nx, nz, e.y + 0.5);
    if (g.s && Math.abs(g.y - e.y) < 0.5 && Math.hypot(nx - e.home.x, nz - e.home.z) < 11) {
      // evita meterse dentro de obstáculos
      let blocked = false;
      for (const s of solids) {
        if (!s.active || s.type === 'ramp') continue;
        if (topAt(s, nx, nz) > e.y + 0.5 && bottomOf(s, nx, nz) < e.y + 1 && pushOut(s, nx, nz, 0.7)) { blocked = true; break; }
      }
      if (!blocked) { e.x = nx; e.z = nz; e.y = g.y; } else e.dir += 1.5;
    } else e.dir += Math.PI * 0.7;
    const hop = Math.abs(Math.sin(e.t * 7)) * 0.25;
    e.g.position.set(e.x, e.y + hop, e.z);
    e.g.rotation.y = e.dir;
    e.body.scale.set(1 + hop * 0.3, 0.78 - hop * 0.3, 1 + hop * 0.3);

    // Interacción con Orbi
    const ddx = p.pos.x - e.x, ddz = p.pos.z - e.z, dh = Math.hypot(ddx, ddz);
    if (dh < 1.35 && p.pos.y < e.y + 1.6 && p.pos.y + H > e.y && !p.dead) {
      if (p.state === 'pound' || (p.vel.y < 0 && p.pos.y > e.y + 0.6)) {
        e.dying = 0.4;
        audio.play('stomp');
        burst(new THREE.Vector3(e.x, e.y + 0.6, e.z), 0xb48cff, 14, 5);
        addCoin(e.x, e.y + 1, e.z, true);
        addCoin(e.x, e.y + 1, e.z, true);
        if (p.state !== 'pound') {
          p.vel.y = input.jump ? 16 : 11;
          p.state = 'air';
          p.combo = 0;
          p.cutable = false;
          p.squash = 1.3;
        }
      } else hurt(e.x, e.z);
    }
  }
}

function updateBoss(dt) {
  const b = boss, p = player;
  if (b.state === 'gone') return;
  b.t += dt;
  b.flash = Math.max(0, b.flash - dt);
  const toP = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
  const onArena = Math.hypot(p.pos.x - ARENA.x, p.pos.z - ARENA.z) < ARENA.r + 1 && p.pos.y > ARENA.top - 1;
  const clampArena = (x, z) => {
    const dx = x - ARENA.x, dz = z - ARENA.z, d = Math.hypot(dx, dz), m = ARENA.r - 3.2;
    return d > m ? [ARENA.x + (dx / d) * m, ARENA.z + (dz / d) * m] : [x, z];
  };
  const faceP = (k) => { b.facing += angDiff(b.facing, Math.atan2(p.pos.x - b.x, p.pos.z - b.z)) * Math.min(1, dt * k); };
  const speedUp = 1 + (3 - b.hp) * 0.25;
  switch (b.state) {
    case 'sleep':
      b.body.position.y = 2.1 + Math.sin(b.t * 1.5) * 0.05;
      if (onArena && Math.hypot(p.pos.x - ARENA.x, p.pos.z - ARENA.z) < 13) {
        b.state = 'roar'; b.t = 0;
        audio.play('boss');
        banner('¡El Rey Pedrusco!', 'Cuando aterrice y se maree, ¡salta sobre su cabeza!', 3);
        game.shake = 0.5;
      }
      break;
    case 'roar':
      faceP(4);
      b.body.position.y = 2.1 + Math.sin(b.t * 30) * 0.1;
      if (b.t > 1.6) { b.state = 'chase'; b.t = 0; }
      break;
    case 'chase': {
      faceP(3);
      const s = 3.2 * speedUp * dt;
      [b.x, b.z] = clampArena(b.x + Math.sin(b.facing) * s, b.z + Math.cos(b.facing) * s);
      b.body.position.y = 2.1 + Math.abs(Math.sin(b.t * 6)) * 0.2;
      if (b.t > 2.6 / speedUp || (!onArena && b.t > 1)) {
        if (!onArena) { b.state = 'sleep'; b.t = 0; break; }
        b.state = 'leap'; b.t = 0;
        b.from.set(b.x, b.z);
        const [tx, tz] = clampArena(p.pos.x, p.pos.z);
        b.to.set(tx, tz);
        audio.tone(150, 0.4, 'sawtooth', 0.12, 400);
      }
      break;
    }
    case 'leap': {
      const T = 1.15;
      const k = Math.min(1, b.t / T);
      b.x = lerp(b.from.x, b.to.x, k);
      b.z = lerp(b.from.y, b.to.y, k);
      b.y = ARENA.top + 4 * 8 * k * (1 - k);
      faceP(2);
      if (k >= 1) {
        b.y = ARENA.top;
        b.state = 'dizzy'; b.t = 0;
        game.shake = 0.6;
        audio.play('pound');
        burst(new THREE.Vector3(b.x, ARENA.top + 0.2, b.z), 0xc9c2b0, 30, 9, 8, 0.7, 1.4, 0.2);
        if (p.grounded && toP < 6.5) hurt(b.x, b.z);
      }
      break;
    }
    case 'dizzy':
      b.stars.visible = true;
      b.stars.rotation.y += dt * 5;
      b.body.position.y = 2.0;
      b.g.rotation.z = Math.sin(b.t * 6) * 0.08;
      if (b.t > 2.8) { b.state = 'chase'; b.t = 0; b.stars.visible = false; b.g.rotation.z = 0; }
      break;
    case 'hit':
      b.g.rotation.z = Math.sin(b.t * 30) * 0.15;
      b.scale = 1 - Math.sin(Math.min(1, b.t / 0.4) * Math.PI) * 0.25;
      if (b.t > 1.0) {
        b.g.rotation.z = 0; b.scale = 1;
        if (b.hp <= 0) { b.state = 'dying'; b.t = 0; audio.play('boss'); }
        else { b.state = 'chase'; b.t = 0; }
      }
      break;
    case 'dying':
      b.scale = Math.max(0.01, 1 - b.t / 1.4);
      b.g.rotation.y += dt * 10;
      if (Math.random() < dt * 20) burst(new THREE.Vector3(b.x + rand(-2, 2), b.y + rand(1, 4), b.z + rand(-2, 2)), 0xc9c2b0, 4, 5);
      if (b.t > 1.4) {
        b.state = 'gone';
        b.g.visible = false;
        revealCrystal('rey');
        banner('¡Rey Pedrusco derrotado!', 'Recoge el Cristal', 2.2);
      }
      break;
  }
  b.g.position.set(b.x, b.y, b.z);
  if (b.state !== 'dying') b.g.rotation.y = b.facing;
  b.g.scale.setScalar(b.scale);
  b.body.material = b.flash > 0 && Math.floor(b.flash * 20) % 2 ? mat(0xffffff) : mat(0x8f8a93);

  // Interacción
  if (['sleep', 'dying', 'gone'].includes(b.state) || p.dead) return;
  const dh = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
  const headY = b.y + 4.0;
  if (dh < 2.7 && p.vel.y <= 0 && p.pos.y > headY - 1.2 && p.pos.y < headY + 0.8) {
    // Sobre la cabeza
    if (b.state === 'dizzy') {
      b.hp -= 1;
      b.state = 'hit'; b.t = 0; b.flash = 1; b.stars.visible = false;
      audio.play('bosshit');
      game.shake = 0.4;
      burst(new THREE.Vector3(b.x, headY, b.z), 0xfff27a, 20, 6);
      banner(b.hp > 0 ? `¡Golpe! ${3 - b.hp} / 3` : '¡Golpe final!', '', 1.2);
    } else audio.play('stomp');
    p.pos.y = headY;
    p.vel.y = 17;
    const d = dh || 1;
    p.vel.x = ((p.pos.x - b.x) / d) * 7;
    p.vel.z = ((p.pos.z - b.z) / d) * 7;
    p.state = 'air'; p.grounded = false; p.combo = 0; p.cutable = false; p.squash = 1.3;
  } else if (dh < 2.9 && p.pos.y < headY - 1.2 && p.pos.y + H > b.y) {
    if (b.state === 'dizzy' || b.state === 'hit') {
      const d = dh || 1;
      p.pos.x = b.x + ((p.pos.x - b.x) / d) * 2.9;
      p.pos.z = b.z + ((p.pos.z - b.z) / d) * 2.9;
    } else hurt(b.x, b.z);
  }
}

/* ======================================================================
   Cámara
   ====================================================================== */
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const p = player;
  cam.yaw -= input.camX * dt * 2.6;
  cam.pitch = clamp(cam.pitch + input.camY * dt * 1.5, 0.02, 1.25);
  if (input.camX || input.camY) camManualIdle = 0;
  camManualIdle += dt;
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (camManualIdle > 1.2 && sp > 2 && !p.dead && p.frozen <= 0) {
    const behind = Math.atan2(p.vel.x, p.vel.z) + Math.PI;
    const d = angDiff(cam.yaw, behind);
    if (Math.abs(d) < 2.3) cam.yaw += d * dt * 0.9 * Math.min(1, sp / RUN);
  }
  const desired = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z);
  const kXZ = 1 - Math.exp(-dt * 9), kY = 1 - Math.exp(-dt * (p.grounded ? 6 : 2.5));
  cam.target.x = lerp(cam.target.x, desired.x, kXZ);
  cam.target.z = lerp(cam.target.z, desired.z, kXZ);
  cam.target.y = lerp(cam.target.y, desired.y, kY);
  if (desired.y - cam.target.y > 4) cam.target.y = desired.y - 4;
  if (cam.target.y - desired.y > 3) cam.target.y = desired.y + 3;

  const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  let dist = cam.dist;
  for (let d = 1.5; d <= cam.dist; d += 0.5) {
    const x = cam.target.x + dir.x * d, y = cam.target.y + dir.y * d, z = cam.target.z + dir.z * d;
    if (pointInSolid(x, y, z)) { dist = Math.max(1.5, d - 0.6); break; }
  }
  cam.curDist = lerp(cam.curDist || dist, dist, dist < (cam.curDist || dist) ? 0.6 : 1 - Math.exp(-dt * 3));
  camPos.copy(cam.target).addScaledVector(dir, cam.curDist);
  if (game.shake > 0) {
    camPos.x += rand(-1, 1) * game.shake;
    camPos.y += rand(-1, 1) * game.shake;
    game.shake = Math.max(0, game.shake - dt);
  }
  camera.position.copy(camPos);
  camera.lookAt(cam.target);
  sky.position.copy(camera.position);
  dirLight.position.set(p.pos.x + 30, p.pos.y + 60, p.pos.z + 22);
  dirLight.target.position.copy(p.pos);
}

/* ======================================================================
   Bucle principal
   ====================================================================== */
let last = performance.now();
let titleT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  readInput();
  game.time += dt;
  audio.update();

  if (game.state === 'title') {
    if (input.jumpPressed || input.pausePressed) startGame();
    titleT += dt;
    camera.position.set(Math.sin(titleT * 0.1) * 48, 22, Math.cos(titleT * 0.1) * 48 - 6);
    camera.lookAt(0, 12, -6);
    sky.position.copy(camera.position);
    dirLight.position.set(30, 60, 22);
    dirLight.target.position.set(0, 0, 0);
    animatePlayer(dt);
  } else if (game.state === 'pause') {
    if (input.pausePressed) setPaused(false);
  } else {
    if (input.pausePressed) setPaused(true);
    game.playTime += dt;
    updateMovers(game.time);
    updatePlayer(dt);
    updateButton(dt);
    updateEnemies(dt);
    updateBoss(dt);
    collectAll(dt);
    animatePlayer(dt);
    updateCamera(dt);
    updateHints();
  }
  // Decorado animado
  for (const c of decoClouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > 280) c.g.position.x = -280;
  }
  for (const s of springs) {
    s.squash = Math.max(0, s.squash - dt * 4);
    s.top.position.y = s.y + 0.42 - Math.sin(s.squash * Math.PI) * 0.25;
  }
  const lit = game.crystals.size / 6;
  lampMat.emissiveIntensity = 0.1 + lit * 1.6;
  beam.material.opacity = game.crystals.size >= 6 ? 0.16 : lit * 0.05;
  beamPivot.rotation.y += dt * 0.6;
  updateParticles(dt);
  if (game.bannerTimer > 0) {
    game.bannerTimer -= dt;
    if (game.bannerTimer <= 0) $('banner').hidden = true;
  }
  renderer.render(scene, camera);
}

let hintShown = null;
function updateHints() {
  let best = null;
  for (const s of signs) {
    if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 3 && Math.abs(s.y - player.pos.y) < 2) best = s;
  }
  if (best !== hintShown) {
    hintShown = best;
    $('hint').hidden = !best;
    if (best) $('hint').innerHTML = best.text;
  }
}

updateHUD();
requestAnimationFrame(frame);

// Gancho para pruebas automáticas
window.__orbi = { player, game, cam, boss, CRYSTALS, input, startGame, pressButton, enemies };
