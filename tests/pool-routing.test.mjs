import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { addCommand, clearRegistry, getCommand } = require('../src/Plugin/crysCmd.js');
const poolcard = require('../src/Commands/Owner/poolcard.js');
const eightBall = require('../src/Commands/Games/8ball.js');

test('pooltable is the canonical native card command and old poolgame is absent', () => {
  clearRegistry();
  addCommand(eightBall);
  addCommand(poolcard);

  assert.equal(getCommand('pooltable'), poolcard);
  assert.equal(getCommand('poolcard'), poolcard);
  assert.equal(getCommand('nativepool'), poolcard);
  assert.equal(getCommand('poolrich'), poolcard);
  assert.equal(getCommand('poolgame'), undefined);
  assert.equal(getCommand('8ball'), eightBall);
  clearRegistry();
});
