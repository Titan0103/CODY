// tkick.js — temporary kick. The user is removed from the group and gets
// added back on their own once the timer runs out. Works standalone and as
// an action for all the anti systems. @crysnovax—FIX06-08-26
const fs = require('fs');
const path = require('path');

const TKICK_FILE = path.join(process.cwd(), 'database', 'tkicks.json');

const timers = new Map();

function loadKicks() {
    try {
        if (fs.existsSync(TKICK_FILE)) return JSON.parse(fs.readFileSync(TKICK_FILE, 'utf8'));
    } catch {}
    return {};
}

let kicks = loadKicks();

function saveKicks() {
    try {
        fs.mkdirSync(path.dirname(TKICK_FILE), { recursive: true });
        fs.writeFileSync(TKICK_FILE, JSON.stringify(kicks, null, 2));
    } catch (err) {
        console.error('[TKICK] save failed:', err.message);
    }
}

// '5m', '2h', '30s', '1d' -> ms
function parseTime(str) {
    const match = String(str || '').match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(match[1]) * map[match[2].toLowerCase()];
}

function cleanup(group, user) {
    const key = `${group}:${user}`;
    if (timers.has(key)) {
        clearTimeout(timers.get(key));
        timers.delete(key);
    }
    if (kicks[group]?.[user]) {
        delete kicks[group][user];
        if (!Object.keys(kicks[group]).length) delete kicks[group];
        saveKicks();
    }
}

// When the user's privacy settings block direct adds, fall back to sending a
// group invite link to their DM so they can join back themselves.
// (@crysnovax—FIX08-07-26)
async function sendInviteFallback(sock, group, user) {
    try {
        if (typeof sock.groupInviteCode !== 'function') return false;
        const code = await sock.groupInviteCode(group);
        if (!code) return false;
        const meta = await sock.groupMetadata(group).catch(() => null);
        const name = meta?.subject || 'the group';
        await sock.sendMessage(user, {
            text: `ᯤ *${name}* — your temp kick is over, but the bot couldn't add you back directly (privacy settings).\n\nJoin again here:\nhttps://chat.whatsapp.com/${code}`
        });
        return true;
    } catch (err) {
        console.error('[TKICK] invite fallback failed:', err.message);
        return false;
    }
}

// Returns true ONLY when the user is actually back in the group — the bot
// must never announce an add that didn't happen (@crysnovax—FIX08-07-26).
// FIX12-08-26: adds now use the canonical PHONE jid (LID adds can silently
// fail) and the verification compares phone digits only — group metadata
// participants may be @lid or @s.whatsapp.net, so a strict jid equality
// match used to report "not added" and the re-add never landed.
async function reAdd(sock, group, user) {
    try {
        // prefer the real phone jid for the add
        let jid = user;
        try {
            const { resolvePhoneJid } = require('./identityUtils');
            const resolved = await resolvePhoneJid(sock, [user]);
            if (resolved) jid = resolved;
        } catch {}

        if (typeof sock.groupParticipantsUpdate === 'function') {
            await sock.groupParticipantsUpdate(group, [jid], 'add');
        }

        // give the server a moment, then verify via fresh metadata
        await new Promise(r => setTimeout(r, 2500));
        const meta = await sock.groupMetadata(group).catch(() => null);
        if (!meta?.participants) return false;

        const digits = (j = '') => String(j || '').replace(/:\d+@/g, '@').split('@')[0].replace(/\D/g, '');
        const { identityVariants, normalizeJid } = require('./identityUtils');

        // The re-added user can appear in group metadata as their PHONE jid
        // OR their @lid jid (LID digits ≠ phone digits, so a plain digit
        // comparison used to miss them and we'd send the invite fallback even
        // though the add had succeeded). Build the set of every digit variant
        // we know for the user (phone + lid) and match each participant
        // against it, resolving their lid→phone too. (@crysnovax—FIX12-08-26)
        const userDigitsSet = new Set([digits(jid)]);
        try {
            for (const v of await identityVariants(sock, jid)) userDigitsSet.add(digits(v));
        } catch {}

        for (const p of meta.participants) {
            const ids = [p.id, p.lid, p.jid].filter(Boolean).map(normalizeJid);
            for (const id of ids) {
                if (userDigitsSet.has(digits(id))) return true;
                try {
                    for (const v of await identityVariants(sock, id)) {
                        if (userDigitsSet.has(digits(v))) return true;
                    }
                } catch {}
            }
        }
        return false;
    } catch (err) {
        console.error('[TKICK] re-add failed:', err.message);
        return false;
    }
}

async function scheduleReAdd(sock, group, user) {
    const entry = kicks[group]?.[user];
    if (!entry) return;

    const remaining = entry.until - Date.now();
    if (remaining <= 0) {
        cleanup(group, user);
        return;
    }

    const key = `${group}:${user}`;
    if (timers.has(key)) clearTimeout(timers.get(key));

    timers.set(key, setTimeout(async () => {
        const added = await reAdd(sock, group, user);
        if (!added) {
            // Direct add not confirmed — most likely privacy settings block it.
            // Send a group invite to their DM instead of silently failing.
            const invited = await sendInviteFallback(sock, group, user);
            if (invited) {
                try {
                    await sock.sendMessage(group, {
                        text: `ᯤ @${user.split('@')[0]} couldn't be added back automatically — invite sent instead.`,
                        mentions: [user]
                    });
                } catch {}
                cleanup(group, user);
                return;
            }
            // no invite possible either — re-arm so we retry instead of lying
            console.log(`[TKICK] re-add of ${user} not confirmed, retrying…`);
            scheduleReAdd(sock, group, user);
            return;
        }
        try {
            await sock.sendMessage(group, {
                text: `ᯤ @${user.split('@')[0]} auto re-added after the temp kick`,
                mentions: [user]
            });
        } catch {}
        cleanup(group, user);
    }, remaining));
}

async function tkick(sock, group, user, ms, reason = 'Temp kick') {
    if (isTkicked(group, user)) return false;

    if (!ms || ms <= 0) ms = 5 * 60 * 1000; // default 5 minutes

    kicks[group] = kicks[group] || {};
    kicks[group][user] = { until: Date.now() + ms, reason, time: Date.now() };
    saveKicks();

    try {
        if (typeof sock.groupParticipantsUpdate === 'function') {
            await sock.groupParticipantsUpdate(group, [user], 'remove');
        }
    } catch (err) {
        console.error('[TKICK] kick failed:', err.message);
    }

    await scheduleReAdd(sock, group, user);
    return true;
}

function isTkicked(group, user) {
    const entry = kicks[group]?.[user];
    if (!entry) return false;
    if (Date.now() > entry.until) {
        cleanup(group, user);
        return false;
    }
    return true;
}

// Bring a kicked user back right away (undo).
async function undo(sock, group, user) {
    await reAdd(sock, group, user);
    cleanup(group, user);
}

// Re-arm timers for kicks that were mid-flight when the bot restarted.
function setupTkicks(sock) {
    for (const group of Object.keys(kicks)) {
        for (const user of Object.keys(kicks[group] || {})) {
            scheduleReAdd(sock, group, user);
        }
    }
    if (Object.keys(kicks).length) console.log('[TKICK] restored pending temp kicks');
}

module.exports = { tkick, undo, isTkicked, parseTime, setupTkicks };
