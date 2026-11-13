/* TORMENTA SALVAJE — mapa del parque (papel mojado) y minimapa
 *
 * El mapa se pinta una sola vez en un canvas a partir del mundo real del juego:
 * relieve sombreado y curvas de nivel calculados con la misma función de altura,
 * cada árbol como una copa, el sendero, los charcos y los lugares conocidos.
 * Encima se dibuja, en vivo, el recorrido del jugador a lápiz y su posición.
 * Convención: el norte del mapa es −Z del mundo (igual que la brújula).
 */
(function () {
  'use strict';
  const T = window.TS;

  class ParkMap {
    constructor(world, size) {
      this.world = world; this.N = size || 1024;
      this.trail = [];               // recorrido del jugador (cada ~4 m)
      this.places = [];              // { x, z, label, icon, known }
      this.base = this._paint();
    }

    w2m(x, z) { const N = this.N; return [(x + T.HALF) / T.SIZE * N, (z + T.HALF) / T.SIZE * N]; }

    addPlace(p) { this.places.push(p); }

    _paint() {
      const N = this.N, c = T.canvas(N, N), g = c.getContext('2d');
      // papel: tono hueso con manchas de humedad
      g.fillStyle = '#d9cfb4'; g.fillRect(0, 0, N, N);
      // relieve sombreado (luz del noroeste) a baja resolución, escalado
      const R = 200, rc = T.canvas(R, R), rg = rc.getContext('2d'), id = rg.createImageData(R, R);
      const H = new Float32Array((R + 1) * (R + 1));
      for (let j = 0; j <= R; j++) for (let i = 0; i <= R; i++) H[j * (R + 1) + i] = T.height(-T.HALF + i / R * T.SIZE, -T.HALF + j / R * T.SIZE);
      for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        const h = H[j * (R + 1) + i], hx = H[j * (R + 1) + i + 1] - h, hz = H[(j + 1) * (R + 1) + i] - h;
        const shade = Math.max(-1, Math.min(1, (-hx - hz) * 0.55));
        const k = (j * R + i) * 4;
        id.data[k] = shade > 0 ? 255 : 40; id.data[k + 1] = shade > 0 ? 250 : 32; id.data[k + 2] = shade > 0 ? 230 : 20;
        id.data[k + 3] = Math.abs(shade) * 120;
      }
      rg.putImageData(id, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(rc, 0, 0, N, N);
      // curvas de nivel cada 2 m (cada 10 m más marcada)
      g.lineWidth = 1;
      for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        const a = H[j * (R + 1) + i], b = H[j * (R + 1) + i + 1], d = H[(j + 1) * (R + 1) + i];
        const la = Math.floor(a / 2), lb = Math.floor(b / 2), ld = Math.floor(d / 2);
        if (la !== lb || la !== ld) {
          const major = Math.floor(a / 10) !== Math.floor(b / 10) || Math.floor(a / 10) !== Math.floor(d / 10);
          g.fillStyle = major ? 'rgba(110,72,38,0.55)' : 'rgba(120,85,50,0.28)';
          g.fillRect(i / R * N, j / R * N, major ? 2.2 : 1.4, major ? 2.2 : 1.4);
        }
      }
      // bosque: una copa por árbol, el color según la especie
      const col = { conifer: 'rgba(48,70,46,0.62)', broad: 'rgba(70,86,48,0.55)', birch: 'rgba(98,108,72,0.5)', snag: 'rgba(80,66,52,0.5)' };
      for (const t of this.world.trees) {
        const [x, y] = this.w2m(t.x, t.z), r = (t.s.kind === 'conifer' ? 3.2 : 3.8) * t.scale * N / 1024;
        g.fillStyle = col[t.s.kind]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      // charcos
      g.fillStyle = 'rgba(70,96,120,0.45)';
      for (const p of this.world.puddles) { const [x, y] = this.w2m(p.x, p.z); g.beginPath(); g.ellipse(x, y, p.r * 2.3 * N / 1024, p.r * 1.7 * N / 1024, 0.5, 0, 7); g.fill(); }
      // sendero: banda clara con borde y trazo discontinuo
      const pts = T.PATH_PTS.map(([x, z]) => this.w2m(x, z));
      const stroke = (w, s, dash) => { g.setLineDash(dash || []); g.lineWidth = w; g.strokeStyle = s; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
      stroke(9 * N / 1024, 'rgba(92,60,30,0.45)'); stroke(6 * N / 1024, '#e6dcc0'); stroke(2.4 * N / 1024, '#7a3a16', [10, 7]);
      g.setLineDash([]);
      // límite del parque
      g.strokeStyle = 'rgba(90,40,20,0.5)'; g.lineWidth = 3; g.setLineDash([16, 8, 3, 8]);
      g.beginPath(); g.arc(N / 2, N / 2, N / 2 * 0.86, 0, 7); g.stroke(); g.setLineDash([]);
      // manchas de agua y pliegues del papel
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * N, y = Math.random() * N, r = 30 + Math.random() * 120;
        const grd = g.createRadialGradient(x, y, r * 0.6, x, y, r); grd.addColorStop(0, 'rgba(120,95,55,0.0)'); grd.addColorStop(0.9, 'rgba(120,95,55,0.16)'); grd.addColorStop(1, 'rgba(120,95,55,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(80,60,30,0.18)'; g.lineWidth = 2;
      [[N / 3, 0, N / 3, N], [2 * N / 3, 0, 2 * N / 3, N], [0, N / 2, N, N / 2]].forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); });
      // título, escala y rosa de los vientos
      g.fillStyle = '#3a2412'; g.textAlign = 'left';
      g.font = `bold ${Math.round(N * 0.034)}px Cinzel, Georgia, serif`; g.fillText('PARQUE LOS ALERCES', N * 0.05, N * 0.07);
      g.font = `italic ${Math.round(N * 0.019)}px Georgia, serif`; g.fillText('Sendero del Bosque Viejo · Guardaparques', N * 0.05, N * 0.1);
      const sx = N * 0.06, sy = N * 0.95, len = 100 / T.SIZE * N;
      g.fillStyle = '#3a2412'; g.fillRect(sx, sy, len, 4); g.fillRect(sx, sy - 6, 2, 10); g.fillRect(sx + len - 2, sy - 6, 2, 10);
      g.font = `${Math.round(N * 0.017)}px Georgia, serif`; g.fillText('100 m', sx + len + 8, sy + 5);
      const cx = N * 0.9, cy = N * 0.1, rr = N * 0.045;
      g.strokeStyle = '#3a2412'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
      g.fillStyle = '#8a1c14'; g.beginPath(); g.moveTo(cx, cy - rr * 1.25); g.lineTo(cx - rr * 0.28, cy); g.lineTo(cx + rr * 0.28, cy); g.fill();
      g.fillStyle = '#3a2412'; g.beginPath(); g.moveTo(cx, cy + rr * 1.1); g.lineTo(cx - rr * 0.28, cy); g.lineTo(cx + rr * 0.28, cy); g.fill();
      g.font = `bold ${Math.round(N * 0.024)}px Georgia, serif`; g.textAlign = 'center'; g.fillText('N', cx, cy - rr * 1.4);
      return c;
    }

    // registra el recorrido (llamar cada cuadro)
    track(x, z) {
      const L = this.trail[this.trail.length - 1];
      if (!L || (L[0] - x) ** 2 + (L[1] - z) ** 2 > 16) { this.trail.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]); if (this.trail.length > 3000) this.trail.splice(0, 1); }
    }

    _icon(g, kind, x, y, s) {
      g.save(); g.translate(x, y); g.lineWidth = 2; g.strokeStyle = '#3a2412'; g.fillStyle = '#3a2412';
      if (kind === 'tent') { g.fillStyle = '#8a1c14'; g.beginPath(); g.moveTo(-s, s * 0.7); g.lineTo(0, -s * 0.8); g.lineTo(s, s * 0.7); g.closePath(); g.fill(); g.stroke(); }
      else if (kind === 'sign') { g.fillRect(-1.5, -s * 0.2, 3, s); g.fillRect(-s * 0.7, -s * 0.8, s * 1.4, s * 0.6); }
      else if (kind === 'car') { g.fillRect(-s, -s * 0.35, s * 2, s * 0.7); g.fillRect(-s * 0.5, -s * 0.75, s, s * 0.45); }
      else { g.beginPath(); g.arc(0, 0, s * 0.5, 0, 7); g.fill(); }
      g.restore();
    }

    // dibuja el mapa completo en un canvas visible (pantalla de mapa)
    draw(cv, player, zoom) {
      const W = cv.width, H = cv.height, g = cv.getContext('2d'), z = zoom || 1;
      const k = Math.min(W, H) / this.N * z;
      // con zoom, el mapa se centra en el jugador (sin salirse del papel)
      let cx = this.N / 2, cy = this.N / 2;
      if (z > 1 && player) {
        [cx, cy] = this.w2m(player.pos.x, player.pos.z);
        const hw = W / 2 / k, hh = H / 2 / k;
        cx = Math.max(Math.min(hw, this.N / 2), Math.min(this.N - Math.min(hw, this.N / 2), cx));
        cy = Math.max(Math.min(hh, this.N / 2), Math.min(this.N - Math.min(hh, this.N / 2), cy));
      }
      g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, H / 2); g.scale(k, k); g.translate(-cx, -cy);
      g.drawImage(this.base, 0, 0);
      // recorrido a lápiz
      if (this.trail.length > 1) {
        g.strokeStyle = 'rgba(40,40,52,0.75)'; g.lineWidth = 2.2; g.setLineDash([3, 4]); g.beginPath();
        this.trail.forEach(([x, z], i) => { const [mx, my] = this.w2m(x, z); i ? g.lineTo(mx, my) : g.moveTo(mx, my); }); g.stroke(); g.setLineDash([]);
      }
      // lugares
      g.font = `${Math.round(this.N * 0.021)}px Georgia, serif`; g.textAlign = 'left';
      for (const p of this.places) {
        const [x, y] = this.w2m(p.x, p.z);
        this._icon(g, p.icon, x, y, this.N * 0.012);
        g.fillStyle = '#3a2412'; g.fillText(p.known === false ? p.label + ' ?' : p.label, x + this.N * 0.018, y + this.N * 0.007);
      }
      // jugador: flecha con la dirección de la mirada
      if (player) {
        const [x, y] = this.w2m(player.pos.x, player.pos.z), a = Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw));
        g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
        g.fillStyle = 'rgba(242,194,122,0.25)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, this.N * 0.05, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4); g.fill();
        g.fillStyle = '#b3261e'; g.strokeStyle = '#fff'; g.lineWidth = 2;
        const s = this.N * 0.016; g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.8, s); g.lineTo(0, s * 0.45); g.lineTo(-s * 0.8, s); g.closePath(); g.fill(); g.stroke();
        g.restore();
        g.fillStyle = '#b3261e'; g.font = `bold ${Math.round(this.N * 0.02)}px Georgia, serif`; g.fillText('Estás acá', x + this.N * 0.022, y - this.N * 0.012);
      }
      g.restore();
    }

    // minimapa circular que gira con la mirada (la parte de arriba es hacia donde mirás)
    drawMini(cv, player) {
      const S = cv.width, g = cv.getContext('2d'), r = S / 2, zoom = 2.6; // píxeles de minimapa por metro
      const scale = zoom / (this.N / T.SIZE);
      const [px, py] = this.w2m(player.pos.x, player.pos.z);
      g.clearRect(0, 0, S, S);
      g.save(); g.beginPath(); g.arc(r, r, r - 1, 0, 7); g.clip();
      g.fillStyle = '#c9bfa4'; g.fillRect(0, 0, S, S);
      g.translate(r, r); g.rotate(player.yaw); g.scale(scale, scale); g.translate(-px, -py);
      g.drawImage(this.base, 0, 0);
      if (this.trail.length > 1) {
        g.strokeStyle = 'rgba(40,40,52,0.7)'; g.lineWidth = 2.5 / scale * 1.2; g.beginPath();
        const from = Math.max(0, this.trail.length - 300);
        for (let i = from; i < this.trail.length; i++) { const [mx, my] = this.w2m(this.trail[i][0], this.trail[i][1]); i > from ? g.lineTo(mx, my) : g.moveTo(mx, my); }
        g.stroke();
      }
      for (const p of this.places) { const [x, y] = this.w2m(p.x, p.z); this._icon(g, p.icon, x, y, 6 / scale); }
      g.restore();
      // oscurecer bordes, flecha central y la N que gira
      const grd = g.createRadialGradient(r, r, r * 0.6, r, r, r); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = grd; g.beginPath(); g.arc(r, r, r, 0, 7); g.fill();
      g.fillStyle = '#b3261e'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(r, r - 9); g.lineTo(r + 6, r + 7); g.lineTo(r, r + 3); g.lineTo(r - 6, r + 7); g.closePath(); g.fill(); g.stroke();
      const na = player.yaw - Math.PI / 2; // dirección del norte en pantalla
      const nx = r + Math.cos(na) * (r - 11), ny = r + Math.sin(na) * (r - 11);
      g.fillStyle = '#e4e1d8'; g.font = 'bold 12px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny);
      g.textBaseline = 'alphabetic';
    }
  }

  window.TS.ParkMap = ParkMap;
})();
