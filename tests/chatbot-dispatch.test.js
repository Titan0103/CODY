const assert = require('node:assert/strict');
const test = require('node:test');

const { handleChatbotCompatibility } = require('../src/Commands/AI/chatbot-compat.js');

test('legacy chatbot remains reachable when its toggle is enabled and PLOGME is off', async () => {
    const calls = [];
    const legacy = {
        isEnabled: chat => chat === '12345@s.whatsapp.net',
        handleIncomingMessage: async (sock, message, store) => {
            calls.push({ sock, message, store });
            return true;
        }
    };
    const active = { isEnabled: () => false };
    const sock = {};
    const message = { chat: '12345@s.whatsapp.net', message: { conversation: 'hello' } };
    const store = {};

    const handled = await handleChatbotCompatibility(sock, message, store, { legacy, active });

    assert.equal(handled, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, message);
});

test('legacy chatbot does not double-reply when PLOGME is enabled', async () => {
    let legacyCalls = 0;
    const legacy = {
        isEnabled: () => true,
        handleIncomingMessage: async () => { legacyCalls += 1; return true; }
    };
    const active = { isEnabled: () => true };

    const handled = await handleChatbotCompatibility({}, { chat: '12345@s.whatsapp.net' }, {}, { legacy, active });

    assert.equal(handled, false);
    assert.equal(legacyCalls, 0);
});
