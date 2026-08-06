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

async function reAdd(sock, group, user) {
    try {
        if (typeof sock.groupParticipantsUpdate === 'function') {
            await sock.groupParticipantsUpdate(group, [user], 'add');
        }
    } catch (err) {
        console.error('[TKICK] re-add failed:', err.message);
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
        await reAdd(sock, group, user);
        try {
            await sock.sendMessage(group, {
                text: `🔁 @${user.split('@')[0]} auto re-added after the temp kick`,
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
