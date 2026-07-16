// Fast Node-only contract checks. Browser integration remains tools/verify.mjs.
//
//   node tools/test.mjs          # every group
//   node tools/test.mjs data     # one group
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UNIT = join(ROOT, 'tools/unit');
const all = (await readdir(UNIT))
  .filter((file) => file.endsWith('.test.mjs'))
  .map((file) => file.replace('.test.mjs', ''))
  .sort();
const wanted = process.argv.slice(2);
const groups = wanted.length ? wanted : all;
const unknown = groups.filter((group) => !all.includes(group));

if (unknown.length) {
  console.error(`unknown test group(s): ${unknown.join(', ')} — have: ${all.join(', ')}`);
  process.exit(2);
}

let failed = 0;
for (const group of groups) {
  const result = spawnSync(process.execPath, ['--test', join(UNIT, `${group}.test.mjs`)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) failed++;
}

console.log(`${groups.length - failed}/${groups.length} fast test groups passed (${groups.join(', ')})`);
process.exit(failed ? 1 : 0);
