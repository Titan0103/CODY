import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/Plugin/crysMsg.js', import.meta.url), 'utf8');

test('crysMsg has an explicit native pool dispatch guard before generic prefix parsing', () => {
  const guard = source.indexOf('const nativePoolMatch');
  const prefixParser = source.indexOf('// ── PREFIX HANDLING');
  assert.ok(guard >= 0, 'native pool guard is missing');
  assert.ok(prefixParser >= 0, 'generic prefix parser is missing');
  assert.ok(guard < prefixParser, 'pool guard must run before generic prefix parsing');
  assert.match(source, /\^\[\/.\]\(pooltable\|poolcard\|nativepool\|poolrich\)/);
  assert.match(source, /getCommand\('pooltable'\)/);
});

test('pooltable command declares owner-only access', () => {
  const poolcard = readFileSync(new URL('../src/Commands/Owner/poolcard.js', import.meta.url), 'utf8');
  assert.match(poolcard, /name: 'pooltable'/);
  assert.match(poolcard, /ownerOnly: true/);
});
