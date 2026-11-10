// Orquestación: línea de tiempo, fundidos entre escenas y posproducción.
'use strict';
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
let TL = null, LIST = [], VIGNETTE = null, GRAIN = [];

async function setup(timeline) {
  await Promise.all([document.fonts.load('700 100px Cinzel'), document.fonts.load('400 30px Montserrat'), document.fonts.load('italic 600 46px Montserrat'), document.fonts.load('600 30px Montserrat')]);
  LAND = await (await fetch('assets/land.json')).json();
  TL = timeline;
  buildGlobeTextures();
  LIST = [{ id: 'intro', era: '', start: 0, end: TL.intro, lines: [] }, ...TL.scenes,
    { id: 'outro', era: '', start: TL.scenes[TL.scenes.length - 1].end, end: TL.duration, lines: [] }];
  for (const sc of LIST) {
    sc.dur = sc.end - sc.start;
    sc.L = sc.lines.map((l) => ({ s: l.start - sc.start, e: l.end - sc.start, p: l.pauses || [] }));
    SCENES[sc.id].init && SCENES[sc.id].init(sc);
  }
  VIGNETTE = mkCanvas(W, H);
  { const g = VIGNETTE.getContext('2d'); const gr = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  for (let k = 0; k < 4; k++) {
    const c = mkCanvas(960, 540), g = c.getContext('2d'), id = g.createImageData(960, 540), r = mulberry32(100 + k);
    for (let i = 0; i < id.data.length; i += 4) { const v = (r() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0); GRAIN.push(c);
  }
  return TL.duration;
}

function drawScene(g, sc, t) {
  g.save(); SCENES[sc.id].draw(g, t - sc.start, sc); g.restore();
}

const XF = 0.6;
function renderFrame(t) {
  const g = ctx; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  let i = LIST.findIndex((s) => t < s.end); if (i < 0) i = LIST.length - 1;
  const sc = LIST[i];
  if (i > 0 && t < sc.start + XF) { // fundido con la escena anterior
    drawScene(g, LIST[i - 1], t);
    const k = smooth(sc.start - XF, sc.start + XF, t);
    const buf = renderToBuffer((b) => drawScene(b, sc, t));
    g.globalAlpha = k; g.drawImage(buf, 0, 0); g.globalAlpha = 1;
  } else if (i < LIST.length - 1 && t > sc.end - XF) {
    drawScene(g, sc, t);
    const nx = LIST[i + 1], k = smooth(nx.start - XF, nx.start + XF, t);
    const buf = renderToBuffer((b) => drawScene(b, nx, t));
    g.globalAlpha = k; g.drawImage(buf, 0, 0); g.globalAlpha = 1;
  } else drawScene(g, sc, t);
  // posproducción: viñeta, grano, rótulo de época, fundidos de apertura y cierre
  g.drawImage(VIGNETTE, 0, 0);
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.03;
  g.drawImage(GRAIN[Math.floor(t * 24) % 4], 0, 0, W, H); g.restore();
  const cur = LIST.find((s) => t >= s.start && t < s.end);
  if (cur && cur.era) {
    const lt = t - cur.start, a = fadeInOut(lt, 0.9, 6.4, 0.8, 0.8);
    if (a > 0) {
      g.save(); g.globalAlpha = a; g.fillStyle = 'rgba(255,240,215,0.95)'; g.font = '600 24px Montserrat';
      g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 10;
      const txt = cur.era.toUpperCase(); g.textAlign = 'left';
      g.fillRect(80, 78, 46 * smooth(0.9, 1.8, lt), 2);
      g.fillText(txt, 80, 116); g.restore();
    }
  }
  if (t < 1.2) { g.fillStyle = `rgba(0,0,0,${1 - smooth(0, 1.2, t)})`; g.fillRect(0, 0, W, H); }
  if (t > TL.duration - 1.0) { g.fillStyle = `rgba(0,0,0,${smooth(TL.duration - 1.0, TL.duration - 0.1, t)})`; g.fillRect(0, 0, W, H); }
}
window.setup = setup; window.renderFrame = renderFrame;
window.grab = (t, q = 0.94) => { renderFrame(t); return canvas.toDataURL('image/jpeg', q); };
