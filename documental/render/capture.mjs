// Renderiza fotogramas con Chromium sin interfaz (Playwright) y los envía a ffmpeg.
// Uso:
//   node capture.mjs --timeline T.json --out seg.mp4 --from 0 --to 100   (segundos, 24 fps)
//   node capture.mjs --timeline T.json --stills 10,20,30 --outdir dir    (fotogramas sueltos)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const FPS = 24;
const root = path.dirname(new URL(import.meta.url).pathname);
const timeline = JSON.parse(fs.readFileSync(args.timeline, 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exitCode = 1; });
await page.goto(`http://127.0.0.1:${port}/index.html`);
const duration = await page.evaluate((tl) => window.setup(tl), timeline);

if (args.stills) {
  fs.mkdirSync(args.outdir, { recursive: true });
  for (const s of args.stills.split(',')) {
    const t = parseFloat(s);
    const d = await page.evaluate((t) => window.grab(t, 0.9), t);
    fs.writeFileSync(path.join(args.outdir, `f_${t.toFixed(2)}.jpg`), Buffer.from(d.split(',')[1], 'base64'));
  }
} else {
  const f0 = Math.round(parseFloat(args.from || 0) * FPS), f1 = Math.round(parseFloat(args.to || duration) * FPS);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', args.out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const d = await page.evaluate((t) => window.grab(t), f / FPS);
    const buf = Buffer.from(d.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 120 === 0) console.log(`${args.out}: ${f - f0}/${f1 - f0} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
}
await browser.close(); server.close();
