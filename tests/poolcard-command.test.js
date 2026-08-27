const assert = require('node:assert/strict');
const test = require('node:test');

const poolcard = require('../src/Commands/Owner/poolcard.js');

test('pooltable sends a composed visual card with native controls', async () => {
    const calls = [];
    const previousFetch = global.fetch;
    global.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const sock = {
        sendMessage: async (jid, payload) => {
            calls.push({ type: 'send', jid, payload });
            return { key: { id: 'pool-1' } };
        }
    };

    await poolcard.execute(sock, { chat: '123@g.us' }, { args: [], reply: async () => {} });

    assert.equal(calls.length, 1);
    assert.ok(Buffer.isBuffer(calls[0].payload.image));
    assert.match(calls[0].payload.caption, /POCKET RELAY/);
    assert.match(calls[0].payload.caption, /CREDITS/);
    assert.deepEqual(calls[0].payload.nativeFlow.map(button => button.id), [
        'poolcard:bet', 'poolcard:shoot', 'poolcard:reset'
    ]);
    global.fetch = previousFetch;
});

test('pooltable updates the same card through the native rich edit helper', async () => {
    const updates = [];
    const reactions = [];
    const sock = {
        sendMessage: async (jid, content, options) => {
            if (options?.edit) updates.push({ jid, content, options });
            else reactions.push({ jid, content });
            return { key: { id: 'updated' } };
        }
    };
    const chat = '123@g.us';
    const sessionId = `${chat}:pool-2`;
    poolcard.sessions.set(sessionId, { credits: 530, bet: 10, bestWin: 0, spin: 0, lastResult: null, messageId: 'pool-2' });

    await poolcard.execute(sock, {
        chat,
        quoted: { key: { id: 'callback-envelope-1' } },
        key: { id: 'button-1' }
    }, { args: ['shoot'], reply: async () => {} });

    assert.equal(updates.length, 1);
    assert.equal(updates[0].jid, chat);
    assert.equal(updates[0].options.edit.id, 'pool-2');
    assert.equal(updates[0].options.forwarded, true);
    assert.match(updates[0].content.caption, /WIN \+/);
    assert.equal(reactions.length, 1);
    poolcard.sessions.delete(sessionId);
});

test('pooltable reports a clear helper error', async () => {
    const replies = [];
    await poolcard.execute({}, { chat: '123@s.whatsapp.net' }, {
        args: [],
        reply: async value => replies.push(value)
    });
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Pocket Relay session expired|Pocket Relay could not render/i);
});
