import assert from 'node:assert/strict';
import test from 'node:test';
import { source, unique } from './helpers.mjs';

function namesInTable(text, declaration) {
  const block = text.match(new RegExp(`export const ${declaration} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(block, `${declaration} table not found`);
  return [...block[1].matchAll(/name: '([^']+)'/g)].map(([, name]) => name);
}

test('collectible tables retain their documented totals and unique labels', async () => {
  const gameplay = await source('gameplay.js');
  const landmarks = namesInTable(gameplay, 'LANDMARKS');
  assert.equal(landmarks.length, 38, 'landmark count');
  unique(landmarks, 'landmark names');

  const animals = await source('animals.js');
  const species = [...animals.matchAll(/^\s{2}([a-z]+): \{ name:/gm)].map(([, key]) => key);
  assert.equal(species.length, 29, 'species count');
  unique(species, 'species IDs');

  const haunts = await source('haunts.js');
  const legends = [...haunts.matchAll(/^\s{2}([a-z]+): \{ name:/gm)].map(([, key]) => key);
  assert.equal(legends.length, 3, 'legend count');
  unique(legends, 'legend IDs');
});

test('save initialization preserves every additive progress table', async () => {
  const gameplay = await source('gameplay.js');
  const expected = ['species', 'stats', 'counties', 'ufo', 'bank', 'jobsDone', 'job', 'gear', 'legends', 'airports', 'passport'];
  for (const key of expected)
    assert.match(gameplay, new RegExp(`\\bsave\\.${key.replace('.', '\\.')} \\?\\?=`), `save.${key} default`);
  assert.match(gameplay, /"cities":\[\],"landmarks":\[\],"roses":\[\]/, 'base save tables');
});
