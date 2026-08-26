const { checkStatusWA } = require('@crysnovax/baileys');

function normalizeNumber(value = '') {
    return String(value).replace(/[^0-9]/g, '');
}

function formatBanResult(result) {
    const lines = [
        `Number: ${result.number}`,
        `Status: ${result.status}`,
        `Ban detected: ${result.isBanned ? 'YES' : 'NO'}`
    ];
    if (result.banInfo) {
        lines.push(`Ban type: ${result.banInfo.banType || 'unknown'}`);
        lines.push(`Can appeal: ${result.banInfo.canAppeal ? 'yes' : 'no'}`);
        if (result.banInfo.appealStatus) lines.push(`Appeal status: ${result.banInfo.appealStatus}`);
    }
    if (result.isNeedOfficialWa) lines.push('Action: use the official WhatsApp application.');
    if (result.status === 'unknown') lines.push('Note: WhatsApp returned an unrecognized response; this is inconclusive, not a ban confirmation.');
    else lines.push('Source: WhatsApp ban-status endpoint via @crysnovax/baileys.');
    if (result.diagnostics) {
        const d = result.diagnostics;
        lines.push('', 'Diagnostics (safe metadata only):');
        lines.push(`• HTTP status: ${d.httpStatus ?? 'unknown'}`);
        lines.push(`• Response OK: ${d.ok ? 'yes' : 'no'}`);
        lines.push(`• Content type: ${d.contentType || 'unknown'}`);
        lines.push(`• Body keys: ${d.bodyKeys?.join(', ') || '(none)'}`);
        lines.push(`• Data keys: ${d.dataKeys?.join(', ') || '(none)'}`);
        lines.push(`• Signals: ${Object.entries(d.signals || {}).filter(([, value]) => value).map(([key]) => key).join(', ') || '(none)'}`);
    }
    return lines.join('\n');
}

module.exports = {
    name: 'bancheck',
    alias: ['checkban', 'numbercheck'],
    category: 'Owner',
    ownerOnly: true,
    desc: 'Check WhatsApp ban status using the Baileys ban-status endpoint',
    execute: async (_sock, m, { args = [], reply }) => {
        const diagnostic = args.some((arg) => /^(--)?debug$/i.test(String(arg)));
        const numberArg = args.find((arg) => !/^(--)?debug$/i.test(String(arg)));
        const number = normalizeNumber(numberArg || m?.sender || '');
        if (!number) return reply(`Usage: .bancheck <country-code-and-number> [--debug]`);

        try {
            if (typeof checkStatusWA !== 'function') {
                return reply('This Baileys version does not expose the ban-status checker. Update to @crysnovax/baileys@2.7.15.');
            }
            const result = await checkStatusWA(number, { diagnostic });
            return reply(formatBanResult(result));
        } catch (error) {
            return reply(`Ban check could not complete for ${number}: ${error?.message || error}`);
        }
    },
    formatBanResult,
    normalizeNumber
};
