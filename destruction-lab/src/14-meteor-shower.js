/* ------------------------------------------------------------------ meteor shower */
const shower = [];
function startShower(n = 12, center = null, size = 6) {
  const cx = center ? center.x : 0, cz = center ? center.z : 0, spread = 14 + n * 1.2;
  let t = 0;
  for (let i = 0; i < n; i++) { t += rnd(0.12, 0.45); const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * spread; shower.push({ t, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, size: Math.max(1, Math.round(rnd(size * 0.35, size))) }); }
  toast(`Lluvia de ${n} meteoritos`);
}
function updateShower(dt) {
  for (let i = shower.length - 1; i >= 0; i--) {
    shower[i].t -= dt;
    if (shower[i].t <= 0) { const s = shower.splice(i, 1)[0]; launchMeteor(pickDown(s.x, s.z), s.size); }
  }
}

