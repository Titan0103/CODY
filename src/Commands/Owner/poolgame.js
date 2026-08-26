// CODY pool-game command: owner-only launch for the compact local Pocket Relay Mini App.
const LOCAL_POOL_GAME_URL = process.env.CODY_POOL_GAME_URL || 'https://3000-i7qaim3ry4869h3torapz-4aeb5eaa.us3.manus.computer/pool';

module.exports = {
    name: 'poolgame',
    alias: ['pool', 'pocketrelay'],
    desc: 'Open the local Pocket Relay pool game',
    category: 'Owner',
    owner: true,
    reactions: { start: '🎱', success: '✅', error: '❔' },

    execute: async (sock, m, { reply }) => {
        try {
            if (typeof sock.sendRichWebview !== 'function') {
                throw new Error('sendRichWebview is unavailable; update @crysnovax/baileys first');
            }
            await sock.sendMessage(m.chat, { react: { text: '🎱', key: m.key } });
            await sock.sendRichWebview(m.chat, {
                title: 'Pocket Relay',
                text: 'A small pool game in your WebView. Choose a ball, shoot, and send your score.',
                buttonText: 'Open Pool Game',
                url: LOCAL_POOL_GAME_URL,
                useWebview: true,
                toast: 'Opening Pocket Relay…',
                footer: 'Local game test / no Worker connected'
            }, { quoted: m });
            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } catch (error) {
            console.error('[POOLGAME ERROR]', error.message);
            await sock.sendMessage(m.chat, { react: { text: '❔', key: m.key } });
            return reply(`✘ Pool game launch failed: ${error.message}`);
        }
    }
};

module.exports.LOCAL_POOL_GAME_URL = LOCAL_POOL_GAME_URL;
