// Headless verification harness — runs named check suites across a pool of
// parallel browser workers (each suite gets a fresh game in its own context).
//
//   node tools/verify.mjs [-v] [-q] [-j N] [suite…]   # no args = every suite
//   node tools/verify.mjs drive missions
//   node tools/verify.mjs -j8                     # force 8-wide (default: cores/2, RAM-capped)
//   node tools/verify.mjs -q                      # quiet: FAIL/FLAKE detail + final summary only
//
// Every run also writes the full compact report to /tmp/lonestar-verify.log
// (override: VERIFY_LOG) — so -q callers pay tokens for detail only when a
// failure makes reading it worthwhile. -q overrides -v; exit code unchanged.
//
// One-time setup (deps live OUTSIDE the repo, shared across sessions):
//   mkdir -p ~/.cache/lonestar-verify && cd ~/.cache/lonestar-verify && npm i playwright-core
//   (browser: any chromium in ~/.cache/ms-playwright — `npx playwright install chromium`)
//
// Output contract: compact by default — one summary line per suite plus full
// detail for any FAIL; -v prints every check (durations shown when ≥1 s).
// -q caps console FAIL detail at 5 lines per suite (FLAKE/confirm/INFRA
// labels always print past the cap; the LOG file always has everything) —
// never pipe this tool through tail/head, the cap is the trim and a pipe can
// cut the root-cause line. A thrown JS bug (Reference/Type/SyntaxError) aborts
// the rest of its suite — remaining checks report as "not run" instead of
// cascading a FAIL each; assertion failures and timeouts don't abort.
//
// Flake auto-confirm: any suite that fails in the parallel pool is rerun once
// SOLO (its own browser, alone, nothing co-scheduled — the -j 1 equivalent),
// one suite at a time after the pool drains. A solo-green rerun is relabeled
// `FLAKE (solo-green): <suite>` and does not affect the exit code (matching
// the shipped push practice), but the label — and the original failure
// detail above it — always print, gated-off nothing, so a real intermittent
// bug can't hide behind it. A rerun that fails again stays a real FAIL and
// keeps the nonzero exit. This replaces the manual batched -j 1 confirm step
// (GOTCHAS.md → Verification → full-verify run discipline).
//
// TEMPORARY POLICY (2026-07-22): solo-green still exits 0 — this is a stopgap
// pending an evidence-based flake policy (enough recorded history to tell a
// real intermittent from a suite that never should have flaked). The summary
// line and JSON both say so; don't read "exit 0" as a permanent verdict that
// solo-green suites are fine to ignore.
//
// Failure matrix (2026-07-22 runner-telemetry wave): every suite-phase throw
// is discriminated by `browser.isConnected()`. Browser alive → the failure
// belongs to the suite (recorded as an 'assertion'/'pageerror'/'runner'
// failure, normal solo-rerun flow). Browser dead → the attempt is an INFRA
// casualty — zero failure signatures, never a FAIL — the suite is re-queued
// once and the worker relaunches its browser once; a second casualty on the
// same suite is final (`status:'infra'`). Workers never reject: a navigation/
// import failure or a mid-suite browser crash no longer kills the whole pool
// (the prior bug — no report, no LOG, no JSON). A solo rerun that loses its
// browser gets one relaunch; if that's lost too, the original pool FAIL
// stands **unconfirmed** (`FAIL (unconfirmed — solo rerun lost to browser
// crash): <suite>`) and still counts toward the exit code. Exit codes: 0 pass
// (solo-green flakes included) · 1 any confirmed-or-unconfirmed test failure
// · 2 usage · 3 infra-incomplete (no test failures, ≥1 suite ended 'infra') —
// precedence 1 > 3.
//
// Durable history: every completed run also writes a compact JSON snapshot to
// VERIFY_HISTORY_DIR (default ~/.cache/lonestar-verify/history/, one file per
// run, pruned past VERIFY_HISTORY_DAYS/VERIFY_HISTORY_KEEP — default 180 days
// AND beyond the newest 100). VERIFY_JSON (/tmp/lonestar-verify.json) stays
// the latest-run pointer, written atomically (temp file + rename). Any
// telemetry write failure (LOG, history, or latest pointer) warns loudly on
// stderr — test-result exit semantics are unaffected either way.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = process.env.VERIFY_DEPS || join(os.homedir(), '.cache/lonestar-verify');
const SHOTS = process.env.VERIFY_SHOTS || join(os.tmpdir(), 'lonestar-shots');
const round1 = (x) => Math.round(x * 10) / 10;

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
        rsp.writeHead(200, {
          'content-type': MIME[extname(path)] || 'application/octet-stream',
          // A worker keeps one browser context for its lifetime. Its fresh
          // pages can safely reuse static modules and data after storage reset.
          'cache-control': 'public, max-age=3600',
        }).end(body);
      } catch { rsp.writeHead(404).end(); }
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// --- check runner ---
// Counters + detail lines live per suite-run (a "sink") so suites can run
// concurrently in separate browser workers without racing on shared totals.
// Lines are buffered into the sink and flushed in canonical suite order after
// the pool drains, so the compact one-line-per-suite output contract holds
// regardless of the order suites actually finish in.
const QUIET = process.argv.includes('-q');
const VERBOSE = process.argv.includes('-v') && !QUIET; // -q wins over -v
const LOG = process.env.VERIFY_LOG || '/tmp/lonestar-verify.log';

// Deterministic failure signature: strip timing/paths so identical failures
// don't look unrelated across runs. tmp-path tokens are normalized BEFORE
// digit runs (so the path's own digits don't survive as noise), then digit
// runs collapse to '#', then truncate.
function normalizeMessage(msg) {
  return String(msg)
    .replace(/\/tmp\/[^\s'"]*/g, '<tmp>')
    .replace(/\d+/g, '#')
    .slice(0, 120);
}
function makeSignature(type, check, message) {
  return `${type}:${check ?? ''}:${normalizeMessage(message)}`;
}

function mkCheck(sink, browser) {
  return async function check(name, fn) {
    if (sink.aborted) { sink.skipped++; sink.checks.push({ name, ms: 0, status: 'skip' }); return; }
    const t0 = Date.now();
    const dur = () => { const s = (Date.now() - t0) / 1000; return s >= 1 ? ` (${s.toFixed(1)}s)` : ''; };
    try {
      await fn();
      sink.passed++;
      sink.checks.push({ name, ms: Date.now() - t0, status: 'pass' });
      if (VERBOSE) sink.lines.push(`PASS ${name}${dur()}`);
    } catch (e) {
      // Discriminator: a check body that touches a dead browser (e.g. a
      // page.evaluate after the browser crashed) throws too — but that
      // failure belongs to the browser, not the suite. Mark the whole
      // attempt an infra casualty and stop (remaining checks would only
      // repeat the same crash).
      if (browser && !browser.isConnected()) {
        sink.infra = true;
        sink.aborted = true;
        sink.checks.push({ name, ms: Date.now() - t0, status: 'skip' });
        sink.lines.push(`     browser crashed during check "${name}" — attempt discarded (infra)`);
        return;
      }
      sink.failed++;
      sink.checks.push({ name, ms: Date.now() - t0, status: 'fail' });
      const msg = String(e.message || e).split('\n')[0];
      sink.lines.push(`FAIL ${name} — ${msg}${dur()}`);
      sink.failures.push({ type: 'assertion', check: name, message: msg, signature: makeSignature('assertion', name, msg), count: 1 });
      // A thrown JS bug (Reference/Type/SyntaxError, node- or page-side)
      // invalidates every later check in the suite — one root cause cascades
      // into a FAIL per dependent check (25 FAILs from one bad variable,
      // 2026-07-22). Assertion failures and helper timeouts keep going.
      if (e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError
          || /(^|[\s:(])(Reference|Type|Syntax)Error\b/.test(msg)) {
        sink.aborted = true;
        sink.lines.push('     suite aborted — remaining checks not run (thrown error, not an assertion)');
      }
    }
  };
}

function mkT(page, check, sink) {
  // evaluate an expression string with `g` = window.__game
  const ev = (expr) => page.evaluate(`(() => { const g = window.__game; return (${expr}); })()`);
  const t = {
    page, ev, check,
    ok(cond, msg) { if (!cond) throw new Error(msg); },
    near(a, b, eps, msg) {
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(eps)) throw new Error(`${msg}: non-finite (${a} vs ${b}, ±${eps})`);
      if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a.toFixed(2)} vs ${b.toFixed(2)} (±${eps})`);
    },
    // teleport + settle (mode first: setMode zeroes y for ground modes)
    async tp(x, z, mode = 'DRIVE', y = 0) {
      await ev(`(g.player.setMode('${mode}'), g.player.pos.set(${x}, ${y}, ${z}), g.player.speed = 0, g.player.vy = 0)`);
      await t.wait(0.15);
    },
    // Advance real game-loop frames without paying wall-clock time. Playwright's
    // fake clock drives requestAnimationFrame and timers, so sentinels still
    // exercise main.js wiring instead of bypassing systems with direct calls.
    wait: (s) => page.clock.runFor(s * 1000),
    // wait for N seconds of *physics* time (player.simT = Σ clamped dt)
    async simWait(s) {
      const t0 = await ev('g.player.simT');
      const deadline = Date.now() + Math.max(30000, s * 25000);
      while ((await ev('g.player.simT')) - t0 < s) {
        if (Date.now() > deadline) throw new Error(`simWait(${s}) timed out`);
        await t.wait(0.06);
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
        await t.wait(0.25);
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
        await page.clock.runFor(every);
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
        await page.clock.runFor(dtMs);
      }
      return out;
    },
    // last resort, for genuinely visual judgments only — drawing is off during
    // tests (__skipRender), so let one real frame render first
    async shot(name) {
      mkdirSync(SHOTS, { recursive: true });
      const p = join(SHOTS, `${name}.png`);
      await page.evaluate('window.__skipRender = 0');
      await t.wait(0.06); // one 50ms rAF tick — enough to render exactly one frame
      sink.shots++;
      sink.renderTicks += 1;
      await page.screenshot({ path: p });
      await page.evaluate('window.__skipRender = 1');
      console.log(`     shot: ${p}`);
    },
  };
  return t;
}

// --- main ---
// CLI: [-v] [-j N] [suite…].  -j sets worker concurrency (each worker is its
// OWN chromium instance — separate renderer process, so a suite's synchronous
// in-page loops actually run on their own core; pages sharing one browser can
// land in one renderer and serialise, defeating that).
const raw = process.argv.slice(2).filter((a) => a !== '-v' && a !== '-q');
let jFlag = 0;
const wanted = [];
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === '-j') { jFlag = parseInt(raw[++i], 10) || 0; continue; }
  if (a.startsWith('-j')) { jFlag = parseInt(a.slice(2), 10) || 0; continue; }
  wanted.push(a);
}
const suiteDir = process.env.VERIFY_CHECKS || join(ROOT, 'tools/checks');
const all = (await readdir(suiteDir)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace('.mjs', ''));
const suites = wanted.length ? wanted : all;
const unknown = suites.filter((s) => !all.includes(s));
if (unknown.length) { console.error(`unknown suite(s): ${unknown.join(', ')} — have: ${all.join(', ')}`); process.exit(2); }

// --- single-instance lock ---
// Only one verify.mjs run at a time (parallel runs would contend for cores/
// RAM and produce misleading timings). Lock is a plain file created with the
// 'wx' exclusive-create flag — the create IS the acquisition, no separate
// check-then-write race. VERIFY_LOCK overrides the path (selftest only; the
// production default is this fixed path).
const LOCK_PATH = process.env.VERIFY_LOCK || join(os.homedir(), '.cache/lonestar-verify/lock.json');
const GUARD_PATH = join(dirname(LOCK_PATH), 'lock.reclaim.json');

function probeAlive(pid) {
  try { process.kill(pid, 0); return true; } // succeeded => alive
  catch (e) {
    if (e.code === 'EPERM') return true; // exists, just not ours to signal
    if (e.code === 'ESRCH') return false; // no such process
    throw e;
  }
}

function acquireLock() {
  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  const mine = { pid: process.pid, startedAt: new Date().toISOString(), argv: process.argv.slice(2) };
  for (;;) {
    try {
      writeFileSync(LOCK_PATH, JSON.stringify(mine), { flag: 'wx' });
      return mine;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    // EEXIST: read + parse the existing lock.
    let lock;
    try {
      lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      if (!lock || typeof lock.pid !== 'number' || typeof lock.startedAt !== 'string') throw new Error('bad shape');
    } catch {
      process.stderr.write(`verify: lock file ${LOCK_PATH} is unreadable or malformed — refusing; inspect and remove it manually\n`);
      process.exit(3);
    }
    if (probeAlive(lock.pid)) {
      process.stderr.write(`verify: another run is active (pid ${lock.pid}, started ${lock.startedAt}, argv ${JSON.stringify(lock.argv)}) — refusing; wait or kill it\n`);
      process.exit(3);
    }
    // Dead — reclaim, but only under a guard file so two simultaneous
    // reclaimers can't both unlink/recreate the lock. No automatic guard
    // reclamation, ever: a stuck guard is a manual-intervention case.
    try {
      writeFileSync(GUARD_PATH, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    } catch {
      process.stderr.write(`verify: reclaim guard ${GUARD_PATH} exists — refusing; if no verify is running, remove it manually\n`);
      process.exit(3);
    }
    // Guard held: re-verify the pid is still dead and the lock is still the
    // same one we inspected before touching anything.
    let recheck = null;
    try { recheck = JSON.parse(readFileSync(LOCK_PATH, 'utf8')); } catch { /* vanished or malformed now */ }
    const sameLock = !!recheck && recheck.pid === lock.pid && recheck.startedAt === lock.startedAt;
    const confirmedDead = sameLock && !probeAlive(recheck.pid);
    if (!confirmedDead) {
      // alive now, or the file changed/vanished under us — release the guard
      // and restart the acquire loop conservatively (from the top: wx again).
      try { unlinkSync(GUARD_PATH); } catch { /* best-effort */ }
      continue;
    }
    try { unlinkSync(LOCK_PATH); } catch { /* best-effort */ }
    process.stderr.write(`verify: reclaiming stale lock (pid ${lock.pid} dead, started ${lock.startedAt})\n`);
    try { unlinkSync(GUARD_PATH); } catch { /* best-effort */ }
    // loop back to the wx acquire attempt
  }
}

// Ownership-checked and idempotent: unlinks only files this process itself
// owns, so calling it more than once (finally + a signal handler) is safe.
function releaseLock(mine) {
  try {
    const l = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    if (l && l.pid === mine.pid && l.startedAt === mine.startedAt) unlinkSync(LOCK_PATH);
  } catch { /* missing/malformed — nothing of ours to release */ }
  try {
    const g = JSON.parse(readFileSync(GUARD_PATH, 'utf8'));
    if (g && g.pid === mine.pid) unlinkSync(GUARD_PATH);
  } catch { /* missing/malformed — nothing of ours to release */ }
}

const LOCK = acquireLock();

// Load warning: never gates or changes behavior, just flags a machine that's
// likely to produce flaky boot timeouts under the pool.
{
  const load1 = os.loadavg()[0];
  const cores = os.cpus().length;
  if (load1 > cores) {
    process.stderr.write(`verify: load ${round1(load1)} on ${cores} cores — boot timeouts likely, results may flake; prefer an idle machine\n`);
  }
}

// Release-then-re-raise: the once-handler is already removed by the time this
// runs, so re-signaling falls through to default termination — exit-code
// semantics for SIGINT/SIGTERM are unchanged by having a lock at all.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => { releaseLock(LOCK); process.kill(process.pid, sig); });
}

// Approx per-suite seconds — a SCHEDULING HINT only (longest-processing-time
// packing so the heavy suites start first); wrong values just cost a little
// packing efficiency, never correctness. Keep every suite represented: an
// unlisted long suite falls into the 5-second bucket and can sit behind short
// checks, leaving workers idle near the end of a full run.
const WEIGHTS = {
  ag: 31, aviation: 27, hud: 24, brands: 24, shoulder: 17, lights: 16,
  ferries: 11, shelf: 11, travel: 10, haunts: 10, band: 9, wildlife: 8,
  shop: 8, missions: 7, springer: 6, jetpack: 5, drive: 4, debug: 4,
  padre: 3, rabbits: 3, traffic: 3, npcs: 2, walk: 1,
};
// Machine snapshot — taken once, before the worker-width calculation, so the
// memory cap AND the JSON's start snapshot read the same os.freemem() value.
function machineSnapshot(freememBytes) {
  return {
    ts: new Date().toISOString(),
    cpus: os.cpus().length,
    freememGiB: round1(freememBytes / 2 ** 30),
    loadavg: os.loadavg(),
  };
}
const startFreemem = os.freemem();
const machineStart = machineSnapshot(startFreemem);
// Default concurrency is capped by BOTH cores and free RAM. SwiftShader
// rendering is CPU-heavy: on a 12-core host, 4 workers finish faster than 5+
// because the renderer processes otherwise contend. `-j` remains available
// when a host has different measured characteristics.
const memCap = Math.floor(startFreemem / (0.8 * 2 ** 30));
const DEFAULT_J = Math.min(suites.length, Math.max(2, Math.min(Math.ceil(os.cpus().length / 3), memCap)));
const C = Math.max(1, Math.min(suites.length, jFlag > 0 ? jFlag : DEFAULT_J));

// Everything from the static server through reporting/sidecar/telemetry runs
// under one lock hold — the finally below is the ENTIRE run lifecycle's
// release point (paired with the SIGINT/SIGTERM handlers registered above).
try {
const srv = await serve();
const port = srv.address().port;
const queue = suites.slice().sort((a, b) => (WEIGHTS[b] ?? 5) - (WEIGHTS[a] ?? 5));
const order = queue.slice(); // scheduled queue order, captured before workers drain it — JSON telemetry only

// Every attempt for every suite, chronological (pool casualty, retry,
// solo…) — the single source of truth for both console reporting and the
// JSON sidecar's per-suite attempts array.
const attemptsByName = new Map();
function recordAttempt(name, sink) {
  if (!attemptsByName.has(name)) attemptsByName.set(name, []);
  attemptsByName.get(name).push(sink);
}

// Per suite-attempt: distinct pageerror messages are fatal, deduped by the
// first line of the error string (no allowlist). Counted once the suite body
// finishes — including when it throws — so a pageerror-failed suite routes
// through the normal solo-rerun flake path like any other failure. Skipped
// entirely once the attempt is already flagged an infra casualty (it's being
// discarded and retried, not counted).
function finalizePageErrors(sink) {
  if (sink.infra || !sink.pageErrors.size) return;
  for (const [msg, count] of sink.pageErrors) {
    sink.lines.push(`FAIL pageerror — ${msg}${count > 1 ? ` (×${count})` : ''}`);
    sink.failures.push({ type: 'pageerror', check: null, message: msg, signature: makeSignature('pageerror', null, msg), count });
  }
  sink.failed += sink.pageErrors.size;
}

// Launch one fresh browser + context (a "worker handle"). Used for the pool,
// mid-run relaunches after a browser crash, and solo reruns alike.
async function launchWorker() {
  const tLaunch0 = Date.now();
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const launchS = (Date.now() - tLaunch0) / 1000;
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } }); // small viewport: SwiftShader fill rate limits sim fps
  await ctx.addInitScript(() => { localStorage.clear(); window.__harness = 1; });
  return { browser, ctx, launchS };
}
// One relaunch attempt on top of the first — matches the failure matrix's
// "one relaunch per worker" / "one relaunch for that rerun" rows.
async function launchWorkerWithRetry(label) {
  try { return await launchWorker(); }
  catch (e) {
    if (!QUIET) process.stderr.write(`  ↻ relaunch after worker launch failure${label ? ` (${label})` : ''}: ${String(e.message || e).split('\n')[0]}\n`);
    return await launchWorker(); // let a second failure propagate to the caller
  }
}

// Each suite gets a fresh page and game boot. The worker context stays alive so
// its HTTP cache can reuse the game's static modules and data; its init script
// clears localStorage before game code runs, preserving the prior fresh-context
// isolation for game saves and UI preferences.
//
// Workers never reject: every suite-phase throw is caught here and
// discriminated by browser.isConnected(). Browser alive → a normal suite
// failure (type 'runner', check: null) — boot/settle timeouts, suite import
// errors, and any node-side throw outside t.check() all land here. Browser
// dead → sink.infra is set (by this catch, or by mkCheck when a check body
// touches the dead browser) and the whole attempt is zeroed out below: it's
// a casualty, not a result, and callers requeue/retry rather than count it.
async function runSuite(browser, ctx, name, kind = 'pool', launch) {
  const sink = {
    name, passed: 0, failed: 0, skipped: 0, aborted: false, lines: [], checks: [], ms: 0,
    kind, launch, boot: 0, settle: 0, body: 0, cleanup: 0, total: 0,
    pageErrors: new Map(), failures: [], shots: 0, renderTicks: 0, infra: false, outcome: 'pass',
  };
  const tTotal0 = Date.now();
  let page;
  let phase = 'boot';
  try {
    try {
      await ctx.clearCookies();
      page = await ctx.newPage();
      await page.clock.install();
      // The browser clock's default rAF cadence is 60 Hz. Its tight synchronous
      // callback loop makes that far more CPU-intensive than a headless game
      // frame; the game's physics deliberately clamps at 50 ms, so match that
      // stable simulation cadence instead.
      await page.addInitScript(() => {
        window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 50);
        window.cancelAnimationFrame = (id) => clearTimeout(id);
      });
      page.on('pageerror', (e) => {
        const first = String(e).split('\n')[0];
        sink.lines.push(`     pageerror: ${first}`);
        sink.pageErrors.set(first, (sink.pageErrors.get(first) || 0) + 1);
      });
      const tBoot0 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction('window.__game && document.getElementById("loading").style.display === "none"', null, { timeout: 60000 });
      sink.boot = (Date.now() - tBoot0) / 1000;
      // skip the ~300 ms SwiftShader draw: the loop still runs every system update
      // at full rAF speed, sim time tracks wall time, and evaluates return fast
      await page.evaluate('window.__skipRender = 1');
      phase = 'settle';
      const tSettle0 = Date.now();
      await page.clock.runFor(500); // first frames: chunks spawn, ATMOS settles
      sink.settle = (Date.now() - tSettle0) / 1000;
      phase = 'body';
      const s0 = Date.now();
      try {
        await (await import(join(suiteDir, name + '.mjs'))).default(mkT(page, mkCheck(sink, browser), sink));
      } finally {
        sink.ms = Date.now() - s0;
        sink.body = sink.ms / 1000;
        finalizePageErrors(sink); // fatal pageerrors count even if default() threw
      }
    } catch (e) {
      if (browser && !browser.isConnected()) {
        sink.infra = true;
        sink.lines.push(`     browser crashed mid-suite (${phase} phase)`);
      } else {
        const msg = String((e && e.message) || e).split('\n')[0];
        sink.failed++;
        sink.lines.push(`FAIL runner — ${msg}`);
        sink.failures.push({ type: 'runner', check: null, message: msg, signature: makeSignature('runner', null, msg), count: 1 });
      }
    }
    if (!QUIET) process.stderr.write(`  ✓ ${name} (${(sink.ms / 1000).toFixed(1)}s)\n`); // live progress → stderr, off the stdout report
  } finally {
    const tCleanup0 = Date.now();
    if (page) {
      try { await page.close(); } catch (e) { sink.lines.push(`     page.close ignored: ${String((e && e.message) || e).split('\n')[0]}`); }
    }
    sink.cleanup = (Date.now() - tCleanup0) / 1000;
  }
  sink.total = (Date.now() - tTotal0) / 1000;
  if (sink.infra) {
    // A casualty is discarded, not counted: zero everything so `failed ===
    // failures.length` holds trivially (0 === 0) and no partial signature
    // survives into history.
    sink.outcome = 'infra';
    sink.passed = 0; sink.failed = 0; sink.skipped = 0; sink.failures = [];
  } else {
    sink.outcome = sink.failed > 0 ? 'fail' : 'pass';
  }
  return sink;
}

async function worker() {
  let handle;
  try { handle = await launchWorkerWithRetry(); }
  catch (e) {
    process.stderr.write(`worker could not launch after retry: ${String((e && e.message) || e).split('\n')[0]}\n`);
    return; // pool continues via other workers; this one contributes nothing
  }
  let { browser, ctx, launchS } = handle;
  let first = true; // browser launch time is attributed to this worker's first suite only
  try {
    while (queue.length) {
      const name = queue.shift();
      const sink = await runSuite(browser, ctx, name, 'pool', first ? launchS : undefined);
      first = false;
      recordAttempt(name, sink);
      if (sink.outcome === 'infra') {
        const infraCount = attemptsByName.get(name).filter((a) => a.kind === 'pool' && a.outcome === 'infra').length;
        if (!QUIET) process.stderr.write(`  ↻ relaunch after browser crash: ${name}\n`);
        try { await ctx.close(); } catch { /* dead already */ }
        try { await browser.close(); } catch { /* dead already */ }
        browser = null; ctx = null;
        if (infraCount === 1) queue.push(name); // re-queue once; a 2nd casualty is final
        try {
          const h2 = await launchWorkerWithRetry(`after crash: ${name}`);
          browser = h2.browser; ctx = h2.ctx; launchS = h2.launchS; first = true;
        } catch (e) {
          // this worker can't continue; remaining/requeued suites wait for
          // other workers (post-drain sweep marks them infra if none survive)
          process.stderr.write(`worker relaunch after crash failed: ${String((e && e.message) || e).split('\n')[0]}\n`);
          break;
        }
      }
    }
  } finally {
    if (ctx) { try { await ctx.close(); } catch { /* best-effort */ } }
    if (browser) { try { await browser.close(); } catch { /* best-effort */ } }
  }
}

try {
  await Promise.all(Array.from({ length: C }, () => worker()));

  // If every worker died, some suites never ran at all — mark them infra
  // directly (never leave a suite with no result, no LOG/JSON entry).
  for (const name of queue.splice(0)) {
    recordAttempt(name, {
      name, kind: 'pool', outcome: 'infra', passed: 0, failed: 0, skipped: 0, aborted: false,
      lines: ['     no worker available to run this suite'], checks: [], failures: [],
      shots: 0, renderTicks: 0, boot: 0, settle: 0, body: 0, cleanup: 0, total: 0,
    });
  }

  // --- auto-confirm flakes: solo rerun, one failed suite at a time, nothing
  // co-scheduled (the -j 1 equivalent) — see the header comment for the
  // contract. Runs before the server closes — reruns still need it. Only
  // suites whose LAST pool attempt is a genuine 'fail' (not 'infra') are
  // eligible — an infra casualty is re-queued at the pool level instead.
  const soloEligible = suites.filter((s) => {
    const attempts = (attemptsByName.get(s) || []).filter((a) => a.kind === 'pool');
    const last = attempts[attempts.length - 1];
    return last && last.outcome === 'fail';
  });
  for (const name of soloEligible) {
    if (!QUIET) process.stderr.write(`  ↻ rerun solo: ${name}\n`);
    let attempt = 0;
    let confirmed = false;
    while (attempt < 2 && !confirmed) {
      let browser, ctx, launchS;
      try {
        ({ browser, ctx, launchS } = await launchWorker());
      } catch (e) {
        if (!QUIET) process.stderr.write(`  solo rerun launch failed for ${name}: ${String((e && e.message) || e).split('\n')[0]}\n`);
        attempt++;
        continue;
      }
      let soloSink;
      try {
        soloSink = await runSuite(browser, ctx, name, 'solo', launchS);
      } finally {
        try { await ctx.close(); } catch { /* best-effort */ }
        try { await browser.close(); } catch { /* best-effort */ }
      }
      recordAttempt(name, soloSink);
      if (soloSink.outcome === 'infra') {
        if (!QUIET) process.stderr.write(`  ↻ relaunch after browser crash: ${name} (solo)\n`);
        attempt++;
        continue; // one relaunch for that rerun (2 attempts total)
      }
      confirmed = true;
    }
    // if !confirmed after 2 attempts, the pool FAIL stands unconfirmed — the
    // last recorded solo attempt (outcome 'infra') signals that at report time
  }
} finally {
  srv.close();
}

const machineEnd = machineSnapshot(os.freemem());

// --- flush in canonical suite order, same compact contract as the serial
// runner. The full report is always written to LOG; -q prints only what
// detailLines holds without -v (FAIL detail + FLAKE/INFRA labels) plus the
// final summary. The LAST pool attempt decides the suite's outcome unless a
// solo rerun exists and itself produced a real (non-infra) result.
let passed = 0, failed = 0, skipped = 0, flakes = 0, infraSuites = 0;
const FAIL_CAP = 5; // -q console cap per suite; the LOG always has every line
const report = [];
const wallS = process.uptime();
const statusByName = new Map();
const flakeByName = new Map();

for (const s of suites) {
  const attempts = attemptsByName.get(s) || [];
  const poolAttempts = attempts.filter((a) => a.kind === 'pool');
  const soloAttempts = attempts.filter((a) => a.kind === 'solo');
  const lastPool = poolAttempts[poolAttempts.length - 1];
  const lastSolo = soloAttempts.length ? soloAttempts[soloAttempts.length - 1] : null;
  if (!lastPool) continue; // shouldn't happen — every suite gets at least one recorded attempt

  let eff, detailLines, label, status;
  if (lastPool.outcome === 'infra') {
    eff = lastPool; // zeroed — contributes 0/0/0
    detailLines = poolAttempts.flatMap((a) => a.lines);
    label = `INFRA ${s} — browser crashed mid-suite (attempt not counted, no signatures recorded)`;
    status = 'infra';
    infraSuites++;
  } else if (!lastSolo) {
    eff = lastPool; detailLines = lastPool.lines; label = null;
    status = lastPool.failed === 0 ? 'pass' : 'fail';
  } else if (lastSolo.outcome === 'infra') {
    eff = lastPool; detailLines = lastPool.lines;
    label = `FAIL (unconfirmed — solo rerun lost to browser crash): ${s}`;
    status = 'fail';
  } else if (lastSolo.failed === 0) {
    eff = lastSolo; detailLines = lastPool.lines;
    label = `FLAKE (solo-green): ${s}`;
    status = 'flake';
    flakes++;
  } else {
    eff = lastSolo; detailLines = [...lastPool.lines, ...lastSolo.lines];
    label = `FAIL (confirmed on rerun): ${s}`;
    status = 'fail';
  }
  statusByName.set(s, status);
  flakeByName.set(s, status === 'flake');
  passed += eff.passed; failed += eff.failed; skipped += eff.skipped;

  if (VERBOSE) report.push(`— ${s}`);
  report.push(...detailLines);
  if (label) report.push(label);
  if (status !== 'infra') {
    report.push(`${s}: ${eff.passed} passed${eff.failed ? `, ${eff.failed} FAILED` : ''}${eff.skipped ? `, ${eff.skipped} not run` : ''}, ${(eff.ms / 1000).toFixed(1)}s`);
  }
  if (QUIET) {
    for (const line of detailLines.slice(0, FAIL_CAP)) console.log(line);
    if (detailLines.length > FAIL_CAP) console.log(`     … +${detailLines.length - FAIL_CAP} more lines in this suite (full report: ${LOG})`);
    if (label) console.log(label);
  }
}

const summary = `${passed} passed, ${failed} failed${skipped ? `, ${skipped} not run` : ''}${flakes ? `, ${flakes} flakes (solo-green; exit-zero is temporary policy)` : ''}${infraSuites ? `, ${infraSuites} infra (browser casualty, not verified)` : ''} (${suites.join(', ')})  [j=${C}, ${wallS.toFixed(0)}s wall]`;
report.push(summary);

const exitCode = failed ? 1 : (infraSuites ? 3 : 0);

function warnTelemetry(path, e) {
  process.stderr.write(`verify: telemetry write failed (${path}): ${String((e && e.message) || e)}\n`);
}

try { writeFileSync(LOG, report.join('\n') + '\n'); } catch (e) { warnTelemetry(LOG, e); }

// JSON sidecar — every run, best-effort, never fails the run over a write
// error (loud stderr warning instead). Per-attempt boot/settle/body/cleanup/
// total/launch timings + per-check {name, ms, status} + structured failures
// (console output contract is unchanged by this — durations still print only
// under -v / when ≥1s).
function attemptJSON(sink) {
  const o = {
    kind: sink.kind, outcome: sink.outcome,
    boot: round1(sink.boot), settle: round1(sink.settle), body: round1(sink.body),
    cleanup: round1(sink.cleanup), total: round1(sink.total),
    passed: sink.passed, failed: sink.failed, skipped: sink.skipped, aborted: sink.aborted,
    shots: sink.shots, renderTicks: sink.renderTicks,
    checks: sink.checks, failures: sink.failures,
  };
  if (sink.launch !== undefined) o.launch = round1(sink.launch);
  return o;
}

let totalShots = 0, totalRenderTicks = 0;
for (const atts of attemptsByName.values()) for (const a of atts) { totalShots += a.shots; totalRenderTicks += a.renderTicks; }

const VERIFY_JSON = process.env.VERIFY_JSON || '/tmp/lonestar-verify.json';
const jsonReport = {
  schema: 2,
  date: new Date().toISOString(),
  argv: process.argv.slice(2),
  j: { requested: jFlag || null, effective: C },
  machine: { start: machineStart, end: machineEnd },
  order,
  wall: round1(wallS),
  exit: exitCode,
  totals: { passed, failed, skipped, flakes, infra: infraSuites, shots: totalShots, renderTicks: totalRenderTicks },
  policy: { soloGreenExitZero: 'temporary' },
  suites: suites.map((s) => ({
    name: s,
    status: statusByName.get(s) || 'infra',
    flake: flakeByName.get(s) || false,
    attempts: (attemptsByName.get(s) || []).map(attemptJSON),
  })),
};

// history: one compact file per run, reboot-durable, pruned on write.
const HISTORY_DIR = process.env.VERIFY_HISTORY_DIR || join(os.homedir(), '.cache/lonestar-verify/history');
const HISTORY_DAYS = parseInt(process.env.VERIFY_HISTORY_DAYS, 10) || 180;
const HISTORY_KEEP = parseInt(process.env.VERIFY_HISTORY_KEEP, 10) || 100;
function historyStamp(d) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}
function pruneHistory(dir, days, keep) {
  let entries;
  try { entries = readdirSync(dir); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  const matching = entries.filter((f) => /^\d{8}T\d{6}Z-\d+\.json$/.test(f)).sort(); // fixed-width names sort chronologically
  const newest = new Set(matching.slice(-keep));
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  for (const f of matching) {
    if (newest.has(f)) continue;
    const m = f.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/);
    if (!m) continue;
    const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
    if (Number.isFinite(ts) && ts < cutoff) {
      try { unlinkSync(join(dir, f)); } catch (e) { if (e.code !== 'ENOENT') throw e; } // tolerate concurrent runs
    }
  }
}
let historyPath = null;
try {
  mkdirSync(HISTORY_DIR, { recursive: true });
  historyPath = join(HISTORY_DIR, `${historyStamp(new Date())}-${process.pid}.json`);
  writeFileSync(historyPath, JSON.stringify(jsonReport));
  pruneHistory(HISTORY_DIR, HISTORY_DAYS, HISTORY_KEEP);
} catch (e) { warnTelemetry(historyPath || HISTORY_DIR, e); }

// latest-run pointer: atomic write (temp file + rename), pretty-printed.
try {
  const tmpPath = `${VERIFY_JSON}.tmp-${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(jsonReport, null, 2));
  renameSync(tmpPath, VERIFY_JSON);
} catch (e) { warnTelemetry(VERIFY_JSON, e); }

if (QUIET) console.log(summary);
else for (const line of report) console.log(line);
process.exitCode = exitCode; // not process.exit — let this finally (and the natural exit) run
} finally {
  releaseLock(LOCK);
}
