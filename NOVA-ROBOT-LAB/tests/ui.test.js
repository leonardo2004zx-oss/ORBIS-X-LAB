// Prueba de interfaz en Chromium (Playwright): clics reales sobre los botones.
const { chromium } = require('playwright');
const path = require('path'), assert = require('assert');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  const txt = id => p.textContent('#' + id), click = c => p.click(`[data-cmd="${c}"]`);
  assert.strictEqual(await txt('pos'), '(5, 5)'); assert.strictEqual(await txt('dir'), 'Norte');
  await click('forward'); assert.strictEqual(await txt('pos'), '(5, 4)');
  await click('right'); assert.strictEqual(await txt('dir'), 'Este');
  await click('forward'); await click('backward'); assert.strictEqual(await txt('pos'), '(5, 4)');
  await click('left'); assert.strictEqual(await txt('dir'), 'Norte');
  await click('stop'); assert.strictEqual(await txt('state'), 'DETENIDO');
  for (let i = 0; i < 6; i++) await click('forward');
  assert.strictEqual(await txt('pos'), '(5, 0)'); assert.strictEqual(await txt('state'), 'BLOQUEADO');
  assert.strictEqual(await p.locator('#history li.err').count(), 2);
  await p.keyboard.press('ArrowDown'); assert.strictEqual(await txt('pos'), '(5, 1)');
  await p.waitForTimeout(500);
  // El robot visual debe estar en la celda correcta
  const [g, r] = await Promise.all(['#grid', '#robot'].map(s => p.locator(s).boundingBox()));
  const cell = g.width / 10; assert(Math.abs(r.x - g.x - 5 * cell) < 3 && Math.abs(r.y - g.y - 1 * cell) < 3, 'robot visual desalineado ' + JSON.stringify({g, r}));
  const hist = await p.locator('#history li').count(); assert.strictEqual(hist, 14);
  await p.screenshot({ path: process.argv[2] || 'screenshot.png' });
  await click('reset');
  assert.strictEqual(await txt('pos'), '(5, 5)'); assert.strictEqual(await txt('dir'), 'Norte');
  assert.strictEqual(await p.locator('#history li').count(), 1);
  assert.deepStrictEqual(errs, []);
  console.log('OK  interfaz: botones, teclado, límites, historial (14), posición visual, reinicio, 0 errores de consola');
  await b.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
