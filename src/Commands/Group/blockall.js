// blockall.js — blocks every non-admin in the group at once.
// Needs a confirm word so nobody mass-blocks by accident. @crysnovax—FIX06-08-26
module.exports = {
    name: 'blockall',
    alias: ['blockallmembers'],
    desc: 'Block everyone in the group (except admins and the bot itself)',
    category: 'Group',
    groupOnly: true,
    adminOnly: true,
    reactions: { start: '⛔', success: '🚫' },

    execute: async (sock, m, { args, reply, prefix, groupMeta }) => {
        const confirm = (args[0] || '').toLowerCase();
        if (confirm !== 'yes' && confirm !== 'confirm') {
            return reply(`_⚠️ This will BLOCK every non-admin in this group._\n\nType: ${prefix}blockall yes`);
        }

        const meta = groupMeta || await sock.groupMetadata(m.chat).catch(() => null);
        if (!meta) return reply('_✘ Could not fetch group metadata_');

        if (typeof sock.updateBlockStatus !== 'function') {
            return reply('_✘ updateBlockStatus is not available on this build_');
        }

        const botJid = (sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
        const admins = new Set(
            meta.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id.replace(/:\d+@/, '@'))
        );

        const targets = meta.participants.filter(p => {
            const j = p.id.replace(/:\d+@/, '@');
            return j !== botJid && !admins.has(j);
        });

        if (!targets.length) return reply('_✘ No one to block in this group_');

        let blocked = 0;
        for (const p of targets) {
            try {
                await sock.updateBlockStatus(p.id, 'block');
                blocked++;
            } catch (err) {
                console.error('[BLOCKALL]', err.message);
            }
        }

        return reply(`_✓ Blocked ${blocked} of ${targets.length} user(s) in this group_`);
    }
};
