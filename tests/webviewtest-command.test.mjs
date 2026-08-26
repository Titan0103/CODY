import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const command = require('../src/Commands/Owner/webviewtest.js');

test('webviewtest is owner-only and uses the temporary local Mini App URL', async () => {
  const calls = [];
  const sock = {
    sendMessage: async (...args) => calls.push(['sendMessage', ...args]),
    sendRichWebview: async (...args) => calls.push(['sendRichWebview', ...args])
  };
  const message = { chat: '123@s.whatsapp.net', key: { id: 'abc' } };
  const replies = [];

  await command.execute(sock, message, { reply: async (text) => replies.push(text) });

  assert.equal(command.owner, true);
  assert.equal(replies.length, 0);
  const webview = calls.find(([name]) => name === 'sendRichWebview');
  assert.ok(webview);
  assert.equal(webview[1], message.chat);
  assert.equal(webview[2].url, command.LOCAL_MINI_APP_URL);
  assert.equal(webview[2].useWebview, true);
  assert.equal(webview[2].buttonText, 'Open Signal Arcade');
  assert.equal(webview[2].toast, 'Opening Signal Arcade…');
  assert.deepEqual(webview[3], { quoted: message });
});

test('webviewtest reports unavailable helper without throwing', async () => {
  const reactions = [];
  const replies = [];
  const sock = { sendMessage: async (...args) => reactions.push(args) };
  const message = { chat: '123@s.whatsapp.net', key: { id: 'abc' } };

  await command.execute(sock, message, { reply: async (text) => replies.push(text) });

  assert.match(replies[0], /sendRichWebview is unavailable/);
  assert.equal(reactions.at(-1)[1].react.text, '❔');
});
