// Headless verification harness — boots the game once, runs named check suites.
//
//   node tools/verify.mjs [suite…]        # no args = every suite in tools/checks/
//   node tools/verify.mjs drive missions
//
// One-time setup (deps live OUTSIDE the repo, shared across sessions):
//   mkdir -p ~/.cache/lonestar-verify && cd ~/.cache/lonestar-verify && npm i playwright-core
//   (browser: any chromium in ~/.cache/ms-playwright — `npx playwright install chromium`)
//
// Output contract: exactly one line per check (PASS/FAIL), tiny summary, exit 1
// on any failure. Suites assert NUMBERS at natural play values — screenshots are
// a last resort (t.shot), never the pass/fail signal.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = process.env.VERIFY_DEPS || join(os.homedir(), '.cache/lonestar-verify');
const SHOTS = process.env.VERIFY_SHOTS || join(os.tmpdir(), 'lonestar-shots');

// --- playwright-core from the persistent cache dir ---
const { chromium } = createRequire(join(DEPS, 'noop.js'))('playwright-core');

function findChromium() {
  const pw = join(os.homedir(), '.cache/ms-playwright');
  if (!existsSync(pw)) throw new Error('no ~/.cache/ms-playwright — run: npx playwright install chromium');
  const entries = readdirSync(pw);
  const shell = entries.filter((e) => e.startsWith('chromium_headless_shell-')).sort().pop();
  if (shell) return join(pw, shell, 'chrome-headless-shell-linux64/chrome-headless-shell');
  const full = entries.filter((e) => e.startsWith('chromium-')).sort().pop();
  if (full) return join(pw, full, 'chrome-linux64/chrome');
  throw new Error('no chromium build in ~/.cache/ms-playwright');
}

// --- tiny static server for the repo (ES modules need http, not file://) ---
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png' };
function serve() {
  return new Promise((res) => {
    const srv = createServer(async (req, rsp) => {
      const path = join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      if (!path.startsWith(ROOT)) { rsp.writeHead(403).end(); return; }
      try {
        const body = await readFile(path);
        rsp.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }).end(body);
      } catch { rsp.writeHead(404).end(); }
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// --- check runner ---
let passed = 0, failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name} — ${String(e.message || e).split('\n')[0]}`);
  }
}

function mkT(page) {
  // evaluate an expression string with `g` = window.__game
  const ev = (expr) => page.evaluate(`(() => { const g = window.__game; return (${expr}); })()`);
  const t = {
    page, ev, check,
    ok(cond, msg) { if (!cond) throw new Error(msg); },
    near(a, b, eps, msg) { if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a.toFixed(2)} vs ${b.toFixed(2)} (±${eps})`); },
    // teleport + settle (mode first: setMode zeroes y for ground modes)
    async tp(x, z, mode = 'DRIVE', y = 0) {
      await ev(`(g.player.setMode('${mode}'), g.player.pos.set(${x}, ${y}, ${z}), g.player.speed = 0, g.player.vy = 0)`);
      await t.wait(0.15);
    },
    wait: (s) => page.waitForTimeout(s * 1000),
    // wait for N seconds of *physics* time (player.simT = Σ clamped dt) — headless
    // frames run slow and dt clamps at 0.05, so wall/clock waits mislead physics tests
    async simWait(s) {
      const t0 = await ev('g.player.simT');
      const deadline = Date.now() + Math.max(30000, s * 25000);
      while ((await ev('g.player.simT')) - t0 < s) {
        if (Date.now() > deadline) throw new Error(`simWait(${s}) timed out`);
        await page.waitForTimeout(60);
      }
    },
    // held movement keys: write player.keys directly — deterministic, no focus issues
    hold: (code, on = true) => ev(`g.player.keys['${code}'] = ${on}`),
    async release() { await ev(`g.player.keys = {}`); },
    // one-shot action keys (E/V/M/P/…) go through real events like a player's do
    key: (code) => page.evaluate((c) => {
      dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    }, code),
    setTime: (v) => ev(`g.sky.t = ${v}`),
    // time series of an expression — assert on trends, not snapshots
    async sample(expr, n = 10, dtMs = 200) {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(await ev(expr));
        await page.waitForTimeout(dtMs);
      }
      return out;
    },
    // last resort, for genuinely visual judgments only
    async shot(name) {
      mkdirSync(SHOTS, { recursive: true });
      const p = join(SHOTS, `${name}.png`);
      await page.screenshot({ path: p });
      console.log(`     shot: ${p}`);
    },
  };
  return t;
}

// --- main ---
const wanted = process.argv.slice(2);
const suiteDir = join(ROOT, 'tools/checks');
const all = (await readdir(suiteDir)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace('.mjs', ''));
const suites = wanted.length ? wanted : all;
const unknown = suites.filter((s) => !all.includes(s));
if (unknown.length) { console.error(`unknown suite(s): ${unknown.join(', ')} — have: ${all.join(', ')}`); process.exit(2); }

const srv = await serve();
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
// small viewport: SwiftShader fill rate directly limits sim fps
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log(`     pageerror: ${String(e).split('\n')[0]}`));

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.waitForFunction('window.__game && document.getElementById("loading").style.display === "none"', null, { timeout: 60000 });
  await page.waitForTimeout(500); // first frames: chunks spawn, ATMOS settles
  const t = mkT(page);
  for (const s of suites) {
    console.log(`— ${s}`);
    await (await import(join(suiteDir, s + '.mjs'))).default(t);
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(`${passed} passed, ${failed} failed (${suites.join(', ')})`);
process.exit(failed ? 1 : 0);
