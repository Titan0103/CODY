// Native pool-card game: an in-chat rich card, not a WebView or URL launcher.
const sessions = new Map();
const CARD_IMAGE = process.env.CODY_POOL_CARD_IMAGE_URL || 'https://3000-i7qaim3ry4869h3torapz-4aeb5eaa.us3.manus.computer/manus-storage/signal-arcade-hero_52d44784.png';

const stateFor = (session) => {
    const balls = ['●', '◆', '●', '◆', '●'];
    const board = session.sunk > 0 ? balls.map((ball, index) => index < session.sunk ? '·' : ball).join('  ') : balls.join('  ');
    const status = session.lastResult || 'Choose BET + or SHOOT';
    return {
        title: 'POCKET RELAY · POOL TABLE',
        image: { url: CARD_IMAGE },
        caption: [
            '🎱  POCKET RELAY',
            `CREDITS  ${session.credits}     BET  ${session.bet}     BEST WIN  ${session.bestWin}`,
            '',
            `      ◉  ${board}  ◉`,
            '',
            `              ${status}`
        ].join('\n'),
        buttons: [
            { id: 'poolcard:bet', text: `BET +${session.bet}` },
            { id: 'poolcard:shoot', text: 'SHOOT' },
            { id: 'poolcard:reset', text: 'RESET' }
        ]
    };
};

const keyFor = (m) => `${m.chat}:${m.quoted?.key?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId || m.key?.id || 'latest'}`;

const poolcard = {
    name: 'poolcard',
    alias: ['poolrich', 'pooltable'],
    desc: 'Send an interactive native pool rich card',
    category: 'Owner',
    owner: true,
    reactions: { start: '🎱', success: '✅', error: '❔' },

    execute: async (sock, m, { args = [], reply }) => {
        if (typeof sock.sendRichButtonGrid !== 'function') {
            return reply('sendRichButtonGrid is unavailable; update @crysnovax/baileys first.');
        }
        const action = String(args[0] || '').toLowerCase();
        if (!action) {
            const session = { credits: 530, bet: 10, bestWin: 0, sunk: 0, lastResult: null };
            const sent = await sock.sendRichButtonGrid(m.chat, { text: '🎱 POCKET RELAY', footer: 'Native in-message game · tap a control', cards: [stateFor(session)] }, { quoted: m });
            const messageId = sent?.key?.id || sent?.messageId;
            if (!messageId) return reply('Pool card sent without a message key; updates cannot be attached.');
            sessions.set(`${m.chat}:${messageId}`, { ...session, messageId });
            return;
        }

        const targetId = m.quoted?.key?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const sessionKey = targetId ? `${m.chat}:${targetId}` : [...sessions.keys()].reverse().find((key) => key.startsWith(`${m.chat}:`));
        const session = sessionKey ? sessions.get(sessionKey) : null;
        if (!session) return reply('Pool card session expired. Send /poolcard again.');
        if (action === 'reset') Object.assign(session, { credits: 530, bet: 10, bestWin: 0, sunk: 0, lastResult: 'Table reset' });
        else if (action === 'bet') {
            if (session.credits < session.bet) session.lastResult = 'Not enough credits';
            else { session.credits -= session.bet; session.lastResult = `Bet placed · ${session.bet}`; }
        } else if (action === 'shoot') {
            const win = session.bet * (session.sunk % 2 === 0 ? 10 : 4);
            session.credits += win; session.bestWin = Math.max(session.bestWin, win); session.sunk = (session.sunk + 1) % 5; session.lastResult = `WIN +${win}`;
        } else return reply('Use the buttons on the pool card.');

        const updated = stateFor(session);
        await sock.sendMessage(m.chat, { text: updated.caption, footer: 'Native in-message game · tap a control', cards: [updated] }, { edit: { remoteJid: m.chat, id: session.messageId } });
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
    }
};

module.exports = poolcard;
module.exports.sessions = sessions;
module.exports.stateFor = stateFor;
