const test = require('node:test');
const assert = require('node:assert/strict');
const { isForwardedMessage } = require('../src/Commands/Admin/antiforward');
const vv = require('../src/Commands/Converter/view-once');

test('AntiForward detects forwarding metadata in every message container', () => {
  assert.equal(isForwardedMessage({ raw: { extendedTextMessage: { contextInfo: { isForwarded: true } } } }), true);
  assert.equal(isForwardedMessage({ msg: { contextInfo: { forwardingScore: 2 } } }), true);
  assert.equal(isForwardedMessage({ message: { conversation: 'ordinary text' } }), false);
});

test('view-once module exposes the automatic forwarding hook', () => {
  assert.equal(typeof vv.handleAutoVV, 'function');
  assert.ok(vv.alias.includes('autovv'));
});

test('wallpaper command loads without an undefined prefix reference', () => {
  const wallpaper = require('../src/Commands/Search/wp');
  assert.equal(wallpaper.usage, '.wallpaper <query>');
});
