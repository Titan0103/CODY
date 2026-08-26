const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@crysnovax/baileys') {
        return {
            downloadContentFromMessage: async function* () {
                yield Buffer.from('unused');
            },
            checkStatusWA: async number => ({
                number: `+${number}`,
                status: 'active',
                isBanned: false,
                isNeedOfficialWa: false,
                banInfo: null
            })
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const poststatus = require('../src/Commands/Owner/poststatus.js');
const groupstatus = require('../src/Commands/Owner/groupstatus.js');
const bancheck = require('../src/Commands/Owner/bancheck.js');
Module._load = originalLoad;

test('poststatus delegates personal status to sendStatus', async () => {
    const calls = [];
    const replies = [];
    const sock = {
        user: { id: '99999:0@s.whatsapp.net' },
        signalRepository: { lidMapping: {} },
        sendStatus: async content => {
            calls.push(content);
            return { key: { id: 'status-1' } };
        }
    };

    await poststatus.execute(sock, { chat: '99999@s.whatsapp.net', key: { id: 'm1' } }, {
        args: ['hello'],
        store: { contacts: new Map([['c', { id: '12345@s.whatsapp.net' }]]) },
        prefix: '.',
        reply: async value => replies.push(value)
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, 'hello');
    assert.match(replies[0], /Status posted successfully/i);
});

test('groupstatus sends audio through sendGroupStatus with selectable background', async () => {
    const calls = [];
    const replies = [];
    const sock = {
        sendGroupStatus: async (jid, content, options) => {
            calls.push({ jid, content, options });
            return { key: { id: 'group-status-1' } };
        }
    };
    const message = {
        chat: '12345@g.us',
        quoted: { message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } } }
    };

    await groupstatus.execute(sock, message, {
        args: ['--bg=#112233'],
        prefix: '.',
        reply: async value => replies.push(value),
        downloadQuotedMedia: async () => ({ type: 'audio', media: { mimetype: 'audio/ogg; codecs=opus', ptt: true }, buffer: Buffer.from('audio') })
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].jid, '12345@g.us');
    assert.equal(calls[0].content.audio.toString(), 'audio');
    assert.equal(calls[0].options.backgroundColor, '#112233');
    assert.match(replies[0], /Group status posted/i);
});

test('bancheck reports Baileys ban status using the number directly', async () => {
    const replies = [];

    await bancheck.execute({}, { chat: '12345@s.whatsapp.net' }, {
        args: ['+1 (555) 000-1111'],
        reply: async value => replies.push(value)
    });

    assert.match(replies[0], /Status: active/i);
    assert.match(replies[0], /Ban detected: NO/i);
    assert.match(replies[0], /ban-status endpoint/i);
});
