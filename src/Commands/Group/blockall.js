// blockall.js — blocks every non-admin in the group at once.
// Needs a confirm word so nobody mass-blocks by accident. @crysnovax—FIX06-08-26
// Hardened: device-suffix jid normalization, owner/sudo skipped, gentle pacing
// between blocks to avoid WhatsApp rate limits. @crysnovax—FIX09-08-26
// FIX09-08-26: participant phones are resolved through the store / lidMapping,
// so @lid member jids compare correctly against admins, the bot and the owner
// (previously that mismatch could make every member look like "no one to block").
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

        let meta = groupMeta || await sock.groupMetadata(m.chat).catch(() => null);
        if (!meta) return reply('_✘ Could not fetch group metadata_');

        let participants = meta.participants || [];

        // If the (possibly cached) metadata has no participants, pull the live
        // group list directly.
        if (!participants.length && typeof sock.groupFetchAllParticipating === 'function') {
            try {
                const all = await sock.groupFetchAllParticipating();
                participants = all?.[m.chat]?.participants || participants;
            } catch {}
        }

        // Resolve a participant to its real phone number (digits only),
        // handling both @s.whatsapp.net and @lid jids.
        const resolvePhone = async (p) => {
            const clean = String(p?.id || p?.jid || '').replace(/:\d+@/, '@');
            const num = clean.split('@')[0].replace(/\D/g, '');
            if (clean.endsWith('@s.whatsapp.net')) return { clean, phone: num };
            if (clean.endsWith('@lid')) {
                if (p?.phoneNumber) {
                    const direct = String(p.phoneNumber).replace(/\D/g, '');
                    if (direct) return { clean, phone: direct };
                }
                try {
                    const contacts = store?.contacts;
                    const get = (k) => (contacts instanceof Map ? contacts.get(k) : contacts?.[k]);
                    let c = get(clean) || get(num);
                    if (c?.phoneNumber) {
                        const phone = String(c.phoneNumber).replace(/\D/g, '');
                        if (phone) return { clean, phone };
                    }
                    const all = contacts instanceof Map
                        ? [...contacts.values()]
                        : Object.values(contacts || {});
                    const found = all.find(x =>
                        x?.lid === clean || x?.id === clean ||
                        String(x?.id || '').split('@')[0] === num
                    );
                    if (found?.phoneNumber) {
                        const phone = String(found.phoneNumber).replace(/\D/g, '');
                        if (phone) return { clean, phone };
                    }
                } catch {}
                try {
                    const mapper = sock?.signalRepository?.lidMapping;
                    if (mapper?.getPNForLID) {
                        const raw = mapper.getPNForLID(clean);
                        const pn = raw && typeof raw.then === 'function' ? await raw : raw;
                        if (pn) {
                            const phone = String(pn).replace(/\D/g, '');
                            if (phone) return { clean, phone };
                        }
                    }
                } catch {}
                return { clean, phone: null };
            }
            return { clean, phone: null };
        };

        // The block API — supports both common Baileys spellings
        const blockFn = typeof sock.updateBlockStatus === 'function'
            ? sock.updateBlockStatus.bind(sock)
            : (typeof sock.blockUser === 'function' ? sock.blockUser.bind(sock) : null);

        if (!blockFn) {
            return reply('_✘ updateBlockStatus is not available on this build_');
        }

        const botPhone = String(sock.user?.id || '').split(':')[0].replace(/\D/g, '');

        // owner + sudo never get blocked, even if they're not admins here
        const protectedNums = new Set();
        try {
            const sudoRaw = String(process.env.SUDO_NUMBERS || '')
                .split(',').map(n => n.replace(/[^0-9]/g, '')).filter(Boolean);
            for (const n of sudoRaw) protectedNums.add(n);
            const ownerRaw = process.env.OWNER_NUMBER || '';
            if (ownerRaw) protectedNums.add(ownerRaw.replace(/[^0-9]/g, ''));
        } catch {}

        // admin + protected phones are compared by PHONE, so @lid members
        // match correctly against the bot / owner / admins
        const adminPhones = new Set();
        const resolved = [];
        for (const p of participants) {
            const { clean, phone } = await resolvePhone(p);
            resolved.push({ p, clean, phone });
            if (p?.admin === 'admin' || p?.admin === 'superadmin') {
                if (phone) adminPhones.add(phone);
            }
        }

        const targets = [];
        const seen = new Set();
        for (const { p, clean, phone } of resolved) {
            if (!phone || phone.length < 7) continue;
            if (phone === botPhone) continue;              // never block the bot itself
            if (adminPhones.has(phone)) continue;          // skip admins
            if (protectedNums.has(phone)) continue;        // owner/sudo protected
            if (seen.has(phone)) continue;
            seen.add(phone);
            // block via the real phone jid — always valid for updateBlockStatus
            targets.push(`${phone}@s.whatsapp.net`);
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
