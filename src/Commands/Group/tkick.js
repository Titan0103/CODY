// tkick.js — temporary kick command: user is removed and auto re-added after
// the duration. Works in any group where the bot is admin. @crysnovax—FIX06-08-26
const { tkick, undo, isTkicked, parseTime } = require('../../Plugin/tkick');

module.exports = {
    name: 'tkick',
    alias: ['tempkick', 'tk'],
    desc: 'Temporarily kick a user — they get added back automatically',
    category: 'Group',
    groupOnly: true,
    adminOnly: true,
    reactions: { start: '⏱️', success: '🔁' },

    execute: async (sock, m, { args, reply, prefix }) => {
        const sub = (args[0] || '').toLowerCase();

        // .tkick undo @user — bring someone back right now
        if (sub === 'undo' || sub === 'untkick') {
            const target = m.mentionedJid?.[0] || m.quoted?.sender ||
                           (args[1] && /^\d+$/.test(args[1]) ? args[1] + '@s.whatsapp.net' : null);
            if (!target) return reply(`_⚉ Usage: ${prefix}tkick undo @user_`);
            if (!isTkicked(m.chat, target)) return reply('_✘ That user is not on a temp kick_');
            await undo(sock, m.chat, target);
            return reply(`_✓ @${target.split('@')[0]} added back — temp kick cancelled_`);
        }

        // target detection
        let targetJid = m.mentionedJid?.[0] || m.quoted?.sender || null;
        if (!targetJid) {
            const match = (m.text || '').match(/@(\d+)/);
            if (match) targetJid = match[1] + '@s.whatsapp.net';
        }
        if (!targetJid && /^\d+$/.test(args[0])) targetJid = args[0] + '@s.whatsapp.net';

        if (!targetJid) return reply(`✘ Specify user\nExample:\n${prefix}tkick @user 5m`);

        // duration
        const timeArg = args.find(a => /^\d+(s|m|h|d)$/i.test(a));
        const ms = timeArg ? parseTime(timeArg) : 5 * 60 * 1000;

        const reason = args.filter(a =>
            !a.includes('@') && !/^\d+(s|m|h|d)$/i.test(a)
        ).join(' ') || 'Temp kick';

        if (isTkicked(m.chat, targetJid)) return reply('_✘ That user is already on a temp kick_');

        await tkick(sock, m.chat, targetJid, ms, reason);
        return sock.sendMessage(m.chat, {
            text:
                `*ᯤ TEMP KICK*\n\n` +
                `⊹ Target  : @${targetJid.split('@')[0]}\n` +
                `⊹ Duration: ${timeArg || '5m'}\n` +
                `⊹ Reason  : ${reason}\n\n` +
                `_They get added back automatically when the timer ends._`,
            mentions: [targetJid]
        }, { quoted: m });
    }
};
