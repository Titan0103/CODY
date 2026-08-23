const test = require('node:test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { isForwardedMessage } = require('../src/Commands/Admin/antiforward');
const antilink = require('../src/Commands/Admin/antilink');
const vv = require('../src/Commands/Converter/view-once');

test('AFK marker guard does not discard incoming marked messages', () => {
  const dispatcher = fs.readFileSync(require.resolve('../?.js'), 'utf8');
  assert.match(dispatcher, /m\.key\?\.fromMe\s*&&\s*m\.body\s*&&\s*m\.body\.includes\(AFK_MARKER\)/);
});

test('AntiForward detects forwarding metadata in every message container', () => {
  assert.equal(isForwardedMessage({ raw: { extendedTextMessage: { contextInfo: { isForwarded: true } } } }), true);
  assert.equal(isForwardedMessage({ msg: { contextInfo: { forwardingScore: 2 } } }), true);
  assert.equal(isForwardedMessage({ message: { conversation: 'ordinary text' } }), false);
});

test('AntiLink detects and extracts TikTok short links from nested message text', () => {
  const message = { extendedTextMessage: { text: 'https://vt.tiktok.com/ZSVAh671Y/' } };
  const text = antilink.getMessageText(message).join(' ');
  assert.equal(antilink.hasLink(text), true);
  assert.deepEqual(antilink.extractUrls(text), ['https://vt.tiktok.com/ZSVAh671Y/']);
});

test('view-once module exposes the automatic forwarding hook', () => {
  assert.equal(typeof vv.handleAutoVV, 'function');
  assert.ok(vv.alias.includes('autovv'));
});

test('wallpaper command loads without an undefined prefix reference', () => {
  const wallpaper = require('../src/Commands/Search/WP');
  assert.equal(wallpaper.usage, '.wallpaper <query>');
});
