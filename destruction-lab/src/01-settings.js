/* ------------------------------------------------------------------ settings */
const QUALITY = {
  bajo:  { dpr: 1,                   shadowSize: 0,    bs: 3, frag: [2, 1, 2], maxDebris: 80,  particles: 600,  fragBudget: 10, substeps: 2, post: false, bloomScale: 0.5 },
  medio: { dpr: Math.min(DPR, isCoarse ? 1.25 : 1.5),  shadowSize: 1024, bs: 2, frag: [2, 2, 2], maxDebris: 180, particles: 1400, fragBudget: 22, substeps: 2, post: true, bloomScale: 0.5 },
  alto:  { dpr: Math.min(DPR, 2),    shadowSize: 2048, bs: 2, frag: [2, 2, 2], maxDebris: 360, particles: 2600, fragBudget: 40, substeps: 3, post: true, bloomScale: 1 },
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('dlab.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dlab.' + k, JSON.stringify(v)); } catch (e) {} },
};
const settings = {
  quality: store.get('quality', isCoarse ? 'medio' : 'alto'),
  sound: store.get('sound', true),
  shadows: store.get('shadows', true),
  dynRes: true,
  maxDebris: null,
  maxFx: null,
};
if (!QUALITY[settings.quality]) settings.quality = 'medio';
function applyQualityDefaults() {
  const q = QUALITY[settings.quality];
  settings.maxDebris = store.get('maxDebris.' + settings.quality, q.maxDebris);
  settings.maxFx = store.get('maxFx.' + settings.quality, q.particles);
}
applyQualityDefaults();
let Q = QUALITY[settings.quality];

