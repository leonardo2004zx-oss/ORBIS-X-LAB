import { inspectGif, suggestDuration } from "./gif.js";
import { ANIMATIONS } from "./caption.js";
import { drawCaption, exportVideo } from "./export.js";
import { saveProject, loadProject } from "./store.js";

const $ = (id) => document.getElementById(id);

const DEMO = [
  { file: "01-hiperespacio.gif", caption: "Todo empezó con un salto al hiperespacio…", anim: "type", pos: "bottom" },
  { file: "02-orbita.gif", caption: "Hasta llegar a Orbis 🌍", anim: "pop", pos: "top" },
  { file: "03-despegue.gif", caption: "Cada misión es un nuevo despegue 🚀", anim: "rise", pos: "top", box: true },
  { file: "04-atardecer.gif", caption: "Y cada día termina mirando las olas", anim: "float", pos: "top" },
];

const state = { title: "", slides: [], current: -1 };

// ---------- Utilidades ----------
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

const fmt = (ms) => (ms / 1000).toFixed(1) + " s";
const uid = () => Math.random().toString(36).slice(2, 10);

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject({ title: state.title, slides: state.slides }), 300);
}

/** Asigna un objectURL nuevo al <img>, lo que reinicia la animación del GIF. */
function setGif(img, blob) {
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  if (!blob) { img.removeAttribute("src"); delete img.dataset.url; return; }
  const url = URL.createObjectURL(blob);
  img.dataset.url = url;
  img.src = url;
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return canvas.getContext("2d");
}

function renderText(canvas, slide, t) {
  const ctx = fitCanvas(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (slide) drawCaption(ctx, slide, t, canvas.width, canvas.height);
}

// ---------- Añadir GIFs ----------
async function addBlob(blob, name, extra = {}) {
  let info;
  try {
    info = inspectGif(await blob.arrayBuffer());
  } catch {
    toast(`«${name}» no es un GIF válido`);
    return null;
  }
  if (info.frames < 2) {
    toast(`«${name}» no tiene movimiento (sólo 1 fotograma); se descartó`);
    return null;
  }
  const slide = {
    id: uid(), name, blob,
    frames: info.frames, loopMs: info.loopMs,
    duration: suggestDuration(info.loopMs),
    caption: "", anim: "fade", pos: "bottom", color: "#ffffff", size: 100, box: false,
    ...extra,
  };
  state.slides.push(slide);
  return slide;
}

async function addFiles(files) {
  const gifs = [...files].filter((f) => f.type === "image/gif" || /\.gif$/i.test(f.name));
  if (!gifs.length) return toast("Sólo se aceptan archivos .gif");
  let added = 0;
  for (const f of gifs) if (await addBlob(f, f.name)) added++;
  if (added) select(state.slides.length - added);
  renderStrip();
  persist();
}

async function loadDemo() {
  try {
    state.slides = [];
    state.title = "El viaje de Orbis";
    $("title").value = state.title;
    for (const d of DEMO) {
      const res = await fetch("demo/" + d.file);
      if (!res.ok) throw new Error(res.status);
      const { file, ...extra } = d;
      await addBlob(await res.blob(), file, extra);
    }
    select(0);
    renderStrip();
    persist();
  } catch {
    toast("No se pudo cargar la demo. Abre la app con un servidor local (ver README).");
  }
}

// ---------- Editor ----------
function renderStrip() {
  const strip = $("strip");
  strip.innerHTML = "";
  state.slides.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "thumb" + (i === state.current ? " active" : "");
    el.title = s.name;
    const img = document.createElement("img");
    setGif(img, s.blob);
    el.append(img);
    el.insertAdjacentHTML("beforeend", `<span class="n">${i + 1}</span>`);
    el.onclick = () => select(i);
    strip.append(el);
  });
  const has = state.slides.length > 0;
  $("empty").hidden = has;
  $("play").disabled = $("export").disabled = !has;
  if (!has) { state.current = -1; select(-1); }
}

function select(i) {
  state.current = i;
  const s = state.slides[i];
  $("panel").hidden = !s;
  setGif($("previewImg"), s?.blob);
  previewStart = performance.now();
  [...$("strip").children].forEach((el, j) => el.classList.toggle("active", j === i));
  if (!s) { $("meta").textContent = ""; return; }
  $("slideNum").textContent = `${i + 1} de ${state.slides.length}`;
  $("caption").value = s.caption;
  $("anim").value = s.anim;
  $("pos").value = s.pos;
  $("color").value = s.color;
  $("size").value = s.size;
  $("box").checked = s.box;
  $("duration").value = s.duration;
  $("durLabel").textContent = fmt(s.duration);
  $("meta").textContent = `${s.name} · ${s.frames} fotogramas · ciclo de ${fmt(s.loopMs)}`;
}

function bindField(id, key, parse = (v) => v, prop = "value") {
  $(id).addEventListener("input", () => {
    const s = state.slides[state.current];
    if (!s) return;
    s[key] = parse($(id)[prop]);
    if (key === "duration") $("durLabel").textContent = fmt(s.duration);
    if (key === "anim" || key === "caption") previewStart = performance.now();
    persist();
  });
}

// Vista previa: el texto se anima en bucle según la duración de la diapositiva.
let previewStart = performance.now();
function previewLoop() {
  const s = state.slides[state.current];
  if (s && performance.now() - previewStart >= s.duration) {
    // Reinicia el GIF junto con la animación del texto.
    previewStart = performance.now();
    setGif($("previewImg"), s.blob);
  }
  const t = s ? performance.now() - previewStart : 0;
  renderText($("previewText"), s, t);
  requestAnimationFrame(previewLoop);
}

// ---------- Visor ----------
const viewer = { i: 0, start: 0, elapsed: 0, paused: false, raf: 0 };

function openViewer(from = 0) {
  if (!state.slides.length) return;
  $("viewer").hidden = false;
  setPaused(false);
  $("vTitle").textContent = state.title || "Mi historia";
  $("bars").innerHTML = state.slides.map(() => "<span><i></i></span>").join("");
  showSlide(from);
  cancelAnimationFrame(viewer.raf);
  viewer.raf = requestAnimationFrame(viewerLoop);
}

function closeViewer() {
  $("viewer").hidden = true;
  cancelAnimationFrame(viewer.raf);
  setGif($("vImg"), null);
}

function showSlide(i) {
  if (i < 0) i = 0;
  if (i >= state.slides.length) return closeViewer();
  viewer.i = i;
  viewer.elapsed = 0;
  viewer.start = performance.now();
  setGif($("vImg"), state.slides[i].blob);
  [...$("bars").children].forEach((b, j) => (b.firstChild.style.width = j < i ? "100%" : "0%"));
}

function viewerLoop(now) {
  const s = state.slides[viewer.i];
  if (!s || $("viewer").hidden) return;
  const t = viewer.paused ? viewer.elapsed : viewer.elapsed + (now - viewer.start);
  $("bars").children[viewer.i].firstChild.style.width = Math.min(100, (t / s.duration) * 100) + "%";
  renderText($("vText"), s, t);
  if (t >= s.duration) showSlide(viewer.i + 1);
  viewer.raf = requestAnimationFrame(viewerLoop);
}

function setPaused(p) {
  if (p === viewer.paused) return;
  const now = performance.now();
  if (p) viewer.elapsed += now - viewer.start;
  else viewer.start = now;
  viewer.paused = p;
  $("paused").hidden = !p;
  $("vImg").style.filter = p ? "brightness(.6)" : "";
}

// Toque corto = navegar; mantener pulsado = pausar.
function bindTap(el, dir) {
  let timer, held = false;
  el.addEventListener("pointerdown", () => {
    held = false;
    timer = setTimeout(() => { held = true; setPaused(true); }, 220);
  });
  el.addEventListener("pointerup", () => {
    clearTimeout(timer);
    if (held) setPaused(false);
    else showSlide(viewer.i + dir);
  });
  el.addEventListener("pointerleave", () => { clearTimeout(timer); if (held) setPaused(false); });
}

// ---------- Exportar ----------
async function doExport() {
  $("exporting").hidden = false;
  try {
    const blob = await exportVideo(state.slides, (p) => ($("exportBar").value = p));
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    const video = $("outVideo");
    if (video.src) URL.revokeObjectURL(video.src);
    video.src = url;
    const a = $("outLink");
    a.href = url;
    a.download = (state.title || "historia").replace(/[^\w\-áéíóúñ ]/gi, "").trim().replace(/\s+/g, "-") + "." + ext;
    $("videoOut").hidden = false;
    video.play().catch(() => {});
    toast("Vídeo exportado ✔");
  } catch (e) {
    toast("Error al exportar: " + e.message);
  } finally {
    $("exporting").hidden = true;
  }
}

// ---------- Inicio ----------
function init() {
  $("anim").innerHTML = Object.entries(ANIMATIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");

  bindField("caption", "caption");
  bindField("anim", "anim");
  bindField("pos", "pos");
  bindField("color", "color");
  bindField("size", "size", Number);
  bindField("box", "box", Boolean, "checked");
  bindField("duration", "duration", Number);

  $("title").addEventListener("input", (e) => { state.title = e.target.value; persist(); });
  $("file").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  $("demo").onclick = loadDemo;
  $("play").onclick = () => openViewer(Math.max(0, state.current));
  $("export").onclick = doExport;
  $("close").onclick = closeViewer;
  // Dentro de claude.ai las descargas pasan por la capacidad "downloads".
  $("outLink").addEventListener("click", async (e) => {
    if (!window.claude?.use) return; // fuera de claude.ai: enlace normal
    e.preventDefault();
    const downloads = await window.claude.use("downloads");
    if (!downloads) return toast("Aquí no se pueden descargar archivos; mantén pulsado el vídeo para guardarlo");
    try {
      const blob = await (await fetch($("outLink").href)).blob();
      await downloads.save({ filename: $("outLink").download, data: blob });
      toast("Vídeo guardado ✔");
    } catch (err) {
      if (err?.code !== "declined") toast("No se pudo guardar: " + (err?.message || err));
    }
  });
  $("outClose").onclick = () => { $("outVideo").pause(); $("videoOut").hidden = true; };

  $("fitLoop").onclick = () => {
    const s = state.slides[state.current];
    if (!s?.loopMs) return;
    const loops = Math.max(1, Math.round(s.duration / s.loopMs));
    s.duration = Math.min(15000, loops * s.loopMs);
    select(state.current);
    persist();
  };
  const move = (d) => {
    const i = state.current, j = i + d;
    if (j < 0 || j >= state.slides.length) return;
    [state.slides[i], state.slides[j]] = [state.slides[j], state.slides[i]];
    state.current = j;
    renderStrip(); select(j); persist();
  };
  $("up").onclick = () => move(-1);
  $("down").onclick = () => move(1);
  $("remove").onclick = () => {
    state.slides.splice(state.current, 1);
    renderStrip();
    select(Math.min(state.current, state.slides.length - 1));
    persist();
  };

  // Arrastrar y soltar
  const drop = document.body;
  drop.addEventListener("dragover", (e) => { e.preventDefault(); $("phone").classList.add("drag"); });
  drop.addEventListener("dragleave", (e) => { if (!e.relatedTarget) $("phone").classList.remove("drag"); });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    $("phone").classList.remove("drag");
    addFiles(e.dataTransfer.files);
  });

  bindTap($("tapPrev"), -1);
  bindTap($("tapNext"), 1);
  document.addEventListener("keydown", (e) => {
    if ($("viewer").hidden) return;
    if (e.key === "ArrowRight") showSlide(viewer.i + 1);
    else if (e.key === "ArrowLeft") showSlide(viewer.i - 1);
    else if (e.key === "Escape") closeViewer();
    else if (e.key === " ") { e.preventDefault(); setPaused(!viewer.paused); }
  });

  renderStrip();
  requestAnimationFrame(previewLoop);

  loadProject().then((p) => {
    if (!p?.slides?.length) return loadDemo(); // primera visita: abre la demo
    state.title = p.title || "";
    state.slides = p.slides;
    $("title").value = state.title;
    renderStrip();
    select(0);
  });
}

init();
