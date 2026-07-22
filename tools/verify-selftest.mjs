// Runner self-test — validates tools/verify.mjs itself against three minimal
// fixture suites (tools/checks-fixtures/): green (always passes), assertfail
// (deterministic check FAIL), pagethrow (deterministic page-side throw, must
// fail via the synthetic "FAIL pageerror" line). Run on demand, and always
// after changing verify.mjs's runner internals (sink/report/JSON shape).
//
// The child's flake auto-confirm will solo-rerun the two failing fixtures and
// confirm them on rerun — that's ~5 boots (3 pool + 2 solo), ~35-40s wall,
// expected and not a bug.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(os.tmpdir(), 'lonestar-verify-selftest-'));
const LOG = join(tmp, 'verify.log');
const JSONP = join(tmp, 'verify.json');

const results = [];
function assert(name, cond) { results.push({ name, pass: !!cond }); }

// --- run 1: the three fixtures, VERIFY_CHECKS pointed at checks-fixtures ---
const res = spawnSync('node', ['tools/verify.mjs', '-q', 'green', 'assertfail', 'pagethrow'], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 180000,
  env: {
    ...process.env,
    VERIFY_CHECKS: join(ROOT, 'tools/checks-fixtures'),
    VERIFY_LOG: LOG,
    VERIFY_JSON: JSONP,
  },
});

assert('exit code 1', res.status === 1);
assert('stdout has FAIL pageerror — Error: selftest-pageerror',
  res.stdout.includes('FAIL pageerror — Error: selftest-pageerror'));
assert('stdout has FAIL (confirmed on rerun): assertfail',
  res.stdout.includes('FAIL (confirmed on rerun): assertfail'));
assert('stdout has FAIL (confirmed on rerun): pagethrow',
  res.stdout.includes('FAIL (confirmed on rerun): pagethrow'));

const summaryLine = res.stdout.trim().split('\n').pop() || '';
const summaryRe = /^\d+ passed, \d+ failed(, \d+ not run)? \(green, assertfail, pagethrow\)  \[j=\d+, \d+s wall\]$/;
assert(`summary line matches format (0 flakes clause omitted): "${summaryLine}"`, summaryRe.test(summaryLine));

let json = null;
try { json = JSON.parse(readFileSync(JSONP, 'utf8')); } catch (e) { json = null; results.push({ name: `JSON sidecar parses (${e.message})`, pass: false }); }
if (json) {
  assert('JSON has machine block', !!json.machine && typeof json.machine.cpus === 'number');
  assert('JSON has all 3 suites', Array.isArray(json.suites) && json.suites.length === 3);
  for (const name of ['assertfail', 'pagethrow']) {
    const s = json.suites?.find((x) => x.name === name);
    const ok = !!s && Array.isArray(s.attempts) && s.attempts.length === 2
      && s.attempts.every((a) => a.boot > 0 && a.body > 0 && a.total > 0);
    assert(`JSON ${name} has 2 attempts with boot/body/total > 0`, ok);
  }
}

// --- run 2: unknown suite still errors cleanly on the DEFAULT suite dir ---
const res2 = spawnSync('node', ['tools/verify.mjs', 'bogus-suite-does-not-exist'], {
  cwd: ROOT, encoding: 'utf8', timeout: 20000,
});
assert('unknown suite: exit code 2', res2.status === 2);
assert('unknown suite: stderr names it', res2.stderr.includes('unknown suite'));

// --- report ---
let failCount = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}`);
  if (!r.pass) failCount++;
}
if (failCount) {
  console.log(`\n${failCount}/${results.length} assertions failed. Child stdout/stderr follow for context.`);
  console.log('--- child stdout ---\n' + res.stdout);
  console.log('--- child stderr ---\n' + res.stderr);
}
process.exit(failCount ? 1 : 0);
