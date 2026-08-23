const fs = require('fs');
const path = require('path');

const readGroupConfig = name => {
    try {
        const file = path.join(process.cwd(), 'database', name);
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    } catch {
        return {};
    }
};

const status = (config, jid) => config?.[jid]?.enabled ? 'ON' : 'OFF';
const action = (config, jid) => config?.[jid]?.action || 'delete';

module.exports = {
    name: 'settings',
    alias: ['groupsettings', 'modsettings'],
    desc: 'Show group moderators and moderation settings',
    category: 'Admin',
    groupOnly: true,
    adminOnly: true,
    reactions: { start: '⚙️', success: '📋' },
    execute: async (sock, m, { reply }) => {
        const metadata = await sock.groupMetadata(m.chat).catch(() => null);
        if (!metadata) return reply('Unable to read group settings right now.');

        const moderators = (metadata.participants || [])
            .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
            .map(participant => {
                const jid = participant.id || participant.jid || '';
                const role = participant.admin === 'superadmin' ? 'Owner' : 'Moderator';
                return `• @${jid.split('@')[0]} — ${role}`;
            });

        const antiLink = readGroupConfig('antilink.json');
        const antiGm = readGroupConfig('antigm.json');
        const antiBot = readGroupConfig('antibot.json');
        const antiForward = readGroupConfig('antiforward.json');
        const antiGroupStatus = readGroupConfig('antigroupstatus.json');

        const mentions = (metadata.participants || [])
            .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
            .map(participant => participant.id || participant.jid)
            .filter(Boolean);

        return reply(
            `⚙️ *Group Settings*\n\n` +
            `*Moderators (${moderators.length})*\n${moderators.length ? moderators.join('\n') : '• None'}\n\n` +
            `*Anti Features*\n` +
            `• AntiLink: ${status(antiLink, m.chat)} (${action(antiLink, m.chat)})\n` +
            `• AntiGM: ${status(antiGm, m.chat)} (${action(antiGm, m.chat)})\n` +
            `• AntiBot: ${status(antiBot, m.chat)} (${action(antiBot, m.chat)})\n` +
            `• AntiForward: ${status(antiForward, m.chat)} (${action(antiForward, m.chat)})\n` +
            `• AntiGroupStatus: ${status(antiGroupStatus, m.chat)} (${action(antiGroupStatus, m.chat)})`,
            { mentions }
        );
    }
};

module.exports.status = status;
module.exports.action = action;
module.exports.readGroupConfig = readGroupConfig;

module.exports;
