const DEPLOY_BUTTON_COMMANDS = new Map([
    ['step 1 · discord', '.deploy step1'],
    ['step 1 - discord', '.deploy step1'],
    ['step 1 discord', '.deploy step1'],
    ['step 2 · panel', '.deploy step2'],
    ['step 2 - panel', '.deploy step2'],
    ['step 2 panel', '.deploy step2'],
    ['step 3 · pair', '.deploy step3'],
    ['step 3 - pair', '.deploy step3'],
    ['step 3 pair', '.deploy step3'],
    ['step 4 · upload', '.deploy step4'],
    ['step 4 - upload', '.deploy step4'],
    ['step 4 upload', '.deploy step4'],
    ['help', '.deploy help'],
    ['tutorials', '.deploy tutorials'],
    ['back to menu', '.deploy menu'],
    ['menu', '.deploy menu']
]);

const normalizeDeployButton = value => {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^\.deploy\s+(step[1-4]|help|tutorials|menu)$/i.test(text)) return text;
    if (/^deploy:(step[1-4]|help|tutorials|menu)$/i.test(text)) {
        return `.deploy ${text.slice('deploy:'.length)}`;
    }
    return DEPLOY_BUTTON_COMMANDS.get(text.toLowerCase()) || null;
};

module.exports = { normalizeDeployButton, DEPLOY_BUTTON_COMMANDS };
