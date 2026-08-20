const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDeployButton, normalizeDeployButtonMessage, extractDeployButtonValues } = require('../src/Plugin/deployButtonRouter');

test('normalizes Gen4 deployment labels from WhatsApp conversation responses', () => {
    assert.equal(normalizeDeployButton('Step 1 · Discord'), '.deploy step1');
    assert.equal(normalizeDeployButton('Step 2 · Panel'), '.deploy step2');
    assert.equal(normalizeDeployButton('Step 3 · Pair'), '.deploy step3');
    assert.equal(normalizeDeployButton('Step 4 · Upload'), '.deploy step4');
    assert.equal(normalizeDeployButton('Help'), '.deploy help');
    assert.equal(normalizeDeployButton('Tutorials'), '.deploy tutorials');
});

test('normalizes Baileys buttons and template response envelopes', () => {
    assert.equal(normalizeDeployButtonMessage({ buttonsResponseMessage: {
        selectedButtonId: 'Step 1 · Discord',
        selectedDisplayText: 'Discord'
    }}), '.deploy step1');
    assert.equal(normalizeDeployButtonMessage({ templateButtonReplyMessage: {
        selectedId: 'deploy:step3',
        selectedDisplayText: 'Step 3 · Pair'
    }}), '.deploy step3');
});

test('normalizes native-flow parameter JSON and raw conversation fallback', () => {
    assert.equal(normalizeDeployButtonMessage({ conversation: 'Step 4 · Upload' }), '.deploy step4');
    assert.equal(normalizeDeployButtonMessage({ interactiveResponseMessage: {
        nativeFlowResponseMessage: {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ id: 'deploy:help', display_text: 'Help' })
        }
    }}), '.deploy help');
    assert.ok(extractDeployButtonValues({ conversation: 'Tutorials' }).includes('Tutorials'));
});

test('normalizes callback IDs and preserves unrelated text', () => {
    assert.equal(normalizeDeployButton('deploy:step3'), '.deploy step3');
    assert.equal(normalizeDeployButton('.deploy step4'), '.deploy step4');
    assert.equal(normalizeDeployButton('hello world'), null);
    assert.equal(normalizeDeployButton('Step 9 · Other'), null);
});
