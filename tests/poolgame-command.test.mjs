import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const command = require('../src/Commands/Owner/poolgame.js');

test('poolgame is owner-only and launches the compact Pocket Relay route', async () => {
  const calls = [];
  const sock = {
    sendMessage: async (...args) => calls.push(['sendMessage', ...args]),
    sendRichWebview: async (...args) => calls.push(['sendRichWebview', ...args])
  };
  const message = { chat: '123@s.whatsapp.net', key: { id: 'pool-test' } };
  const replies = [];

  await command.execute(sock, message, { reply: async (text) => replies.push(text) });

  assert.equal(command.owner, true);
  assert.equal(replies.length, 0);
  const webview = calls.find(([name]) => name === 'sendRichWebview');
  assert.ok(webview);
  assert.equal(webview[1], message.chat);
  assert.match(webview[2].url, /\/pool$/);
  assert.equal(webview[2].useWebview, true);
  assert.equal(webview[2].buttonText, 'Open Pool Game');
  assert.equal(webview[2].toast, 'Opening Pocket Relay…');
  assert.deepEqual(webview[3], { quoted: message });
});

test('poolgame reports a missing WebView helper without throwing', async () => {
  const replies = [];
  const sock = { sendMessage: async () => {} };
  const message = { chat: '123@s.whatsapp.net', key: { id: 'pool-test' } };

  await command.execute(sock, message, { reply: async (text) => replies.push(text) });

  assert.match(replies[0], /sendRichWebview is unavailable/);
});
