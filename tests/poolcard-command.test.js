const assert = require('node:assert/strict');
const test = require('node:test');

const poolcard = require('../src/Commands/Owner/poolcard.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('pooltable sends one RichGen image and updates the same message with bounded frames', async () => {
    const sends = [];
    const updates = [];
    const previousSend = poolcard.generationPayload;
    const sock = {
        sendRichGeneration: async (jid, payload, quoted) => {
            sends.push({ jid, payload, quoted });
            return { messageId: 'rich-1', responseId: 'response-1', itemId: 'item-1' };
        },
        updateRichGeneration: async (jid, messageId, payload, options) => {
            updates.push({ jid, messageId, payload, options });
            return { messageId, responseId: options.responseId, itemId: options.itemId };
        }
    };

    const originalDelay = global.setTimeout;
    global.setTimeout = (callback, ms, ...args) => originalDelay(callback, Math.min(ms, 1), ...args);
    try {
        await poolcard.execute(sock, { chat: '123@s.whatsapp.net' }, { args: [], reply: async () => {} });
    } finally {
        global.setTimeout = originalDelay;
    }

    assert.equal(sends.length, 1);
    assert.equal(sends[0].payload.mediaType, 'image');
    assert.equal(sends[0].payload.status, 'READY');
    assert.match(sends[0].payload.text, /live spin wheel/i);
    assert.equal(updates.length, poolcard.FRAME_URLS.length - 1);
    assert.ok(updates.every(update => update.messageId === 'rich-1'));
    assert.ok(updates.every(update => update.options.itemId === 'item-1'));
    assert.ok(updates.every(update => update.options.responseId === 'response-1'));
    assert.equal(updates.at(-1).payload.status, 'READY');
    assert.equal(new Set(updates.map(update => update.payload.url)).size, updates.length);
    assert.ok(updates.every(update => !('nativeFlow' in update.payload)));
    assert.ok(updates.every(update => !('cards' in update.payload)));
    assert.equal(previousSend, poolcard.generationPayload);
});

test('pooltable rejects arguments instead of sending a second message type', async () => {
    const replies = [];
    let sends = 0;
    const sock = { sendRichGeneration: async () => { sends += 1; } };
    await poolcard.execute(sock, { chat: '123@s.whatsapp.net' }, {
        args: ['shoot'],
        reply: async value => replies.push(value)
    });
    assert.equal(sends, 0);
    assert.match(replies[0], /automatic/i);
});

test('pooltable reports missing RichGen helpers clearly', async () => {
    const replies = [];
    await poolcard.execute({}, { chat: '123@s.whatsapp.net' }, {
        args: [],
        reply: async value => replies.push(value)
    });
    assert.equal(replies.length, 1);
    assert.match(replies[0], /RichGen/i);
});
