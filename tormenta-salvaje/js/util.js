/* TORMENTA SALVAJE — utilidades: azar con semilla, ruido, texturas pintadas en canvas y fusión de geometrías */
(function () {
  'use strict';

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const R = mulberry(20261111);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (o || 5); i++) { s += vnoise(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; }

  /* ---------------- texturas en canvas ---------------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, repeat, srgb) {
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // Corteza: vetas verticales, grietas y musgo
  function barkTexture(base, dark, moss, seed) {
    const r = mulberry(seed || 1), W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, w = 1 + r() * 4, y = r() * H, h = 20 + r() * 120;
      g.fillStyle = r() < 0.6 ? dark : 'rgba(255,255,255,0.05)';
      g.globalAlpha = 0.25 + r() * 0.5;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + r() * 6 - 3, y + h * 0.3, x + r() * 6 - 3, y + h * 0.6, x + r() * 4 - 2, y + h);
      g.lineWidth = w; g.strokeStyle = g.fillStyle; g.stroke();
    }
    if (moss) {
      for (let i = 0; i < 90; i++) { g.globalAlpha = 0.18 + r() * 0.3; g.fillStyle = moss; g.beginPath(); g.ellipse(r() * W, H * (0.55 + r() * 0.45), 4 + r() * 14, 3 + r() * 10, 0, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
    // continuidad horizontal
    const d = g.getImageData(0, 0, 6, H); g.putImageData(d, W - 6, 0);
    return tex(c, true);
  }

  // Abedul: blanco con marcas horizontales oscuras
  function birchTexture() {
    const r = mulberry(7), W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#bdbab0'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() < 0.8 ? '#2a2724' : '#6b665d'; g.globalAlpha = 0.5 + r() * 0.5;
      const y = r() * H, w = 8 + r() * 40, x = r() * W; g.fillRect(x, y, w, 1 + r() * 4);
    }
    g.globalAlpha = 0.15; for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? '#fff' : '#555'; g.fillRect(r() * W, r() * H, 2, 1); }
    g.globalAlpha = 1;
    return tex(c, true);
  }

  // Tarjeta de rama de conífera: eje y agujas (alfa)
  function needleCard(seed, hue) {
    const r = mulberry(seed), W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const branches = 5;
    for (let b = 0; b < branches; b++) {
      const x0 = W / 2 + (r() - 0.5) * 30, y0 = H * 0.05, x1 = W / 2 + (r() - 0.5) * W * 0.8, y1 = H * (0.75 + r() * 0.22);
      g.strokeStyle = '#2e2418'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 40, (y0 + y1) / 2, x1, y1); g.stroke();
      for (let k = 0; k < 140; k++) {
        const t = r(), x = x0 + (x1 - x0) * t + (r() - 0.5) * 4, y = y0 + (y1 - y0) * t;
        const len = 9 + r() * 14 * (1 - t * 0.5), a = (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.7) + Math.PI / 2;
        const l = 22 + r() * 18;
        g.strokeStyle = `hsl(${hue + r() * 18},${30 + r() * 25}%,${l}%)`; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.7); g.stroke();
      }
    }
    const t = tex(c, false); t.premultiplyAlpha = false; return t;
  }

  // Racimo de hojas anchas (roble / haya / abedul)
  function leafCard(seed, hue, sat, small) {
    const r = mulberry(seed), W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.strokeStyle = '#2b2116'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 + (r() - 0.5) * 80, H * 0.6, r() * W, r() * H * 0.6); g.stroke(); }
    const n = small ? 260 : 170;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, rad = Math.sqrt(r()) * W * 0.46;
      const x = W / 2 + Math.cos(a) * rad, y = H * 0.48 + Math.sin(a) * rad * 0.9;
      const s = (small ? 5 : 8) + r() * (small ? 5 : 9), l = 14 + r() * 22;
      g.fillStyle = `hsl(${hue + r() * 25 - 10},${sat + r() * 15}%,${l}%)`;
      g.save(); g.translate(x, y); g.rotate(r() * 6.283);
      g.beginPath(); g.ellipse(0, 0, s, s * 0.5, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
      g.restore();
    }
    return tex(c, false);
  }

  // Helecho: frondas arqueadas
  function fernCard() {
    const r = mulberry(33), W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    for (let f = 0; f < 7; f++) {
      const ang = -Math.PI / 2 + (f - 3) * 0.32 + (r() - 0.5) * 0.1, len = H * (0.6 + r() * 0.35);
      let x = W / 2, y = H, px = x, py = y;
      for (let s = 0; s < 34; s++) {
        const t = s / 34, a = ang + t * t * (f - 3) * 0.35;
        x = W / 2 + Math.cos(a) * len * t * 0.95 + (f - 3) * t * t * 18; y = H - Math.sin(-a) * len * t;
        g.strokeStyle = '#26381a'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
        const lw = 16 * (1 - t) + 3;
        g.fillStyle = `hsl(${88 + r() * 20},${32 + r() * 15}%,${15 + r() * 14}%)`;
        for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * lw * 0.55 * Math.cos(a + 1.57), y + sd * lw * 0.55 * Math.sin(a + 1.57), lw * 0.6, 2.4, a + 1.57 * sd * 0.6, 0, 7); g.fill(); }
        px = x; py = y;
      }
    }
    return tex(c, false);
  }

  // Matas de pasto alto mojado
  function grassCard() {
    const r = mulberry(51), W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
    for (let i = 0; i < 70; i++) {
      const x = W * (0.1 + r() * 0.8), h = H * (0.4 + r() * 0.6), bend = (r() - 0.5) * 40;
      g.strokeStyle = `hsl(${70 + r() * 30},${20 + r() * 25}%,${14 + r() * 18}%)`; g.lineWidth = 1 + r() * 1.6;
      g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + bend * 0.3, H - h * 0.6, x + bend, H - h); g.stroke();
    }
    return tex(c, false);
  }

  // Suelo: barro, hojarasca, musgo — textura de detalle repetida (+ mapa de rugosidad)
  function groundTextures() {
    const r = mulberry(91), N = 512, c = canvas(N, N), g = c.getContext('2d');
    const rc = canvas(N, N), rg = rc.getContext('2d');
    g.fillStyle = '#2b241c'; g.fillRect(0, 0, N, N);
    rg.fillStyle = '#9a9a9a'; rg.fillRect(0, 0, N, N);
    const id = g.getImageData(0, 0, N, N), d = id.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = fbm(x / 40, y / 40, 4), m = fbm(x / 9 + 50, y / 9, 3);
      const i = (y * N + x) * 4, v = 0.7 + n * 0.6 + (m - 0.5) * 0.3;
      d[i] = 43 * v; d[i + 1] = 36 * v; d[i + 2] = 28 * v;
    }
    g.putImageData(id, 0, 0);
    // hojas mojadas caídas
    const leafCols = ['#5a3a1c', '#6e4a22', '#3f2c18', '#7a5a2a', '#4a3b1e', '#2f3a1c'];
    for (let i = 0; i < 1500; i++) {
      const x = r() * N, y = r() * N, s = 3 + r() * 7;
      g.save(); g.translate(x, y); g.rotate(r() * 6.28);
      g.fillStyle = leafCols[(r() * leafCols.length) | 0]; g.globalAlpha = 0.55 + r() * 0.4;
      g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, 7); g.fill();
      rg.save(); rg.translate(x, y); rg.rotate(0); rg.fillStyle = 'rgba(40,40,40,0.5)'; rg.beginPath(); rg.ellipse(0, 0, s, s * 0.45, 0, 0, 7); rg.fill(); rg.restore();
      g.restore();
    }
    // ramitas
    g.globalAlpha = 0.8;
    for (let i = 0; i < 140; i++) {
      const x = r() * N, y = r() * N, a = r() * 6.28, l = 8 + r() * 30;
      g.strokeStyle = '#1c150e'; g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // piedritas
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${90 + r() * 40},${85 + r() * 30},${80 + r() * 30},${0.3 + r() * 0.4})`; g.beginPath(); g.arc(r() * N, r() * N, 0.8 + r() * 2, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // charquitos brillantes en la rugosidad
    for (let i = 0; i < 40; i++) { rg.fillStyle = 'rgba(10,10,10,0.7)'; rg.beginPath(); rg.ellipse(r() * N, r() * N, 6 + r() * 20, 4 + r() * 12, r() * 3, 0, 7); rg.fill(); }
    // relieve (normal) a partir del brillo
    const nc = canvas(N, N), ng = nc.getContext('2d'), src = g.getImageData(0, 0, N, N).data, nd = ng.createImageData(N, N);
    const L = (x, y) => { x = (x + N) % N; y = (y + N) % N; const i = (y * N + x) * 4; return (src[i] + src[i + 1] + src[i + 2]) / 765; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * 4, dy = (L(x, y + 1) - L(x, y - 1)) * 4;
      const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    }
    ng.putImageData(nd, 0, 0);
    const map = tex(c, true), rough = tex(rc, true, false), normal = tex(nc, true, false);
    return { map, rough, normal };
  }

  function rockTexture() {
    const W = 256, c = canvas(W, W), g = c.getContext('2d'), id = g.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x / 24, y / 24, 5), m = fbm(x / 6, y / 6, 2), i = (y * W + x) * 4, v = 60 + n * 70 + m * 20;
      id.data[i] = v * 0.95; id.data[i + 1] = v; id.data[i + 2] = v * 0.98; id.data[i + 3] = 255;
      if (fbm(x / 30 + 9, y / 30) > 0.62) { id.data[i] *= 0.55; id.data[i + 1] *= 0.8; id.data[i + 2] *= 0.45; } // líquenes / musgo
    }
    g.putImageData(id, 0, 0);
    return tex(c, true);
  }

  function fabricTexture(color, stripe) {
    const W = 128, c = canvas(W, W), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, W, W);
    g.globalAlpha = 0.08; for (let y = 0; y < W; y += 2) { g.fillStyle = y % 4 ? '#000' : '#fff'; g.fillRect(0, y, W, 1); }
    g.globalAlpha = 0.35; if (stripe) { g.fillStyle = stripe; g.fillRect(0, W * 0.8, W, W * 0.08); }
    g.globalAlpha = 0.25; for (let i = 0; i < 30; i++) { g.fillStyle = '#1a140c'; g.beginPath(); g.ellipse(Math.random() * W, W * (0.6 + Math.random() * 0.4), 3 + Math.random() * 12, 2 + Math.random() * 6, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    return tex(c, true);
  }

  function woodTexture(base) {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(0,0,0,' + (0.1 + Math.random() * 0.3) + ')'; g.lineWidth = 1; const y = Math.random() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 3, W * 0.6, y - 3, W, y + 1); g.stroke(); }
    return tex(c, true);
  }

  /* ---------------- geometría ---------------- */
  // Fusiona geometrías indexadas (position, normal, uv) agrupando por índice de material
  function merge(parts) {
    // parts: [{geo, mat}] mat = índice de material
    const byMat = {};
    parts.forEach(p => { (byMat[p.mat] = byMat[p.mat] || []).push(p.geo); });
    const pos = [], nor = [], uv = [], idx = [], groups = [];
    let vOff = 0;
    Object.keys(byMat).sort().forEach(m => {
      const start = idx.length;
      byMat[m].forEach(gm => {
        const g = gm.index ? gm : gm.toNonIndexed();
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          pos.push(P.getX(i), P.getY(i), P.getZ(i));
          nor.push(N.getX(i), N.getY(i), N.getZ(i));
          uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + vOff);
        else for (let i = 0; i < P.count; i++) idx.push(i + vOff);
        vOff += P.count;
      });
      groups.push({ start, count: idx.length - start, mat: +m });
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(vOff > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    groups.forEach(g => out.addGroup(g.start, g.count, g.mat));
    out.computeBoundingSphere();
    return out;
  }

  // Tubo cónico que sigue una lista de puntos (tronco o rama curvada)
  function limb(points, r0, r1, radial, uvScale) {
    const segs = points.length - 1, pos = [], nor = [], uv = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    let len = 0;
    for (let i = 0; i <= segs; i++) {
      const p = points[i], next = points[Math.min(segs, i + 1)], prev = points[Math.max(0, i - 1)];
      const dir = tmp.subVectors(next, prev).normalize();
      a.crossVectors(dir, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      b.crossVectors(dir, a).normalize();
      const t = i / segs, r = r0 + (r1 - r0) * t;
      if (i > 0) len += p.distanceTo(prev);
      for (let k = 0; k <= radial; k++) {
        const ang = k / radial * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const nx = a.x * c + b.x * s, ny = a.y * c + b.y * s, nz = a.z * c + b.z * s;
        pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); nor.push(nx, ny, nz);
        uv.push(k / radial, len * (uvScale || 0.5));
      }
    }
    for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
      const a0 = i * (radial + 1) + k, b0 = a0 + radial + 1;
      idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // Tarjeta (plano) orientada: centro, dirección "arriba" y normal aproximada
  function card(center, upDir, w, h, rotY, tilt) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upDir.clone().normalize());
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0);
    q.multiply(q2);
    if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt));
    m.compose(center, q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    // normales hacia arriba: el follaje se ilumina más suave y parejo
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { n.setXYZ(i, n.getX(i) * 0.4, 0.8, n.getZ(i) * 0.4); }
    return g;
  }

  // Inyección de viento en materiales instanciados (las copas se mecen más que la base)
  function addWind(mat, uniforms, amp, stiff) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uWind = uniforms.uWind;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hw = pow(max(position.y, 0.0) * ${stiff.toFixed(3)}, 1.6);
        float ph = ip.x * 0.07 + ip.z * 0.05;
        float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25 + sin(uTime * 0.45 + ph) * 0.9;
        float flutter = sin(uTime * 9.0 + position.x * 3.0 + position.z * 2.0) * 0.04 * step(0.5, position.y);
        transformed.x += (sway * hw * ${amp.toFixed(3)} + flutter) * uWind;
        transformed.z += (sin(uTime * 1.1 + ph * 1.3) * hw * ${(amp * 0.6).toFixed(3)} + flutter * 0.6) * uWind;`);
    };
    mat.customProgramCacheKey = () => 'wind' + amp + stiff;
  }

  window.TS = window.TS || {};
  Object.assign(window.TS, { mulberry, R, rnd, hash, vnoise, fbm, canvas, tex, barkTexture, birchTexture, needleCard, leafCard, fernCard, grassCard, groundTextures, rockTexture, fabricTexture, woodTexture, merge, limb, card, addWind });
})();
