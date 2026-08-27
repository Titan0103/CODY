/*
 * Pocket Relay native rich-game surface.
 * Design target: a tall, composed WhatsApp message card with a visual game
 * panel, compact stats, native controls, and in-place state replacement.
 * This is intentionally a first pass; the gameplay is harmless and local to
 * the bot process, with no WebView URL and no crash-testing behavior.
 */

const sessions = new Map();
const CARD_IMAGE = process.env.CODY_POOL_CARD_IMAGE_URL || 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/rFZreqMAZlaslttv.png';
let cardImagePromise;

const loadCardImage = async () => {
    if (!cardImagePromise) {
        cardImagePromise = fetch(CARD_IMAGE).then(async (response) => {
            if (!response.ok) throw new Error(`Pocket Relay artwork HTTP ${response.status}`);
            return Buffer.from(await response.arrayBuffer());
        }).catch((error) => {
            cardImagePromise = null;
            throw error;
        });
    }
    return cardImagePromise;
};

const REELS = [
    ['🍒', '7️⃣', '💎', '🔔', '🍋'],
    ['🍋', '🔔', '🔔', '7️⃣', '🍒'],
    ['💎', '🍒', '🍋', '🍒', '7️⃣'],
    ['🔔', '🍒', '7️⃣', '💎', '🍋'],
    ['🍒', '🍋', '💎', '🔔', '🍒'],
];

const reelLines = (step) => {
    const row = REELS[step % REELS.length];
    const next = REELS[(step + 1) % REELS.length];
    const third = REELS[(step + 2) % REELS.length];
    return [row, next, third].map((line) => `│ ${line.join(' │ ')} │`).join('\n');
};

const buttonsFor = () => [
    { id: 'poolcard:bet', text: 'BET +' },
    { id: 'poolcard:shoot', text: 'SHOOT' },
    { id: 'poolcard:reset', text: 'RESET' }
];

const stateFor = (session) => {
    const status = session.lastResult || 'Good luck · choose your shot';
    return {
        title: 'POCKET RELAY · POOL TABLE',
        image: session.cardImage || { url: CARD_IMAGE },
        caption: [
            '🎱  POCKET RELAY',
            'JACKPOT  ·  10,000 CREDITS',
            '',
            `CREDITS  ${session.credits}     BET  ${session.bet}     BEST WIN  ${session.bestWin}`,
            '',
            '╭────────────────────────────╮',
            reelLines(session.spin),
            '╰────────────────────────────╯',
            '',
            `                 ${status}`,
            '',
            '      [ BET + ]          [ SHOOT ]',
            '           POCKET RELAY · BEST OF 3'
        ].join('\n'),
        buttons: buttonsFor(),
        footer: 'Native game surface · tap a control'
    };
};

const keyFor = (m) => `${m.chat}:${m.quoted?.key?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId || m.key?.id || 'latest'}`;
const latestSessionForChat = (chat) => [...sessions.entries()]
    .reverse()
    .find(([key]) => key.startsWith(`${chat}:`))?.[1] || null;

const poolcard = {
    name: 'pooltable',
    alias: ['poolcard', 'nativepool', 'poolrich'],
    desc: 'Send an interactive native Pocket Relay game card',
    category: 'Owner',
    owner: true,
    ownerOnly: true,
    reactions: { start: '🎱', success: '✅', error: '❔' },

    execute: async (sock, m, { args = [], reply }) => {
        const action = String(args[0] || '').toLowerCase();
        if (!action) {
            let session;
            try {
                session = { credits: 530, bet: 10, bestWin: 0, spin: 0, lastResult: null, cardImage: await loadCardImage() };
                const view = stateFor(session);
                const sent = await sock.sendMessage(m.chat, {
                    image: view.image,
                    caption: view.caption,
                    footer: view.footer,
                    nativeFlow: view.buttons
                }, { quoted: m });
                const messageId = sent?.key?.id || sent?.messageId;
                if (!messageId) return reply('Pocket Relay was sent without a message key; updates cannot be attached.');
                sessions.set(`${m.chat}:${messageId}`, { ...session, messageId });
                return;
            } catch (error) {
                return reply(`Pocket Relay could not render the native game surface: ${error?.message || error}`);
            }
        }

        const targetId = m.quoted?.key?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const exactSession = targetId ? sessions.get(`${m.chat}:${targetId}`) : null;
        // WhatsApp clients may expose the callback envelope ID or stanza ID
        // instead of the original rich-card ID. Prefer an exact match, then
        // use the newest active card in this chat rather than rejecting a
        // valid button tap as an expired session.
        const session = exactSession || latestSessionForChat(m.chat);
        if (!session) return reply('Pocket Relay session expired. Send .pooltable again.');

        if (action === 'reset') {
            Object.assign(session, { credits: 530, bet: 10, bestWin: 0, spin: 0, lastResult: 'Table reset' });
        } else if (action === 'bet') {
            if (session.credits < session.bet) session.lastResult = 'Not enough credits';
            else {
                session.credits -= session.bet;
                session.lastResult = `Bet placed · ${session.bet}`;
            }
        } else if (action === 'shoot') {
            const win = session.bet * (session.spin % 2 === 0 ? 6 : 3);
            session.credits += win;
            session.bestWin = Math.max(session.bestWin, win);
            session.spin = (session.spin + 1) % REELS.length;
            session.lastResult = `WIN +${win}`;
        } else {
            return reply('Use the native Pocket Relay controls.');
        }

        const updated = stateFor(session);
        await sock.sendMessage(m.chat, {
            image: updated.image,
            caption: updated.caption,
            footer: updated.footer,
            nativeFlow: updated.buttons
        }, {
            edit: { remoteJid: m.chat, id: session.messageId, fromMe: true },
            quoted: m,
            forwarded: true
        });
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
    }
};

module.exports = poolcard;
module.exports.sessions = sessions;
module.exports.stateFor = stateFor;
module.exports.keyFor = keyFor;
module.exports.latestSessionForChat = latestSessionForChat;
