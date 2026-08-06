const { downloadContentFromMessage } = require('@crysnovax/baileys');
// Pure-JS exif writer (node-webpmux). Avoids wa-sticker-formatter -> sharp,
// which crashes on hosts without a prebuilt sharp binary.
const { addExif } = require('../../../library/exif');
const { getPackName } = require('../../Plugin/packname');

module.exports = {
    name: 'take',
    alias: ['steal', 'takesticker', 'takes'],
    category: 'tools',
    desc: 'Steal sticker and save with CRYSNOVA AI packname',
    reactions: { start: '🥏', success: '😎' },

    execute: async (sock, m, { reply }) => {
        try {
            const quoted = m.quoted ? m.quoted : m;
            const mime = (quoted.msg || quoted).mimetype || '';

            if (!/webp/.test(mime)) {
                return reply('🥏 Reply to a sticker to re-brand it');
            }

            await sock.sendMessage(m.chat, { react: { text: '🥏', key: m.key } });

            // Download the replied sticker
            const stream = await downloadContentFromMessage(quoted.msg || quoted, 'sticker');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // Re-brand — pack forced to ⚉ • <PACK_NAME> when set (@crysnovax—FIX06-08-26)
            buffer = await addExif(buffer, getPackName() || 'CRYSNOVA AI', 'crysnovax', ['🔥']);

            await sock.sendMessage(m.chat, { sticker: buffer }, { quoted: m });

            await sock.sendMessage(m.chat, { react: { text: '😎', key: m.key } });

        } catch (e) {
            console.error('TAKE ERROR:', e);
            reply(`${prefix}✘ Failed: ${emessage}`);
        }
    }
};
