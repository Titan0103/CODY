const assert = require('node:assert/strict');
const test = require('node:test');

const gen4 = require('../src/Commands/Owner/gen4.js');

test('gen4 sends the screenshot-style RichMenu through sock.richMenu', async () => {
    const calls = [];
    const replies = [];
    const sock = {
        richMenu: async (jid, payload) => {
            calls.push({ jid, payload });
            return { key: { id: 'gen4-1' } };
        }
    };

    await gen4.execute(sock, { chat: '12345@g.us' }, {
        reply: async value => replies.push(value)
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].jid, '12345@g.us');
    assert.equal(calls[0].payload.header.title, 'Rich Menu');
    assert.equal(calls[0].payload.header.image.mime_type, 'image/jpeg');
    assert.equal(calls[0].payload.body.cards.length, 2);
    assert.equal(calls[0].payload.body.cards[0].buttons.length, 3);
    assert.equal(calls[0].payload.body.cards[1].buttons[2].id, 'rich2');
    assert.equal(calls[0].payload.footer.url, 'https://t.me/CRYSNOVA_AI');
    assert.match(replies[0], /gen4 richmenu requested.*gen4-1/i);
});

test('gen4 reports when the upgraded richMenu API is unavailable', async () => {
    const replies = [];

    await gen4.execute({}, { chat: '12345@s.whatsapp.net' }, {
        reply: async value => replies.push(value)
    });

    assert.equal(replies.length, 1);
    assert.match(replies[0], /sock\.richMenu/i);
    assert.match(replies[0], /2\.7\.11/i);
});
