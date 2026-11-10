/* ------------------------------------------------------------------ fires that keep burning after impacts */
const fires = [];
function addFire(P, life = 9, size = 1) {
  if (fires.length >= 12) fires.shift();
  fires.push({ x: P.x, y: Math.max(0.2, P.y), z: P.z, life, max: life, size });
}
function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i];
    f.life -= dt;
    if (f.life <= 0) { fires.splice(i, 1); continue; }
    const k = Math.min(1, f.life / 2.5) * f.size;
    if (Math.random() < 0.9 * k) fire.emit(f.x + rnd(-1, 1) * f.size, f.y + 0.2, f.z + rnd(-1, 1) * f.size, rnd(-0.4, 0.4), rnd(2, 4), rnd(-0.4, 0.4), rnd(0.4, 0.8), rnd(0.9, 1.7) * f.size, 1, rnd(0.35, 0.6), 0.08, 0.9, -0.6, 0.5, -1);
    if (Math.random() < 0.45 * k) { const g = rnd(0.12, 0.22); dust.emit(f.x + rnd(-0.6, 0.6), f.y + 1.5, f.z + rnd(-0.6, 0.6), rnd(-0.3, 0.6), rnd(2, 3.5), rnd(-0.3, 0.6), rnd(3, 5), rnd(1.5, 2.5) * f.size, g, g, g + 0.02, 0.55, 1.6, 0.2, -0.3); }
    if (i === 0 && Math.random() < 0.05) flashLight.intensity = Math.max(flashLight.intensity, 0);
  }
}

