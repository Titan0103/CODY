const test = require('node:test');
const assert = require('node:assert/strict');
const deploy = require('../src/Commands/System/deploy');

test('deploy opens the Gen4 menu with current panel and tutorial links', async () => {
    const calls = [];
    const replies = [];
    const sock = {
        richMenu: async (...args) => {
            calls.push(args);
            return { key: { id: 'deploy-menu-1' } };
        }
    };
    const message = { chat: '123@s.whatsapp.net', key: { id: 'request-1' } };

    await deploy.execute(sock, message, { args: [], reply: text => replies.push(text) });

    assert.equal(calls.length, 1);
    const payload = calls[0][1];
    assert.equal(payload.header.title, 'CODY AI Deployment Guide');
    assert.equal(payload.footer.url, 'https://sl.crysnovax.link/tutorial5');
    assert.equal(payload.body.cards[0].buttons[0].id, '.deploy step1');
    assert.equal(payload.body.cards[1].buttons[0].id, '.deploy step4');
    assert.match(replies[0], /Choose a deployment step/);
    assert.deepEqual(deploy.alias, ['pair']);
});

test('step3 returns current pairing instructions and routes back to the menu', async () => {
    const calls = [];
    const replies = [];
    const sock = {
        richMenu: async (...args) => {
            calls.push(args);
            return { key: { id: 'deploy-step-3' } };
        }
    };
    const message = { chat: '123@s.whatsapp.net', key: { id: 'request-2' } };

    await deploy.execute(sock, message, { args: ['step3'], reply: text => replies.push(text) });

    const payload = calls[0][1];
    assert.equal(payload.header.title, 'CODY AI · Step 3 · Pair and generate');
    assert.match(replies[0], /pair\.crysnovax\.link/);
    assert.match(replies[0], /digits only/);
    assert.ok(payload.body.cards[0].buttons.some(item => item.id === '.deploy menu'));
});

test('deploy reports a clear message when richMenu is unavailable', async () => {
    const replies = [];
    const message = { chat: '123@s.whatsapp.net', key: { id: 'request-3' } };

    await deploy.execute({}, message, { args: [], reply: text => replies.push(text) });

    assert.match(replies[0], /richMenu is unavailable/);
    assert.match(replies[0], /2\.7\.11/);
});
