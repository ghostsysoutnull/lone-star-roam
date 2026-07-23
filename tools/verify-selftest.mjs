// Runner self-test — validates tools/verify.mjs's own runner internals
// against fixture suites in tools/checks-fixtures/ via VERIFY_CHECKS:
// near-guard, fatal-pageerror handling, pool/solo attempt preservation,
// summary/JSON shape, the infra failure matrix (workers never reject,
// browser-crash casualties get their own status), durable history, and
// shot instrumentation. Six child `verify.mjs` runs (A–F), ~18 boots total,
// ~2.5–3 min wall — expected, not a bug. Run on demand, and always after
// changing verify.mjs's runner internals (sink/report/JSON/history shape).
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tools/checks-fixtures');
const tmp = mkdtempSync(join(os.tmpdir(), 'lonestar-verify-selftest-'));

const results = [];
function assert(name, cond) { results.push({ name, pass: !!cond }); }

function run(args, envExtra, timeout = 180000) {
  return spawnSync('node', ['tools/verify.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, VERIFY_CHECKS: FIXTURES, ...envExtra },
  });
}

function parseJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

const childOutputs = []; // kept for the failure-context dump at the end
function keep(label, res) { childOutputs.push({ label, res }); return res; }

// --- run A: green, assertfail, pagethrow, nearnan -> exit 1 ---
const historyAB = join(tmp, 'history-ab');
const logA = join(tmp, 'a.log'), jsonA = join(tmp, 'a.json');
const resA = keep('A', run(['-q', 'green', 'assertfail', 'pagethrow', 'nearnan'], {
  VERIFY_LOG: logA, VERIFY_JSON: jsonA, VERIFY_HISTORY_DIR: historyAB,
}));

assert('A: exit code 1', resA.status === 1);
assert('A: stdout has FAIL pageerror — Error: selftest-pageerror',
  resA.stdout.includes('FAIL pageerror — Error: selftest-pageerror'));
assert('A: stdout has FAIL (confirmed on rerun): assertfail',
  resA.stdout.includes('FAIL (confirmed on rerun): assertfail'));
assert('A: stdout has FAIL (confirmed on rerun): pagethrow',
  resA.stdout.includes('FAIL (confirmed on rerun): pagethrow'));
assert('A: stdout has FAIL (confirmed on rerun): nearnan',
  resA.stdout.includes('FAIL (confirmed on rerun): nearnan'));
assert('A: stdout has the non-finite diagnostic', /non-finite/.test(resA.stdout));

const jsonAParsed = parseJSON(jsonA);
assert('A: JSON sidecar parses', !!jsonAParsed);
if (jsonAParsed) {
  assert('A: schema === 2', jsonAParsed.schema === 2);
  assert('A: machine.start and machine.end present',
    !!jsonAParsed.machine?.start && !!jsonAParsed.machine?.end);
  assert('A: machine start.ts <= end.ts',
    !!jsonAParsed.machine && Date.parse(jsonAParsed.machine.start.ts) <= Date.parse(jsonAParsed.machine.end.ts));
  assert('A: has all 4 suites', Array.isArray(jsonAParsed.suites) && jsonAParsed.suites.length === 4);

  for (const name of ['assertfail', 'pagethrow', 'nearnan']) {
    const s = jsonAParsed.suites?.find((x) => x.name === name);
    const ok = !!s && Array.isArray(s.attempts) && s.attempts.length === 2
      && s.attempts.every((a) => a.boot > 0 && a.body > 0 && a.total > 0);
    assert(`A: ${name} has 2 attempts with boot/body/total > 0`, ok);
  }

  const nearnanSuite = jsonAParsed.suites?.find((s) => s.name === 'nearnan');
  assert('A: nearnan has the non-finite diagnostic on both attempts',
    !!nearnanSuite && nearnanSuite.attempts.every((a) => a.failures.some((f) => /non-finite/.test(f.message))));

  const assertfailSuite = jsonAParsed.suites?.find((s) => s.name === 'assertfail');
  assert('A: assertfail has an assertion-type failure with its check name',
    !!assertfailSuite && assertfailSuite.attempts.every((a) => a.failures.some((f) => f.type === 'assertion' && !!f.check)));

  const pagethrowSuite = jsonAParsed.suites?.find((s) => s.name === 'pagethrow');
  assert('A: pagethrow has a pageerror-type failure with a signature',
    !!pagethrowSuite && pagethrowSuite.attempts.every((a) => a.failures.some((f) => f.type === 'pageerror' && !!f.signature)));

  let reconciles = true;
  for (const s of jsonAParsed.suites || []) for (const a of s.attempts) if (a.failed !== a.failures.length) reconciles = false;
  assert('A: every attempt reconciles failed === failures.length', reconciles);
}

// --- run B: flakyonce, shotfix -> exit 0 ---
const markerFlaky = join(tmp, 'flakyonce-marker');
const shotsDirB = join(tmp, 'shots-b');
const logB = join(tmp, 'b.log'), jsonB = join(tmp, 'b.json');
const resB = keep('B', run(['-q', 'flakyonce', 'shotfix'], {
  VERIFY_LOG: logB, VERIFY_JSON: jsonB, VERIFY_HISTORY_DIR: historyAB,
  SELFTEST_FLAKYONCE_MARKER: markerFlaky, VERIFY_SHOTS: shotsDirB,
}));

assert('B: exit code 0', resB.status === 0);
assert('B: summary has the flake clause', /\d+ flakes \(solo-green/.test(resB.stdout));

const jsonBParsed = parseJSON(jsonB);
assert('B: JSON sidecar parses', !!jsonBParsed);
if (jsonBParsed) {
  assert('B: totals.flakes === 1', jsonBParsed.totals.flakes === 1);
  const flakySuite = jsonBParsed.suites.find((s) => s.name === 'flakyonce');
  assert('B: flakyonce suite.flake === true', !!flakySuite?.flake);
  assert('B: flakyonce has 2 attempts (pool + solo)', flakySuite?.attempts.length === 2);
  const poolAttempt = flakySuite?.attempts[0];
  assert('B: flakyonce pool attempt still has its failure signature after solo-green',
    poolAttempt?.failures.length === 1 && !!poolAttempt.failures[0].signature);
  assert('B: flakyonce attempts report zero shots',
    !!flakySuite && flakySuite.attempts.every((a) => a.shots === 0));

  const shotSuite = jsonBParsed.suites.find((s) => s.name === 'shotfix');
  assert('B: shotfix attempt has shots === 1', shotSuite?.attempts[0]?.shots === 1);
  assert('B: shotfix attempt has renderTicks >= 1', shotSuite?.attempts[0]?.renderTicks >= 1);
}

// --- run C: importfail, green -> exit 1 (pool must not die) ---
const historyC = join(tmp, 'history-c');
const logC = join(tmp, 'c.log'), jsonC = join(tmp, 'c.json');
const resC = keep('C', run(['-q', 'importfail', 'green'], {
  VERIFY_LOG: logC, VERIFY_JSON: jsonC, VERIFY_HISTORY_DIR: historyC,
}));

assert('C: exit code 1', resC.status === 1);
const jsonCParsed = parseJSON(jsonC);
assert('C: JSON sidecar parses (pool did not die)', !!jsonCParsed);
if (jsonCParsed) {
  const importfailSuite = jsonCParsed.suites.find((s) => s.name === 'importfail');
  assert('C: importfail has a runner-type failure',
    !!importfailSuite && importfailSuite.attempts.some((a) => a.failures.some((f) => f.type === 'runner')));
  const greenSuite = jsonCParsed.suites.find((s) => s.name === 'green');
  assert('C: green still reports normally', greenSuite?.status === 'pass');
}
assert('C: LOG file written', existsSync(logC));
let historyFilesC = [];
try { historyFilesC = readdirSync(historyC); } catch { /* none */ }
assert('C: a history file was written', historyFilesC.some((f) => /^\d{8}T\d{6}Z-\d+\.json$/.test(f)));

// --- run D: crashonce, green -> exit 0 ---
const markerCrashonce = join(tmp, 'crashonce-marker');
const historyD = join(tmp, 'history-d');
const logD = join(tmp, 'd.log'), jsonD = join(tmp, 'd.json');
const resD = keep('D', run(['-q', 'crashonce', 'green'], {
  VERIFY_LOG: logD, VERIFY_JSON: jsonD, VERIFY_HISTORY_DIR: historyD,
  SELFTEST_CRASHONCE_MARKER: markerCrashonce,
}));

assert('D: exit code 0', resD.status === 0);
const jsonDParsed = parseJSON(jsonD);
assert('D: JSON sidecar parses', !!jsonDParsed);
if (jsonDParsed) {
  const crashSuite = jsonDParsed.suites.find((s) => s.name === 'crashonce');
  assert('D: crashonce first attempt is outcome infra with empty failures',
    crashSuite?.attempts[0]?.outcome === 'infra' && crashSuite.attempts[0].failures.length === 0);
  assert('D: crashonce has a later passing attempt',
    !!crashSuite && crashSuite.attempts.some((a) => a.outcome === 'pass'));
  assert('D: crashonce suite status is pass', crashSuite?.status === 'pass');
  const greenSuite = jsonDParsed.suites.find((s) => s.name === 'green');
  assert('D: green unaffected', greenSuite?.status === 'pass');
}

// --- run E: crashalways -> exit 3; invalid VERIFY_JSON path ---
const historyE = join(tmp, 'history-e');
const logE = join(tmp, 'e.log');
const invalidJsonE = join(tmp, 'no-such-dir-xyz', 'verify.json'); // parent never created
const resE = keep('E', run(['-q', 'crashalways'], {
  VERIFY_LOG: logE, VERIFY_JSON: invalidJsonE, VERIFY_HISTORY_DIR: historyE,
}));

assert('E: exit code 3', resE.status === 3);
assert('E: summary has the infra clause', /infra \(browser casualty, not verified\)/.test(resE.stdout));
assert('E: stderr has the telemetry write warning', /verify: telemetry write failed/.test(resE.stderr));

// --- run F: unknown suite -> exit 2 (unchanged) ---
const resF = keep('F', spawnSync('node', ['tools/verify.mjs', 'bogus-suite-does-not-exist'], {
  cwd: ROOT, encoding: 'utf8', timeout: 20000,
}));
assert('F: unknown suite exit code 2', resF.status === 2);
assert('F: stderr names it', resF.stderr.includes('unknown suite'));

// --- history assertions across A + B ---
let historyFilesAB = [];
try { historyFilesAB = readdirSync(historyAB).filter((f) => /^\d{8}T\d{6}Z-\d+\.json$/.test(f)); } catch { /* none */ }
assert('A+B: two distinct history files exist', historyFilesAB.length === 2);
const parsedHistoryAB = historyFilesAB.map((f) => ({ f, h: parseJSON(join(historyAB, f)) })).filter((x) => x.h);
assert('A+B: both history files parse', parsedHistoryAB.length === 2);
assert('A+B: each holds its own date + argv',
  parsedHistoryAB.every((x) => !!x.h.date && Array.isArray(x.h.argv)));
assert('A+B: history files are compact JSON (no pretty indent)',
  historyFilesAB.every((f) => !readFileSync(join(historyAB, f), 'utf8').includes('\n')));
const aHistory = parsedHistoryAB.find((x) => x.h.argv?.includes('nearnan'));
const bHistory = parsedHistoryAB.find((x) => x.h.argv?.includes('flakyonce'));
assert('A+B: one history file holds run A content', !!aHistory);
assert('A+B: one history file holds run B content', !!bHistory);
assert('A+B: the latest pointer (VERIFY_JSON of run B) holds run B content',
  !!bHistory && !!jsonBParsed && JSON.stringify(bHistory.h.totals) === JSON.stringify(jsonBParsed.totals));

// --- report ---
let failCount = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}`);
  if (!r.pass) failCount++;
}
if (failCount) {
  console.log(`\n${failCount}/${results.length} assertions failed. Failing runs' child stdout/stderr follow.`);
  for (const { label, res } of childOutputs) {
    console.log(`--- run ${label} stdout ---\n${res.stdout}`);
    console.log(`--- run ${label} stderr ---\n${res.stderr}`);
  }
}
process.exit(failCount ? 1 : 0);
