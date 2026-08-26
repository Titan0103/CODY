import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { addCommand, clearRegistry, getCommand } = require('../src/Plugin/crysCmd.js');
const poolgame = require('../src/Commands/Owner/poolgame.js');
const poolcard = require('../src/Commands/Owner/poolcard.js');
const eightBall = require('../src/Commands/Games/8ball.js');

test('pool command names do not collide with old WebView or 8ball commands', () => {
  clearRegistry();
  addCommand(eightBall);
  addCommand(poolgame);
  addCommand(poolcard);

  assert.equal(getCommand('poolgame'), poolgame);
  assert.equal(getCommand('pool'), poolgame);
  assert.equal(getCommand('nativepool'), poolcard);
  assert.equal(getCommand('pooltable'), poolcard);
  assert.equal(getCommand('8ball'), eightBall);
  clearRegistry();
});
