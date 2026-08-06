// autoadd.js — controls join-request auto-approval: delay + country filter.
// @crysnovax—FIX06-08-26
const { getVar, setVar } = require('../../Plugin/configManager');

module.exports = {
    name: 'autoadd',
    alias: ['autoapprove', 'autoaddreq'],
    desc: 'Auto-approve group join requests (delay + country code filter)',
    category: 'Owner',
    ownerOnly: true,
    reactions: { start: '🥀', success: '👥' },

    execute: async (sock, m, { args, reply, prefix }) => {
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'on' || sub === 'true' || sub === '1') {
            setVar('AUTO_APPROVE', true);
            return reply('_✓ AUTO_APPROVE on — join requests get approved automatically_');
        }
        if (sub === 'off' || sub === 'false' || sub === '0') {
            setVar('AUTO_APPROVE', false);
            return reply('_✘ AUTO_APPROVE off_');
        }
        if (sub === 'delay' && args[1]) {
            const secs = parseInt(args[1], 10);
            if (isNaN(secs) || secs < 5) return reply('_✘ Delay must be at least 5 seconds_');
            setVar('AUTO_APPROVE_DELAY', secs);
            return reply(`_✓ Auto-approve delay → ${secs}s_`);
        }
        if (sub === 'cc' && args[1]) {
            const cc = args[1].toLowerCase();
            if (cc === 'all') {
                setVar('AUTO_APPROVE_CC', '');
                return reply('_✓ Country filter removed — all countries get approved_');
            }
            const clean = cc.replace(/\D/g, '');
            if (!clean) return reply('_✘ Invalid country code_');
            setVar('AUTO_APPROVE_CC', clean);
            return reply(`_✓ Only numbers starting with +${clean} get approved_`);
        }

        const status = getVar('AUTO_APPROVE', false);
        const delay = getVar('AUTO_APPROVE_DELAY', 60);
        const cc = getVar('AUTO_APPROVE_CC', '');

        return reply(
            `*Auto Approve* — join requests\n\n` +
            `• Status : ${status ? 'ON ✓' : 'OFF ✘'}\n` +
            `• Delay  : ${delay}s\n` +
            `• Country code : ${cc ? '+' + cc : 'all'}\n\n` +
            `Commands:\n` +
            `${prefix}autoadd on|off\n` +
            `${prefix}autoadd delay 60\n` +
            `${prefix}autoadd cc 234|all`
        );
    }
};
