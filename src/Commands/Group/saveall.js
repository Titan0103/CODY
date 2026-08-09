// saveall.js — save every number in the group.
// Builds a real .vcf contact file with ALL members and sends it as a document,
// so the user can import everyone's number in one tap. Alias: export.
// @crysnovax—FIX09-08-26
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'saveall',
    alias: ['export', 'exportvcf', 'savecontacts', 'vcfall'],
    desc: 'Save every number in the group as contacts (.vcf file)',
    category: 'Group',
    groupOnly: true,
    usage: '.saveall | .export',
    reactions: { start: '📇', success: '💾' },

    execute: async (sock, m, { reply, store }) => {
        try {
            if (!m.isGroup) return reply('`⟁⃝GROUP ONLY!℘`');

            const meta = await sock.groupMetadata(m.chat);
            const participants = meta.participants || [];
            if (!participants.length) return reply('_✘ No members found in this group_');

            const groupName = meta.subject || 'Group';

            // Best-effort contact name from the store (falls back to the number)
            const getName = (jid) => {
                const clean = String(jid || '').replace(/:\d+@/, '@');
                const phone = clean.split('@')[0];
                try {
                    const contacts = store?.contacts;
                    const c = contacts instanceof Map ? contacts.get(clean) : contacts?.[clean];
                    const nm = c?.name || c?.notify || c?.verifiedName;
                    if (nm && String(nm).trim()) return String(nm).trim();
                } catch {}
                return phone;
            };

            let vcf = '';
            for (const p of participants) {
                const clean = String(p.id || '').replace(/:\d+@/, '@');
                if (!clean.includes('@s.whatsapp.net')) continue;
                const phone = clean.split('@')[0];
                if (!phone || phone.length < 7) continue;
                const name = getName(clean);
                vcf +=
                    'BEGIN:VCARD\n' +
                    'VERSION:3.0\n' +
                    `FN:${name}\n` +
                    `TEL;TYPE=CELL:+${phone}\n` +
                    'END:VCARD\n';
            }

            if (!vcf) return reply('_✘ Could not build contact list for this group_');

            const tempDir = path.join(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const filePath = path.join(tempDir, `contacts_${Date.now()}.vcf`);
            fs.writeFileSync(filePath, vcf, 'utf8');

            const total = (vcf.match(/BEGIN:VCARD/g) || []).length;

            await sock.sendMessage(m.chat, {
                document: fs.readFileSync(filePath),
                fileName: `${groupName.replace(/[^\w\- ]+/g, '').trim() || 'Group'}_contacts.vcf`,
                mimetype: 'text/vcard',
                caption:
                    `╭─❍ *SAVE ALL* 𓉤\n│\n` +
                    `│ 💾 ${total} contact(s) from\n` +
                    `│ 𓄄 ${groupName}\n│\n` +
                    `│ _Import the .vcf to save every\n` +
                    `│  number in one tap._\n` +
                    `╰──────────────────`
            }, { quoted: m });

            fs.unlinkSync(filePath);

        } catch (err) {
            console.error('[SAVEALL ERROR]', err.message);
            reply(`_✘ Failed to export contacts: ${err?.message || err}_`);
        }
    }
};
