/* DUAL PROJECTOR PLAYER — núcleo: cómo se reparte cada fotograma entre las salidas A y B.
 * Sin dependencias. Canvas 2D (liviano, funciona sin WebGL en PCs modestas).
 *
 * Modelo: las dos salidas (cada una de outW × outH píxeles) forman un lienzo virtual de
 * ancho (2 − o) · outW, donde o es el solapamiento (0..1). La salida A muestra x ∈ [0, outW]
 * y la B x ∈ [(1 − o) · outW, (2 − o) · outW]. La película se coloca en ese lienzo
 * respetando su proporción («encajar» o «llenar»).
 */
(function (root) {
  'use strict';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Rectángulo de la película dentro del lienzo virtual
  function movieRect(mw, mh, outW, outH, o, fit) {
    const V = (2 - o) * outW;
    if (!mw || !mh) return { x: 0, y: 0, w: V, h: outH, V: V };
    if (fit === 'stretch') return { x: 0, y: 0, w: V, h: outH, V: V };
    const s = fit === 'cover' ? Math.max(V / mw, outH / mh) : Math.min(V / mw, outH / mh);
    const w = mw * s, h = mh * s;
    return { x: (V - w) / 2, y: (outH - h) / 2, w: w, h: h, V: V };
  }

  // Desplazamiento horizontal de la salida i dentro del lienzo virtual
  function outputOffset(i, outW, o) { return i * (1 - o) * outW; }

  // Peso de LUZ en la zona compartida (0..1): rampa lineal mezclada con curva suave
  function rampLight(t, curve) { t = clamp(t, 0, 1); return t + (t * t * (3 - 2 * t) - t) * curve; }

  // Dibuja la salida i del fotograma actual de `src` (video, imagen o canvas) en ctx (tamaño outW × outH)
  // st: { o, fit, blend, gamma, curve, nudge:[{x,y},{x,y}], grid, bright:[a,b] }
  function drawOutput(ctx, src, i, st, outW, outH) {
    const mw = src ? (src.displayWidth || src.videoWidth || src.naturalWidth || src.width) : 0;    // displayWidth: VideoFrame
    const mh = src ? (src.displayHeight || src.videoHeight || src.naturalHeight || src.height) : 0;
    const o = st.o, r = movieRect(mw, mh, outW, outH, o, st.fit), ox = outputOffset(i, outW, o);
    const n = (st.nudge && st.nudge[i]) || { x: 0, y: 0 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, outW, outH);
    if (mw && mh) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(src, 0, 0, mw, mh, r.x - ox + n.x, r.y + n.y, r.w, r.h);   // el lienzo recorta lo que no le toca
    }
    // brillo individual (atenúa la señal de esta salida)
    const br = st.bright ? st.bright[i] : 1;
    if (br < 0.999) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - br).toFixed(3) + ')'; ctx.fillRect(0, 0, outW, outH); }
    // EDGE BLENDING: en la zona compartida la señal se atenúa con w^(1/γ) para que la LUZ de A + B sume 1
    const ov = o * outW;
    if (st.blend > 0 && o > 0.001 && o < 0.999 && ov >= 2) {
      const x0 = i === 0 ? outW - ov : 0, x1 = i === 0 ? outW : ov;
      const g = ctx.createLinearGradient(x0, 0, x1, 0), N = 24;
      for (let k = 0; k <= N; k++) {
        const u = k / N;                                   // 0 → 1 a lo largo de la zona
        const t = i === 0 ? 1 - u : u;                     // A se apaga hacia la derecha, B se enciende
        let w = rampLight(t, st.curve);
        w = 1 + (w - 1) * st.blend;                        // intensidad del blending
        const sig = Math.pow(Math.max(w, 0), 1 / st.gamma);
        g.addColorStop(u, 'rgba(0,0,0,' + (1 - sig).toFixed(4) + ')');
      }
      ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, outH);
    }
    // cuadrícula de calibración en coordenadas del lienzo virtual (se superpone exacta si A y B están alineados)
    if (st.grid) drawGrid(ctx, i, st, outW, outH, ox, n);
    return r;
  }

  function drawGrid(ctx, i, st, outW, outH, ox, n) {
    const step = outW / 16, col = i === 0 ? 'rgba(255,150,60,0.95)' : 'rgba(70,190,255,0.95)';
    ctx.save(); ctx.translate(-ox + n.x, n.y);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, outW / 960);
    const V = (2 - st.o) * outW;
    ctx.beginPath();
    for (let x = 0; x <= V + 0.5; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, outH); }
    for (let y = 0; y <= outH + 0.5; y += step) { ctx.moveTo(0, y); ctx.lineTo(V, y); }
    ctx.stroke();
    // cruces de referencia en el centro de la zona compartida
    const cx = (1 - st.o / 2) * outW;
    ctx.lineWidth = Math.max(2, outW / 480);
    [0.2, 0.5, 0.8].forEach(function (fy) {
      const y = fy * outH, s = outH * 0.05;
      ctx.beginPath(); ctx.arc(cx, y, s, 0, Math.PI * 2); ctx.moveTo(cx - s * 1.5, y); ctx.lineTo(cx + s * 1.5, y); ctx.moveTo(cx, y - s * 1.5); ctx.lineTo(cx, y + s * 1.5); ctx.stroke();
    });
    ctx.restore();
  }

  root.DPPCore = { movieRect: movieRect, outputOffset: outputOffset, rampLight: rampLight, drawOutput: drawOutput, clamp: clamp };
})(typeof window !== 'undefined' ? window : globalThis);
