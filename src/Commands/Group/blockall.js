// blockall.js — blocks every non-admin in the group at once.
// Needs a confirm word so nobody mass-blocks by accident. @crysnovax—FIX06-08-26
// Hardened: device-suffix jid normalization, owner/sudo skipped, gentle pacing
// between blocks to avoid WhatsApp rate limits. @crysnovax—FIX09-08-26
// FIX09-08-26 (final): "No one to block" is gone for good.
//   • participants can be objects OR plain jid strings — both are handled;
//   • a full lid→phone reverse map is built from EVERY contact in the store
//     (not just a linear first-hit), so @lid members resolve whenever possible;
//   • admins / the bot / the owner are compared by BOTH phone AND normalized
//     jid, so @lid members can never look like admins by accident;
//   • when a member's phone cannot be resolved, they are NO LONGER skipped —
//     they are blocked by their original participant jid instead (lid included),
//     so "no contact to block" only ever happens when the group truly has
//     nobody left to block.
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

        let rawParts = meta.participants || [];

        // If the (possibly cached) metadata has no participants, pull the live
        // group list directly.
        if (!rawParts.length && typeof sock.groupFetchAllParticipating === 'function') {
            try {
                const all = await sock.groupFetchAllParticipating();
                rawParts = all?.[m.chat]?.participants || rawParts;
            } catch {}
        }

        // participants may be objects ({ id, admin }) or plain jid strings
        const participants = rawParts.map(p =>
            typeof p === 'string' ? { id: p, admin: null } : p
        );

        const normalize = (j) => String(j || '').replace(/:\d+@/, '@').trim();
        const phoneOf = (j) => {
            const n = normalize(j).split('@')[0] || '';
            return n.replace(/\D/g, '') || null;
        };

        // Build a full lid → phone reverse map from EVERY contact in the store.
        // Modern Baileys group participants come back as @lid jids, and this is
        // the reliable way to turn them back into real phone numbers.
        const buildLidMap = () => {
            const map = new Map();
            const contacts = store?.contacts;
            if (!contacts) return map;
            const all = contacts instanceof Map ? [...contacts.values()] : Object.values(contacts);
            for (const c of all) {
                if (!c) continue;
                const id = c.id || '';
                const lid = c.lid || (id.endsWith('@lid') ? id : '');
                const phoneRaw = c.phoneNumber || (!id.endsWith('@lid') ? id.split('@')[0] : '');
                const phone = String(phoneRaw || '').replace(/\D/g, '');
                if (lid && phone) map.set(normalize(lid), phone);
                if (id && phone) map.set(normalize(id), phone);
            }
            return map;
        };
        const lidMap = buildLidMap();

        // Resolve a participant to its normalized jid and (when possible) phone.
        const resolve = async (p) => {
            const raw = p?.id || p?.jid || (typeof p === 'string' ? p : '');
            const jid = normalize(raw);
            if (!jid) return { jid: '', phone: null };

            const directPhone = phoneOf(jid);
            if (directPhone && jid.endsWith('@s.whatsapp.net')) return { jid, phone: directPhone };

            if (p?.phoneNumber) {
                const direct = String(p.phoneNumber).replace(/\D/g, '');
                if (direct) return { jid, phone: direct };
            }

            const get = (key) => {
                const contacts = store?.contacts;
                return contacts instanceof Map ? contacts.get(key) : contacts?.[key];
            };
            const c = get(jid);
            if (c?.phoneNumber) {
                const phone = String(c.phoneNumber).replace(/\D/g, '');
                if (phone) return { jid, phone };
            }
            if (lidMap.has(jid)) {
                const phone = lidMap.get(jid);
                if (phone) return { jid, phone };
            }
            try {
                const mapper = sock?.signalRepository?.lidMapping;
                if (mapper?.getPNForLID) {
                    const r = mapper.getPNForLID(jid);
                    const pn = r && typeof r.then === 'function' ? await r : r;
                    if (pn) {
                        const phone = String(pn).replace(/\D/g, '');
                        if (phone) return { jid, phone };
                    }
                }
            } catch {}
            // Unknown phone — caller decides what to do with the raw jid.
            return { jid, phone: null };
        };

        // The block API — supports both common Baileys spellings
        const blockFn = typeof sock.updateBlockStatus === 'function'
            ? sock.updateBlockStatus.bind(sock)
            : (typeof sock.blockUser === 'function' ? sock.blockUser.bind(sock) : null);

        if (!blockFn) {
            return reply('_✘ updateBlockStatus is not available on this build_');
        }

        // Protected: the bot itself (phone + lid jid), owner, sudo — matched by
        // BOTH phone and normalized jid so @lid members compare correctly.
        const botJid = normalize(sock.user?.id || '');
        const botLid = normalize(sock.user?.lid || '');
        const botPhone = phoneOf(botJid);

        const protectedPhones = new Set();
        const protectedJids = new Set();
        if (botPhone) protectedPhones.add(botPhone);
        if (botJid) protectedJids.add(botJid);
        if (botLid) protectedJids.add(botLid);
        try {
            const nums = [
                ...String(process.env.SUDO_NUMBERS || '').split(','),
                ...String(process.env.OWNER_NUMBER || '').split(','),
                ...String(process.env.OWNER_NUMBERS || '').split(','),
            ].map(n => n.replace(/[^0-9]/g, '')).filter(Boolean);
            for (const n of nums) {
                protectedPhones.add(n);
                protectedJids.add(`${n}@s.whatsapp.net`);
            }
        } catch {}

        // Resolve everyone once; track admins by phone AND jid.
        const resolved = [];
        const adminPhones = new Set();
        const adminJids = new Set();
        for (const p of participants) {
            const r = await resolve(p);
            resolved.push({ p, ...r });
            if (p?.admin === 'admin' || p?.admin === 'superadmin') {
                if (r.phone) adminPhones.add(r.phone);
                if (r.jid) adminJids.add(r.jid);
            }
        }

        // Pick targets — never skip a member just because their phone is
        // unknown; block by their raw jid in that case.
        const targets = [];
        const seen = new Set();
        for (const { p, jid, phone } of resolved) {
            if (!jid) continue;
            if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
            if (protectedJids.has(jid)) continue;
            if (phone && protectedPhones.has(phone)) continue;
            if (adminJids.has(jid)) continue;
            if (phone && adminPhones.has(phone)) continue;
            const dedupe = phone || jid;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            targets.push({
                primary: phone ? `${phone}@s.whatsapp.net` : jid,
                lidJid: jid.endsWith('@lid') ? jid : null,
            });
        }

        if (!targets.length) return reply('_✘ No one to block in this group_');

        let blocked = 0;
        const failed = [];
        for (const { primary, lidJid } of targets) {
            let done = false;
            try {
                await blockFn(primary, 'block');
                blocked++;
                done = true;
            } catch (err) {
                console.error('[BLOCKALL]', primary, err.message);
            }
            // Fallback: if the phone jid failed (or was never known), try the
            // member's own lid jid — the server resolves it.
            if (!done && lidJid && lidJid !== primary) {
                try {
                    await blockFn(lidJid, 'block');
                    blocked++;
                    done = true;
                } catch (err) {
                    console.error('[BLOCKALL]', lidJid, err.message);
                }
            }
            if (!done) failed.push(primary.split('@')[0]);
            // gentle pacing — avoids 429 rate limits on large groups
            await new Promise(r => setTimeout(r, 250));
        }

        return reply(
            `_✓ Blocked ${blocked} of ${targets.length} user(s)_` +
            (failed.length ? `\n_✘ ${failed.length} failed (${failed.slice(0, 5).join(', ')})_` : '')
        );
    }
};
