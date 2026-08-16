const assert = require('node:assert/strict');
const test = require('node:test');

const evalCommand = require('../src/Commands/System/£.js');

const createContext = (text, overrides = {}) => {
    const replies = [];
    const sent = [];
    const reactions = [];

    const sock = {
        sendMessage: async (chat, content, options) => {
            sent.push({ chat, content, options });
            if (content.react) reactions.push(content.react);
            return {
                key: { id: `test-${sent.length}` },
                messageTimestamp: 1,
                message: content
            };
        }
    };

    const message = {
        chat: '12345@s.whatsapp.net',
        key: { id: 'incoming-test' }
    };

    return {
        command: 'eval',
        text,
        args: [],
        prefix: '.',
        isOwner: true,
        isDual: false,
        reply: async value => replies.push(String(value)),
        ...overrides,
        sock,
        message,
        replies,
        sent,
        reactions
    };
};

test('eval returns the result of a simple JavaScript expression', async () => {
    const context = createContext('1 + 1');

    await evalCommand.execute(context.sock, context.message, context);

    assert.equal(context.replies.length, 1);
    assert.match(context.replies[0], /2/);
});

test('eval captures console output and restores the console', async () => {
    const originalLog = console.log;
    const context = createContext('console.log("captured"); undefined');

    await evalCommand.execute(context.sock, context.message, context);

    assert.equal(console.log, originalLog);
    assert.equal(context.replies.length, 1);
    assert.match(context.replies[0], /captured/);
});

test('eval returns multiline object diagnostics from the live socket context', async () => {
    const context = createContext(`({
        table: typeof sock.sendInteractiveTable,
        grid: typeof sock.sendRichButtonGrid,
        flow: typeof sock.sendWhatsAppFlow,
        status: typeof sock.sendStatus,
        sendMessage: typeof sock.sendMessage
    })`);

    await evalCommand.execute(context.sock, context.message, context);

    assert.equal(context.replies.length, 1);
    assert.match(context.replies[0], /table/);
    assert.match(context.replies[0], /sendMessage/);
});

test('eval exposes the socket and media helper contract used by bot owners', async () => {
    const context = createContext('sendImage(Buffer.from("image-data"), "caption")');
    context.sock = context.sock;

    await evalCommand.execute(context.sock, context.message, context);

    assert.equal(context.sent.length, 1);
    assert.equal(context.sent[0].chat, context.message.chat);
    assert.deepEqual(context.sent[0].content, {
        image: Buffer.from('image-data'),
        caption: 'caption'
    });
    assert.deepEqual(context.sent[0].options, { quoted: context.message });
});
