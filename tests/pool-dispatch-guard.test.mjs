import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/Plugin/crysMsg.js', import.meta.url), 'utf8');

test('pooltable uses the ordinary command registry path', () => {
  const prefixParser = source.indexOf('// ── PREFIX HANDLING');
  const registryLookup = source.indexOf('const cmd = getCommand(cmdName);');

  assert.ok(prefixParser >= 0, 'generic prefix parser is missing');
  assert.ok(registryLookup > prefixParser, 'command registry lookup must follow prefix parsing');
  assert.equal(source.includes('const nativePoolMatch'), false, 'pooltable must not have a special central parser guard');
  assert.equal(source.includes('nativePoolOwner'), false, 'pooltable must use the standard owner check');
  assert.match(source, /if \(!body\.startsWith\(prefix\)\) return;/);
  assert.match(source, /if \(!cmd\) return;/);
});

test('pooltable command declares owner-only access', () => {
  const poolcard = readFileSync(new URL('../src/Commands/Owner/poolcard.js', import.meta.url), 'utf8');
  assert.match(poolcard, /name: 'pooltable'/);
  assert.match(poolcard, /ownerOnly: true/);
});
