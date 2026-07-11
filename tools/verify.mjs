// Headless verification harness — boots the game once, runs named check suites.
//
//   node tools/verify.mjs [-v] [suite…]   # no args = every suite in tools/checks/
//   node tools/verify.mjs drive missions
//
// One-time setup (deps live OUTSIDE the repo, shared across sessions):
//   mkdir -p ~/.cache/lonestar-verify && cd ~/.cache/lonestar-verify && npm i playwright-core
//   (browser: any chromium in ~/.cache/ms-playwright — `npx playwright install chromium`)
//
// Output contract: compact by default — one summary line per suite plus full
// detail for any FAIL; -v prints every check (durations shown when ≥1 s).
// Exit 1 on any failure. Suites assert NUMBERS at natural play values —
// screenshots are a last resort (t.shot), never the pass/fail signal.
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
const VERBOSE = process.argv.includes('-v');
let passed = 0, failed = 0;
async function check(name, fn) {
  const t0 = Date.now();
  const dur = () => { const s = (Date.now() - t0) / 1000; return s >= 1 ? ` (${s.toFixed(1)}s)` : ''; };
  try {
    await fn();
    passed++;
    if (VERBOSE) console.log(`PASS ${name}${dur()}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name} — ${String(e.message || e).split('\n')[0]}${dur()}`);
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
    // advance player (+ dog) physics synchronously in ONE evaluate — ~instant
    // vs. waiting on real frames (a sim second costs 6–9 wall seconds under
    // SwiftShader). PLAYER PHYSICS ONLY: render-loop systems (missions clock,
    // sky/weather blends, traffic, animals, flares) do not advance — keep
    // simWait for checks that need those ticking. autopilot: true re-aims the
    // truck along the nearest motorway every step (for speed-cap runs).
    // Returns per-step aggregates: { maxSpeed, minAgl, maxGap (dog), types }.
    simStep: (s, autopilot = false) => ev(`(() => {
      const p = g.player, dt = 0.05;
      let maxSpeed = 0, minAgl = Infinity, maxGap = 0;
      const types = new Set();
      for (let i = 0, n = Math.round(${s} / dt); i < n; i++) {
        if (${autopilot}) {
          const r = g.nearestRoad(p.pos.x, p.pos.z, 12, (ty) => ty === 'motorway');
          if (r) {
            let ax = r.x + r.tx * 8, az = r.z + r.tz * 8;
            let h = Math.atan2(-(ax - p.pos.x), -(az - p.pos.z));
            const d = ((h - p.heading) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
            if (Math.abs(d) > Math.PI / 2) { // keep going the way we're already going
              ax = r.x - r.tx * 8; az = r.z - r.tz * 8;
              h = Math.atan2(-(ax - p.pos.x), -(az - p.pos.z));
            }
            p.heading = h;
          }
          types.add(r && r.dist < 4 ? r.type : 'offroad');
        }
        p.update(dt);
        g.dog?.update(dt);
        maxSpeed = Math.max(maxSpeed, p.speed);
        minAgl = Math.min(minAgl, p.pos.y - g.hAt(p.pos.x, p.pos.z));
        if (g.dog?.owned) maxGap = Math.max(maxGap, Math.hypot(g.dog.g.position.x - p.pos.x, g.dog.g.position.z - p.pos.z));
      }
      return { maxSpeed, minAgl, maxGap, types: [...types] };
    })()`),
    // step any render-loop system synchronously: body runs once per dt tick,
    // e.g. t.step(5, 'g.flares.update(dt)') or with an early-exit condition
    // t.step(20, 'g.sky.update(dt, false, 0, 0, 0)', "g.ATMOS.weather === 'rain'").
    // Returns elapsed sim seconds. Same caveat family as simStep — and keep one
    // real-loop sentinel check per system (walk-cap, cars-move, rack-recharge,
    // setWeather) so a broken main.js wiring can't hide behind the steppers.
    step: (s, body, cond = 'false') => ev(`(() => {
      const dt = 0.05;
      let i = 0;
      for (const n = Math.round(${s} / dt); i < n && !(${cond}); i++) { ${body}; }
      return i * dt;
    })()`),
    // held movement keys: write player.keys directly — deterministic, no focus issues
    hold: (code, on = true) => ev(`g.player.keys['${code}'] = ${on}`),
    async release() { await ev(`g.player.keys = {}`); },
    // one-shot action keys (E/V/M/P/…) go through real events like a player's do
    key: (code) => page.evaluate((c) => {
      dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    }, code),
    setTime: (v) => ev(`g.sky.t = ${v}`),
    // find a sky.t that gives daylight / deep night (KEYS are keyframed — probe)
    async findLight(pred, candidates) {
      for (const v of candidates) {
        await t.setTime(v);
        await page.waitForTimeout(250);
        if (pred(await ev('g.ATMOS.night'))) return v;
      }
      throw new Error(`no sky.t in [${candidates}] satisfied the light condition`);
    },
    setDay: () => t.findLight((n) => n < 0.1, [0.3, 0.35, 0.45, 0.25]),
    setNight: () => t.findLight((n) => n > 0.7, [0.98, 0.02, 0.95, 0.05, 0.0]),
    // pin the weather (clear/clouds/rain/storm/dust) — sky.update rewrites ATMOS
    // every frame, so tests must force the state machine, not ATMOS.rain.
    // Poll until ATMOS reflects it: a wall-clock sleep loses to slow frames,
    // and consumers (player.update) read it one frame later still.
    async setWeather(name) {
      await ev(`(g.sky.weather = g.sky.target = '${name}', g.sky.blend = 1, g.sky.nextPick = 120, g.sky.forecast = null)`);
      await t.until(`g.ATMOS.weather === '${name}'`, 10000);
    },
    // poll an expression until truthy — for phase transitions with their own cadence
    async until(expr, ms = 15000, every = 60) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (await ev(expr)) return;
        await page.waitForTimeout(every);
      }
      throw new Error(`until timed out: ${expr.slice(0, 80)}`);
    },
    // install a standard-mapping gamepad stub; mutate window.__pad from tests
    // (axes[0..3], buttons[i].pressed/.value) — ready for the gamepad feature
    async stubGamepad() {
      await page.evaluate(() => {
        window.__pad = {
          index: 0, id: 'stub', connected: true, mapping: 'standard', timestamp: 0,
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        };
        navigator.getGamepads = () => [window.__pad];
      });
    },
    // time series of an expression — assert on trends, not snapshots
    async sample(expr, n = 10, dtMs = 200) {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(await ev(expr));
        await page.waitForTimeout(dtMs);
      }
      return out;
    },
    // last resort, for genuinely visual judgments only — drawing is off during
    // tests (__skipRender), so let one real frame render first
    async shot(name) {
      mkdirSync(SHOTS, { recursive: true });
      const p = join(SHOTS, `${name}.png`);
      await page.evaluate('window.__skipRender = 0');
      await page.waitForTimeout(700); // a SwiftShader frame or two
      await page.screenshot({ path: p });
      await page.evaluate('window.__skipRender = 1');
      console.log(`     shot: ${p}`);
    },
  };
  return t;
}

// --- main ---
const wanted = process.argv.slice(2).filter((a) => a !== '-v');
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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log(`     pageerror: ${String(e).split('\n')[0]}`));

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.waitForFunction('window.__game && document.getElementById("loading").style.display === "none"', null, { timeout: 60000 });
  // skip the ~300 ms SwiftShader draw: the loop still runs every system update
  // at full rAF speed, sim time tracks wall time, and evaluates return fast
  await page.evaluate('window.__skipRender = 1');
  await page.waitForTimeout(500); // first frames: chunks spawn, ATMOS settles
  const t = mkT(page);
  for (const s of suites) {
    if (VERBOSE) console.log(`— ${s}`);
    const p0 = passed, f0 = failed, s0 = Date.now();
    await (await import(join(suiteDir, s + '.mjs'))).default(t);
    const fails = failed - f0;
    console.log(`${s}: ${passed - p0} passed${fails ? `, ${fails} FAILED` : ''}, ${((Date.now() - s0) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(`${passed} passed, ${failed} failed (${suites.join(', ')})`);
process.exit(failed ? 1 : 0);
