// blockall.js — blocks every non-admin in the group at once.
// Needs a confirm word so nobody mass-blocks by accident. @crysnovax—FIX06-08-26
// Hardened: device-suffix jid normalization, owner/sudo skipped, gentle pacing
// between blocks to avoid WhatsApp rate limits. @crysnovax—FIX09-08-26
module.exports = {
    name: 'blockall',
    alias: ['blockallmembers'],
    desc: 'Block everyone in the group (except admins, the bot, and the owner)',
    category: 'Group',
    groupOnly: true,
    // not adminOnly — any member may run it, but a confirm word is required
    // so nobody mass-blocks by accident (@crysnovax—FIX08-07-26)
    reactions: { start: '⛔', success: '🚫' },

    execute: async (sock, m, { args, reply, prefix, groupMeta, store }) => {
        const confirm = (args[0] || '').toLowerCase();
        if (confirm !== 'yes' && confirm !== 'confirm') {
            return reply(`_˗ˏˋ ☏ ˎˊ˗ This will BLOCK every non-admin in this group._\n\nType: ${prefix}blockall yes`);
        }

        const meta = groupMeta || await sock.groupMetadata(m.chat).catch(() => null);
        if (!meta) return reply('_✘ Could not fetch group metadata_');

        const norm = (j = '') => String(j || '').replace(/:\d+@/g, '@');

        // The block API — supports both common Baileys spellings
        const blockFn = typeof sock.updateBlockStatus === 'function'
            ? sock.updateBlockStatus.bind(sock)
            : (typeof sock.blockUser === 'function' ? sock.blockUser.bind(sock) : null);

        if (!blockFn) {
            return reply('_✘ updateBlockStatus is not available on this build_');
        }

        const botJid = norm(sock.user?.id || '');
        const botPhone = botJid.split('@')[0];

        // owner + sudo never get blocked, even if they're not admins here
        const protectedNums = new Set();
        try {
            const sudoRaw = String(
                (store ? '' : '') + (process.env.SUDO_NUMBERS || '')
            ).split(',').map(n => n.replace(/[^0-9]/g, '')).filter(Boolean);
            for (const n of sudoRaw) protectedNums.add(n);
            const ownerRaw = process.env.OWNER_NUMBER || '';
            if (ownerRaw) protectedNums.add(ownerRaw.replace(/[^0-9]/g, ''));
        } catch {}

        const admins = new Set(
            meta.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => norm(p.id))
        );

        const targets = [];
        for (const p of meta.participants) {
            const j = norm(p.id);
            if (j === botJid) continue;
            if (admins.has(j)) continue;
            if (protectedNums.has(j.split('@')[0])) continue;
            if (!targets.includes(j)) targets.push(j);
        }

        if (!targets.length) return reply('_✘ No one to block in this group_');

        let blocked = 0;
        const failed = [];
        for (const jid of targets) {
            try {
                await blockFn(jid, 'block');
                blocked++;
            } catch (err) {
                console.error('[BLOCKALL]', jid, err.message);
                failed.push(jid);
            }
            // gentle pacing — avoids 429 rate limits on large groups
            await new Promise(r => setTimeout(r, 250));
        }

        return reply(
            `_✓ Blocked ${blocked} of ${targets.length} user(s)_` +
            (failed.length ? `\n_✘ ${failed.length} failed (${failed.slice(0, 5).map(j => j.split('@')[0]).join(', ')})_` : '')
        );
    }
};
