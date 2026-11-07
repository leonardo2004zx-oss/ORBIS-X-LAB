// Exporta la historia completa como vídeo WebM (lienzo 540x960 + MediaRecorder).
import { captionState, POSITIONS } from "./caption.js";

const W = 540, H = 960, FPS = 30;

/** Decodifica los fotogramas de un GIF. Usa ImageDecoder si existe; si no, un <img>. */
async function makeFrameSource(blob) {
  if ("ImageDecoder" in window) {
    try {
      const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: "image/gif" });
      await dec.tracks.ready;
      const count = dec.tracks.selectedTrack.frameCount;
      const frames = [];
      let total = 0;
      for (let i = 0; i < count; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const ms = Math.max(20, (image.duration || 100000) / 1000);
        frames.push({ bmp: await createImageBitmap(image), start: total, ms });
        total += ms;
        image.close();
      }
      dec.close();
      return {
        frameAt(t) {
          const local = total ? t % total : 0;
          return (frames.find((f) => local < f.start + f.ms) || frames[0]).bmp;
        },
        dispose: () => frames.forEach((f) => f.bmp.close()),
      };
    } catch (e) {
      console.warn("ImageDecoder falló, uso <img>", e);
    }
  }
  const img = new Image();
  const url = URL.createObjectURL(blob);
  img.src = url;
  await img.decode();
  return { frameAt: () => img, dispose: () => URL.revokeObjectURL(url) };
}

function drawCover(ctx, src) {
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function wrap(ctx, text, max) {
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > max && line) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export function drawCaption(ctx, slide, t, w = W, h = H) {
  if (!slide.caption) return;
  const st = captionState(slide.anim, t, slide.caption);
  if (!st.text) return;
  const size = (slide.size / 100) * w * 0.09;
  ctx.save();
  ctx.globalAlpha = st.alpha;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, st.text, w * 0.82);
  const lh = size * 1.2;
  const cy = (POSITIONS[slide.pos] + st.dy) * h;
  ctx.translate(w / 2, cy);
  ctx.scale(st.scale, st.scale);
  lines.forEach((ln, i) => {
    const y = (i - (lines.length - 1) / 2) * lh;
    if (slide.box) {
      const tw = ctx.measureText(ln).width;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.beginPath();
      ctx.roundRect(-tw / 2 - size * 0.4, y - lh / 2, tw + size * 0.8, lh, size * 0.3);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = size * 0.3;
    }
    ctx.fillStyle = slide.color;
    ctx.fillText(ln, 0, y);
  });
  ctx.restore();
}

function pickMime() {
  const opts = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return opts.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

/**
 * Graba la historia en tiempo real. `onProgress(0..1)`.
 * @returns {Promise<Blob>}
 */
export async function exportVideo(slides, onProgress = () => {}) {
  if (!slides.length) throw new Error("La historia está vacía");
  if (!("MediaRecorder" in window)) throw new Error("Tu navegador no permite grabar vídeo");

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const sources = await Promise.all(slides.map((s) => makeFrameSource(s.blob)));
  const total = slides.reduce((a, s) => a + s.duration, 0);

  const mime = pickMime();
  const rec = new MediaRecorder(canvas.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 5e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));

  rec.start(250);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = performance.now() - t0;
      if (t >= total) return resolve();
      let acc = 0, i = 0;
      while (i < slides.length - 1 && t >= acc + slides[i].duration) acc += slides[i++].duration;
      const local = t - acc;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      drawCover(ctx, sources[i].frameAt(local));
      drawCaption(ctx, slides[i], local);
      onProgress(t / total);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  sources.forEach((s) => s.dispose());
  onProgress(1);
  return new Blob(chunks, { type: mime || "video/webm" });
}
