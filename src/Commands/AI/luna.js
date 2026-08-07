const axios = require("axios");

// FIX08-07-26: all Luna calls moved to the working PREXZY chat endpoint —
// the old ai.crysnovax.link gateway failed, which also broke voice generation.
const PREXZY_CHAT = "https://prexzyapis.com/ai/ch";

module.exports = {
    name: 'luna',
    alias: ['ai', 'ask'],
    category: 'AI',
    desc: 'Luna AI Text powered by PREXZY',

    execute: async (sock, m, { args, reply }) => {
        const query = args.join(' ').trim();
        if (!query) return reply('_*⚉ Ask Luna something.*_');

        try {
            await sock.sendMessage(m.chat, { react: { text: '🌙', key: m.key } });

            const response = await axios.get(
                `${PREXZY_CHAT}?q=${encodeURIComponent(query)}`,
                { timeout: 60000 }
            );

            const data = response.data || {};
            let replyText = data?.response || data?.result || data?.message || data?.text || data?.output;
            if (typeof replyText === 'object' && replyText !== null) {
                replyText = replyText.content || replyText.output || JSON.stringify(replyText, null, 2);
            }
            if (!replyText || typeof replyText !== 'string' || !replyText.trim()) {
                return reply('_*✦ Luna failed.*_');
            }

            await sock.sendMessage(m.chat, {
                text: '🌙 *Luna AI*\n\n' + replyText.trim()
            }, { quoted: m });

        } catch (err) {
            console.error('Luna Plugin Error:', err.message);
            reply('_*✦ Luna failed.*_');
        }
    }
};
