// mutesticker.js — bans ONE specific sticker. Only that exact sticker gets
// deleted everywhere in the group, everything else passes.
// Deleting ALL stickers from a user is now muteallsticker.
// @crysnovax—FIX06-08-26
const fs = require('fs');
const path = require('path');

const STICKER_MUTE_FILE = path.join(__dirname, '../../database/mutedStickers.json');

const initDb = () => {
    const dir = path.dirname(STICKER_MUTE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STICKER_MUTE_FILE)) fs.writeFileSync(STICKER_MUTE_FILE, '{}');
};

const getMutedDb = () => {
    initDb();
    try { return JSON.parse(fs.readFileSync(STICKER_MUTE_FILE, 'utf8')); } catch { return {}; }
};

const saveMutedDb = data => {
    fs.writeFileSync(STICKER_MUTE_FILE, JSON.stringify(data, null, 2));
};

// Unique identity of a sticker = its fileSha256.
// The quoted message is the UNWRAPPED sticker content (see library/serialize.js),
// so the hash lives at target.fileSha256 directly — not target.message.stickerMessage.
// (@crysnovax—FIX08-07-26)
const hashOf = (m) => {
    try {
        const raw = m?.message?.stickerMessage?.fileSha256
            || m?.msg?.stickerMessage?.fileSha256
            || m?.fileSha256;
        if (!raw) return null;
        return Buffer.isBuffer(raw) ? raw.toString('hex') : String(raw);
    } catch {
        return null;
    }
};

module.exports = {
    name: 'mutesticker',
    alias: ['stickerban', 'bansticker', 'unmutesticker'],
    category: 'Group',
    desc: 'Ban one specific sticker — only that sticker gets deleted',
    reactions: { start: '🗯️', success: '🚫' },

    execute: async (sock, m, { args, reply, prefix, isGroup }) => {
        if (!isGroup) return reply('✘ _*This command works only in groups*_');

        const db = getMutedDb();
        const chatId = m.chat;
        if (!db[chatId]) db[chatId] = { enabled: true, hashes: {} };
        const cfg = db[chatId];
        if (!cfg.hashes) cfg.hashes = {};
        if (typeof cfg.enabled === 'undefined') cfg.enabled = true;

        const sub = (args[0] || '').toLowerCase();

        // NOTE: no more "on"/"off" — this command only bans ONE specific
        // sticker (like muteallsticker but per-sticker). (@crysnovax—FIX08-07-26)
        if (sub === 'list') {
            const entries = Object.entries(cfg.hashes);
            if (!entries.length) return reply('_No banned stickers in this group_');
            const lines = entries.map(([h, info], i) =>
                `${i + 1}. \`${h.slice(0, 12)}…\`${info?.reason && info.reason !== 'banned sticker' ? ' — ' + info.reason : ''}`
            ).join('\n');
            return reply(`*Banned stickers (${entries.length})*\n\n${lines}\n\n${prefix}mutesticker remove <number>`);
        }
        if (sub === 'remove' && args[1]) {
            const entries = Object.keys(cfg.hashes);
            const idx = parseInt(args[1], 10) - 1;
            if (isNaN(idx) || idx < 0 || idx >= entries.length) return reply('_✘ Invalid number_');
            delete cfg.hashes[entries[idx]];
            saveMutedDb(db);
            return reply('_✓ Sticker un-banned_');
        }
        if (sub === 'clear') {
            cfg.hashes = {};
            saveMutedDb(db);
            return reply('_✓ All sticker bans cleared_');
        }

        // default: ban the quoted sticker (or the sticker in the command message)
        const target = m.quoted || m;
        const hash = hashOf(target);
        if (!hash) {
            return reply(
                `✘ Reply to the sticker you want to ban\n\nUsage:\n` +
                `${prefix}mutesticker (reply to a sticker)\n` +
                `${prefix}mutesticker list\n` +
                `${prefix}mutesticker remove <n>\n` +
                `${prefix}mutesticker clear`
            );
        }
        if (cfg.hashes[hash]) return reply('_✘ That sticker is already banned_');

        cfg.hashes[hash] = { addedBy: m.sender, time: Date.now(), reason: 'banned sticker' };
        saveMutedDb(db);
        return reply('_✓ Sticker banned — it gets deleted the moment anyone sends it_');
    }
};

/* ================= STICKER MESSAGE HANDLER ================= */

module.exports.handleMutedSticker = async (sock, m, isGroup) => {
    if (!isGroup) return false;

    const db = getMutedDb();
    const chatId = m.chat;
    const cfg = db[chatId];
    if (!cfg || !cfg.enabled || !cfg.hashes) return false;

    const isSticker = m.mtype === 'stickerMessage' ||
                      Object.keys(m.message || {})[0] === 'stickerMessage';
    if (!isSticker) return false;

    const hash = hashOf(m);
    if (!hash) return false;
    if (!cfg.hashes[hash]) return false;

    try {
        await sock.sendMessage(chatId, { delete: m.key });
        return true;
    } catch (err) {
        console.error('[STICKER BAN DELETE ERROR]', err.message);
        return false;
    }
};

module.exports.isStickerBanned = (chatId, hash) => {
    const db = getMutedDb();
    return !!db[chatId]?.hashes?.[hash];
};
