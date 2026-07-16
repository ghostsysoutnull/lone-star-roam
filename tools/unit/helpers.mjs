import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function json(name) {
  return JSON.parse(await readFile(join(ROOT, 'data', name), 'utf8'));
}

export async function source(name) {
  return readFile(join(ROOT, 'src', name), 'utf8');
}

export function finite(value, label) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite; got ${value}`);
}

export function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}
