// Stage a single screenshot of the live game for visual judgment: boot
// headless (same server/chromium/clock pattern as tools/verify.mjs), teleport,
// settle chunks, shoot. The image is for Bruno's eye and for Copilot CLI
// analysis (see GOTCHAS.md → Verification) — never a pass/fail signal.
//
//   node tools/stage-shot.mjs <out.png> <x> <z> [heading°=270] [mode=FLY] [agl=55] [skyT=0.5]
//
//   heading° — compass degrees, 0 = north (−z)
//   agl     — camera-subject height above ground (FLY only; ground modes ignore)
//   skyT    — sky.t fraction of day: 0.5 noon, 0/1 midnight, ~0.25 dawn
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const [out, xa, za, hdga = '270', mode = 'FLY', agla = '55', skyTa = '0.5'] = process.argv.slice(2);
if (!out || xa === undefined || za === undefined) {
  console.error('usage: node tools/stage-shot.mjs <out.png> <x> <z> [heading°] [mode] [agl] [skyT]');
  process.exit(2);
}
const [x, z, hdg, agl, skyT] = [xa, za, hdga, agla, skyTa].map(Number);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = process.env.VERIFY_DEPS || join(os.homedir(), '.cache/lonestar-verify');
const { chromium } = createRequire(join(DEPS, 'noop.js'))('playwright-core');

function findChromium() {
  const pw = join(os.homedir(), '.cache/ms-playwright');
  const entries = readdirSync(pw);
  const shell = entries.filter((e) => e.startsWith('chromium_headless_shell-')).sort().pop();
  if (shell) return join(pw, shell, 'chrome-headless-shell-linux64/chrome-headless-shell');
  const full = entries.filter((e) => e.startsWith('chromium-')).sort().pop();
  return join(pw, full, 'chrome-linux64/chrome');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png' };
const srv = await new Promise((res) => {
  const s = createServer(async (req, rsp) => {
    const path = join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!path.startsWith(ROOT)) { rsp.writeHead(403).end(); return; }
    try { rsp.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }).end(await readFile(path)); }
    catch { rsp.writeHead(404).end(); }
  });
  s.listen(0, '127.0.0.1', () => res(s));
});

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await ctx.newPage();
await page.clock.install();
await page.addInitScript(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 50);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
});
page.on('pageerror', (e) => console.error('pageerror:', String(e).split('\n')[0]));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction('window.__game && document.getElementById("loading").style.display === "none"', null, { timeout: 60000 });
await page.evaluate('window.__skipRender = 1');
await page.clock.runFor(500);

await page.evaluate(`(() => { const g = window.__game;
  g.sky.t = ${skyT};
  g.player.setMode('${mode}');
  g.player.pos.set(${x}, 0, ${z});
  if ('${mode}' === 'FLY') g.player.pos.y = g.hAt(${x}, ${z}) + ${agl};
  g.player.heading = ${hdg} * Math.PI / 180;
  g.player.speed = 0; g.player.vy = 0;
})()`);
await page.clock.runFor(2500); // chunks + scenery spawn around the new position
await page.evaluate('window.__skipRender = 0');
await page.clock.runFor(200);
await page.screenshot({ path: out });
console.log('shot:', resolve(out));
console.log(await page.evaluate('(() => { const g = window.__game; const p = g.player.pos; return `pos ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)} mode=${g.player.mode} inTexas=${g.inTexas(p.x,p.z)} sky.t=${g.sky.t}`; })()'));
await browser.close();
srv.close();
