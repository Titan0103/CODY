// invite.js — sends the REAL WhatsApp group invite link (the one that expires).
// • .invite            → posts the expiring link in the group with a rich preview
// • .invite @user ...  → DMs the expiring invite link to each mentioned user
// It NEVER auto-adds anyone — only the real, expiring invite is sent.
// @crysnovax—FIX09-08-26
const fetch = require('node-fetch');

module.exports = {
    name: 'invite',
    alias: ['grouplink', 'glink'],
    category: 'Group',
    admin: true,
    group: true,

    execute: async (sock, m, { args, reply, prefix }) => {
        try {
            if (!m.isGroup) return reply('`⟁⃝GROUP ONLY!℘`');

            const meta = await sock.groupMetadata(m.chat);
            const groupName = meta.subject;

            // ── Real invite code — regenerates on .resetlink, expires by design ──
            let inviteCode;
            try {
                inviteCode = await sock.groupInviteCode(m.chat);
            } catch (err) {
                return reply('`—͟͟͞͞𖣘 I need admin rights to generate the group link`');
            }
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}?mode=gi_t`;

            // ── Optional DM targets: @mentions, quoted sender, or numbers ──
            const targets = [];
            if (m.mentionedJid?.length) {
                for (const jid of m.mentionedJid) {
                    if (!targets.includes(jid)) targets.push(jid);
                }
            }
            if (m.quoted?.sender && !targets.includes(m.quoted.sender)) {
                targets.push(m.quoted.sender);
            }
            for (const a of args) {
                const n = a.replace(/[^0-9]/g, '');
                if (!n || n.length < 7) continue;
                const jid = n + '@s.whatsapp.net';
                if (!targets.includes(jid)) targets.push(jid);
            }

            // ── Group photo for the link preview ──
            let thumb = null;
            try {
                const pp = await sock.profilePictureUrl(m.chat, 'image');
                thumb = Buffer.from(await (await fetch(pp)).buffer());
            } catch {}

            if (targets.length) {
                // ONLY the real expiring invite — no direct add, ever.
                const sent = [];
                for (const jid of targets) {
                    try {
                        await sock.sendMessage(jid, {
                            text:
                                `ᯤ *${groupName}*\n\n` +
                                `You've been invited to this WhatsApp group.\n` +
                                `_This link is real and expires — use it before it does._\n\n` +
                                inviteLink,
                            linkPreview: true
                        });
                        sent.push(jid);
                    } catch (e) {
                        console.error('[INVITE DM ERROR]', e?.message || e);
                    }
                    await new Promise(r => setTimeout(r, 400));
                }

                return reply(
                    sent.length
                        ? `_*📩 Real invite link sent to:*_\n${sent.map(j => `✦ @${j.split('@')[0]}`).join('\n')}\n\n_Expires — nobody was added directly._`
                        : '_✘ Could not send the invite to anyone_'
                );
            }

            // ── No targets → drop the real link right here in the group ──
            await sock.sendMessage(m.chat, {
                text: inviteLink,
                linkPreview: true
            }, { quoted: m });

        } catch (e) {
            console.error('[GLINK ERROR]', e);
            reply(`${prefix}𓆉 Error: ${e?.message || e}`);
        }
    }
};
