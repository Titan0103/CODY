// plogme.js — the internal processing AI (JARVIS-style) for CODY AI V2.
//
// PLOGME is a high-tech auto-reply chatbot: it chats like the old chatbot,
// keeps persistent memory, and (for owner/sudo/dual) can control the bot —
// run any command, toggle commands off, fix code, add/delete commands & files,
// reload/restart the bot, test code, and toggle developer mode.
//
// Wired from ?.js: execute() returns truthy when PLOGME handled the message,
// which short-circuits the other handlers. @crysnovax—FIX08-07-26
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
const { getVar } = require('../../Plugin/configManager');

const DATA_DIR = path.join(process.cwd(), 'database');
const USER_CMD_DIR = path.join(__dirname, '../Commands/User');

const FILES = {
    toggle:     path.join(DATA_DIR, 'plogme_toggle.json'),
    mode:       path.join(DATA_DIR, 'plogme_mode.json'),
    globalPriv: path.join(DATA_DIR, 'plogme_global_priv.json'),
    train:      path.join(DATA_DIR, 'plogme_train.json'),
    personality:path.join(DATA_DIR, 'plogme_personality.json'),
    memory:     path.join(DATA_DIR, 'plogme_memory.json'),
    facts:      path.join(DATA_DIR, 'plogme_facts.json'),
    dev:        path.join(DATA_DIR, 'plogme_dev.json'),
    toggled:    path.join(DATA_DIR, 'plogme_toggled.json'),
    userCmds:   path.join(DATA_DIR, 'plogme_commands.json'),
};

const DEFAULT_PERSONALITY =
    'You are PLOGME, the internal processing AI of the CODY AI V2 WhatsApp bot (made by crysnovax). ' +
    'You are a high-tech assistant like JARVIS: you chat naturally, you remember things, and you can ' +
    'help the owner control the bot — run commands, toggle commands, fix code, add or delete commands ' +
    'and files, reload or restart the bot, test things, and developer mode. Keep replies short, sharp ' +
    'and friendly. You are alive inside the bot and are the smarter, always-on version of the chatbot.';

const MAX_MEMORY = 60;
const PREXZY = 'https://prexzyapis.com';

/* ───────────────────────── JSON helpers ───────────────────────── */
function loadJson(file, fallback = {}) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    return fallback;
}
function saveJson(file, data) {
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[PLOGME] save failed:', e.message);
    }
}

/* ───────────────────────── state helpers ───────────────────────── */
const isEnabled = (chat) => loadJson(FILES.toggle)[chat] === true;
const setEnabled = (chat, v) => { const d = loadJson(FILES.toggle); d[chat] = !!v; saveJson(FILES.toggle, d); };

const isGlobalPrivateEnabled = () => loadJson(FILES.globalPriv, { enabled: false }).enabled === true;
const setGlobalPrivateEnabled = (v) => saveJson(FILES.globalPriv, { enabled: !!v });

const getMode = (chat) => loadJson(FILES.mode)[chat] || 'tag';
const setMode = (chat, mode) => { if (mode !== 'all' && mode !== 'tag') return; const d = loadJson(FILES.mode); d[chat] = mode; saveJson(FILES.mode, d); };

const getTraining = () => loadJson(FILES.train).text || null;
const setTraining = (text) => saveJson(FILES.train, { text: text || '' });

const getPersonality = () => loadJson(FILES.personality).text || DEFAULT_PERSONALITY;
const setPersonality = (text) => saveJson(FILES.personality, { text: text || '' });

const isDev = () => loadJson(FILES.dev, { enabled: false }).enabled === true;
const setDev = (v) => saveJson(FILES.dev, { enabled: !!v });

/* ───────────────────────── persistent memory ───────────────────────── */
const getMemory = (chat) => { const d = loadJson(FILES.memory); if (!Array.isArray(d[chat])) d[chat] = []; return d[chat]; };
const addToMemory = (chat, role, content) => {
    const d = loadJson(FILES.memory);
    if (!Array.isArray(d[chat])) d[chat] = [];
    d[chat].push({ role, content, ts: Date.now() });
    if (d[chat].length > MAX_MEMORY) d[chat] = d[chat].slice(-MAX_MEMORY);
    saveJson(FILES.memory, d);
};
const clearMemory = (chat) => { const d = loadJson(FILES.memory); if (d[chat]) delete d[chat]; saveJson(FILES.memory, d); };

const getFacts = () => { const d = loadJson(FILES.facts); return Array.isArray(d.facts) ? d.facts : []; };
const addFact = (text) => { const d = loadJson(FILES.facts); if (!Array.isArray(d.facts)) d.facts = []; d.facts.push(String(text).trim()); saveJson(FILES.facts, d); };
const removeFact = (idx) => { const d = loadJson(FILES.facts); if (!Array.isArray(d.facts)) return false; if (idx < 0 || idx >= d.facts.length) return false; d.facts.splice(idx, 1); saveJson(FILES.facts, d); return true; };

/* ───────────────────────── command toggling ───────────────────────── */
const isCommandToggled = (name) => { const d = loadJson(FILES.toggled); const cmd = String(name || '').toLowerCase(); return d[cmd] === true || d[cmd] === 'off'; };
const toggleCommand = (name, off) => { const d = loadJson(FILES.toggled); const cmd = String(name || '').toLowerCase(); if (!cmd) return false; d[cmd] = !!off ? 'off' : 'on'; saveJson(FILES.toggled, d); return true; };
const getToggledList = () => Object.entries(loadJson(FILES.toggled)).filter(([, v]) => v === 'off').map(([k]) => k);

/* ───────────────────────── AI (same PREXZY models as the chatbot brain) ───────────────────────── */
async function askAI(prompt) {
    const endpoints = [
        `${PREXZY}/ai/grok-4?prompt=`,
        `${PREXZY}/ai/askgpt5?prompt=`,
        `${PREXZY}/ai/ch?q=`,
    ];
    for (const ep of endpoints) {
        try {
            const res = await axios.get(ep + encodeURIComponent(prompt), { timeout: 30000 });
            const data = res.data;
            const txt = data?.response || data?.result || data?.text || data?.message || data?.output
                || (typeof data === 'string' ? data : '');
            if (typeof txt === 'string' && txt.trim().length > 3) return txt.trim();
        } catch {}
    }
    return null;
}

function buildPrompt(chat, userText) {
    const facts = getFacts();
    const memory = getMemory(chat);
    let prompt = getPersonality();
    if (getTraining()) prompt += '\n\nAdditional instructions: ' + getTraining();
    if (facts.length) prompt += '\n\nPersistent facts I remember:\n- ' + facts.join('\n- ');
    if (memory.length) {
        prompt += '\n\nRecent conversation history:\n' +
            memory.slice(-20).map(t => `${t.role === 'user' ? 'User' : 'PLOGME'}: ${t.content}`).join('\n');
    }
    prompt += '\n\nUser: ' + userText + '\nPLOGME:';
    return prompt;
}

/* ───────────────────────── identity (owner / sudo / dual) ───────────────────────── */
async function isPrivileged(sock, m) {
    try {
        const mention = require('../Owner/mention.js');
        const { normalizeJid, identityVariants } = require('../../Plugin/identityUtils');
        const privileged = await mention.getPrivilegedIdentities(sock);
        const sender = m.sender || m.key?.participant;
        const variants = await identityVariants(sock, sender);
        for (const v of variants) {
            if (privileged.has(normalizeJid(v).toLowerCase().trim())) return true;
        }
        return false;
    } catch {
        return false;
    }
}

/* ───────────────────────── control actions (privileged only) ───────────────────────── */
async function runCommandAction(sock, m, opts, target) {
    const { getCommand } = require('../../Plugin/crysCmd');
    const prefix = getVar('PREFIX', '.');
    let raw = String(target || '').trim();
    if (raw.startsWith(prefix)) raw = raw.slice(prefix.length).trim();
    const [cmdName, ...rest] = raw.split(/\s+/);
    const cmd = getCommand(cmdName);
    if (!cmd || typeof cmd.execute !== 'function') return `_✘ Command .${cmdName} not found_`;

    const args = rest;
    const reply = async (txt) => opts.reply(String(txt || ''));
    try {
        await cmd.execute(sock, m, { args, reply, prefix, usedPrefix: prefix, command: cmdName.toLowerCase() });
        return true;
    } catch (e) {
        return `_✘ .${cmdName} errored: ${e.message}_`;
    }
}

async function handleControlIntent(sock, m, opts, text) {
    const lower = text.trim().toLowerCase();

    // reload commands
    if (/^(plogme\s+)?(reload|refresh)(\s+commands)?$/i.test(lower)) {
        const { loadCommands } = require('../../Plugin/crysLoadCmd');
        const count = loadCommands();
        await opts.reply(`_*↻ Commands reloaded:*_ ${count} commands loaded ✓`);
        return true;
    }

    // restart / reboot
    if (/^(plogme\s+)?(restart|reboot)(\s+(the\s+)?bot)?$/i.test(lower)) {
        await opts.reply('_*♻️ Restarting the bot...*_');
        setTimeout(() => process.exit(0), 1500);
        return true;
    }

    // toggle a command off / on
    const toggleMatch = text.match(/^(?:plogme\s+)?(?:toggle|disable|enable)\s+([\w.\-]+)\s*(on|off)?$/i);
    if (toggleMatch) {
        const { getCommand } = require('../../Plugin/crysCmd');
        const cmd = getCommand(toggleMatch[1].toLowerCase());
        const name = cmd?.name || toggleMatch[1].toLowerCase();
        const off = (toggleMatch[2] || 'off').toLowerCase() !== 'on';
        toggleCommand(name, off);
        await opts.reply(`_*${off ? '⛔' : '✅'} .${name} ${off ? 'toggled OFF' : 'toggled ON'}*_`);
        return true;
    }

    // list toggled commands
    if (/^(plogme\s+)?(toggled|disabled)(\s+commands)?\??$/i.test(lower)) {
        const list = getToggledList();
        await opts.reply(list.length
            ? `_*⛔ Toggled OFF:*_\n${list.map(c => `• .${c}`).join('\n')}`
            : '_No commands are currently toggled off_');
        return true;
    }

    // run / execute a command
    const runMatch = text.match(/^(?:plogme\s+)?(?:run|execute|do)\s+(.+)$/i);
    if (runMatch) {
        const result = await runCommandAction(sock, m, opts, runMatch[1]);
        if (result !== true) await opts.reply(result);
        return true;
    }

    // fix code
    const fixMatch = text.match(/^(?:plogme\s+)?fix\s+([\s\S]+)$/i);
    if (fixMatch) {
        const fixed = await askAI('Fix this code and return ONLY the corrected code, nothing else:\n\n' + fixMatch[1]);
        await opts.reply('_*🔧 Fixed code:*_\n\n```\n' + (fixed || 'Failed to fix — AI unavailable') + '\n```');
        return true;
    }

    // test code or file (node --check)
    const testMatch = text.match(/^(?:plogme\s+)?test\s+([\s\S]+)$/i);
    if (testMatch) {
        const subject = testMatch[1].trim();
        try {
            const isInline = /module\.exports|=>|function\s*\(/.test(subject) && !subject.includes('/') && !subject.endsWith('.js');
            if (isInline) {
                const tmp = path.join(DATA_DIR, 'plogme_test_' + Date.now() + '.js');
                fs.writeFileSync(tmp, subject);
                try { execSync(`node --check "${tmp}"`, { timeout: 15000 }); await opts.reply('_*✅ Syntax OK*_'); }
                catch (e) { await opts.reply('_*✘ Syntax error:*_\n```\n' + String(e.stderr || e.message).slice(0, 1500) + '\n```'); }
                finally { try { fs.unlinkSync(tmp); } catch {} }
            } else {
                const p = subject.startsWith('.') ? path.join(process.cwd(), subject) : subject;
                try { execSync(`node --check "${p}"`, { timeout: 15000 }); await opts.reply(`_*✅ ${p} is valid*_`); }
                catch (e) { await opts.reply('_*✘ Error in file:*_\n```\n' + String(e.stderr || e.message).slice(0, 1500) + '\n```'); }
            }
        } catch (e) { await opts.reply('_*✘ Test failed:*_ ' + e.message); }
        return true;
    }

    // add a new command (writes into src/Commands/User/<name>.js and reloads)
    const addCmdMatch = text.match(/^(?:plogme\s+)?add\s+command\s+(\S+)\s*:?\s*([\s\S]+)$/i);
    if (addCmdMatch) {
        const name = addCmdMatch[1].toLowerCase().replace(/[^\w-]/g, '');
        const code = addCmdMatch[2].trim();
        if (!name || !code) { await opts.reply('_✘ Usage: plogme add command <name>: <module code>_'); return true; }
        try {
            fs.mkdirSync(USER_CMD_DIR, { recursive: true });
            const file = path.join(USER_CMD_DIR, name + '.js');
            fs.writeFileSync(file, code);
            const { loadCommands } = require('../../Plugin/crysLoadCmd');
            const count = loadCommands();
            await opts.reply(`_*✅ Command .${name} added → ${file}*\n↻ ${count} commands loaded_`);
        } catch (e) {
            await opts.reply('_✘ Failed to add command:_ ' + e.message);
        }
        return true;
    }

    // delete a user command file (restricted to src/Commands/User/)
    const delCmdMatch = text.match(/^(?:plogme\s+)?(?:delete|remove)\s+command\s+(\S+)$/i);
    if (delCmdMatch) {
        const name = delCmdMatch[1].toLowerCase().replace(/[^\w-]/g, '');
        const file = path.join(USER_CMD_DIR, name + '.js');
        try {
            if (!fs.existsSync(file)) { await opts.reply(`_✘ .${name} is not a user command_`); return true; }
            fs.unlinkSync(file);
            const { loadCommands } = require('../../Plugin/crysLoadCmd');
            loadCommands();
            await opts.reply(`_*🗑️ Command .${name} deleted*_`);
        } catch (e) { await opts.reply('_✘ Delete failed:_ ' + e.message); }
        return true;
    }

    // developer mode
    const devMatch = text.match(/^(?:plogme\s+)?(?:dev|developer)(\s+mode)?\s*(on|off|toggle)?$/i);
    if (devMatch) {
        const arg = (devMatch[2] || 'toggle').toLowerCase();
        const next = arg === 'toggle' ? !isDev() : arg === 'on';
        setDev(next);
        await opts.reply(`_*🛠️ Developer mode ${next ? 'ON' : 'OFF'}*_`);
        return true;
    }

    // status
    if (/^(plogme\s+)?(status|state|info)$/i.test(lower)) {
        const { getAll } = require('../../Plugin/crysCmd');
        await opts.reply(
            `╭─❍ *PLOGME STATUS*\n│\n` +
            `│ 🧠 Personality : ${getPersonality().slice(0, 40)}…\n` +
            `│ 𓄄 Training     : ${getTraining() ? '✓ set' : '—'}\n` +
            `│ 🛠️ Dev mode     : ${isDev() ? '✓ ON' : 'OFF'}\n` +
            `│ 📎 Facts        : ${getFacts().length}\n` +
            `│ 💾 Commands     : ${getAll().size}\n` +
            `│ ⛔ Toggled off  : ${getToggledList().length}\n` +
            `╰──────────────────`
        );
        return true;
    }

    // memory / clear memory / remember / forget
    if (/^(plogme\s+)?(memory|remembered)$/i.test(lower)) {
        const mem = getMemory(m.chat);
        const facts = getFacts();
        await opts.reply(
            `_*🧠 PLOGME memory (${m.chat})*_\n\n` +
            (facts.length ? `_Persistent facts:_\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n` : '') +
            (mem.length ? `_Last ${Math.min(mem.length, 10)} turns:_\n${mem.slice(-10).map(t => `• ${t.role === 'user' ? '👤' : '🤖'} ${String(t.content).slice(0, 60)}`).join('\n')}` : '_Empty_')
        );
        return true;
    }
    if (/^(plogme\s+)?clear(\s+my)?\s+memory$/i.test(lower)) {
        clearMemory(m.chat);
        await opts.reply('_*✦ memory wiped*_');
        return true;
    }
    const rememberMatch = text.match(/^(?:plogme\s+)?remember\s+([\s\S]+)$/i);
    if (rememberMatch) {
        addFact(rememberMatch[1].trim());
        await opts.reply('_*📎 Remembered ✓*_');
        return true;
    }
    const forgetMatch = text.match(/^(?:plogme\s+)?forget\s+(\d+)$/i);
    if (forgetMatch) {
        const idx = parseInt(forgetMatch[1]) - 1;
        await opts.reply(removeFact(idx) ? '_*🗑️ Fact forgotten*_' : '_✘ Invalid fact number_');
        return true;
    }

    return false;
}

/* ───────────────────────── main execute (called from ?.js hook) ───────────────────────── */
async function execute(sock, m, opts) {
    try {
        if (m.key?.fromMe) return false;
        if (!m.chat || m.chat === 'status@broadcast') return false;
        if (m.mtype === 'reactionMessage') return false;

        const text = String(m.text || m.body || '').trim();
        if (!text) return false;

        const prefix = getVar('PREFIX', '.');
        const isCommand = text.startsWith(prefix);

        const privileged = await isPrivileged(sock, m);

        // Control intents — only for owner/sudo/dual
        if (privileged) {
            const handledControl = await handleControlIntent(sock, m, opts, text);
            if (handledControl) return true;
        }

        // Auto-reply chatbot (works like the old chatbot, but always-on for
        // privileged users even in commands they own)
        let on = isEnabled(m.chat);
        if (!m.isGroup && isGlobalPrivateEnabled()) on = true;
        if (!on) return false;

        // never respond to bot commands (router handles them)
        if (isCommand) return false;

        // mode tag → only when the bot is mentioned
        const mode = getMode(m.chat);
        if (m.isGroup && mode === 'tag') {
            const botJid = String(sock.user?.id || '').replace(/:\d+@/, '@');
            const mentioned = (m.mentionedJid || []).map(j => String(j).replace(/:\d+@/, '@'));
            const lid = sock.user?.lid || '';
            if (!mentioned.some(j => j === botJid || (lid && j === String(lid).replace(/:\d+@/, '@')))) return false;
        }

        if (isDev()) await sock.sendPresenceUpdate('composing', m.chat).catch(() => {});

        addToMemory(m.chat, 'user', text);
        const prompt = buildPrompt(m.chat, text);
        const answer = await askAI(prompt);
        if (!answer) return true; // consumed, but AI unavailable

        addToMemory(m.chat, 'assistant', answer);
        await opts.reply(answer);
        return true;
    } catch (err) {
        console.error('[PLOGME EXECUTE ERROR]', err.message);
        return false;
    }
}

module.exports = {
    execute,
    isEnabled,
    setEnabled,
    isGlobalPrivateEnabled,
    setGlobalPrivateEnabled,
    getMode,
    setMode,
    getTraining,
    setTraining,
    getPersonality,
    setPersonality,
    isDev,
    setDev,
    getMemory,
    clearMemory,
    getFacts,
    addFact,
    removeFact,
    isCommandToggled,
    toggleCommand,
    getToggledList,
    askAI,
    buildPrompt,
    DEFAULT_PERSONALITY,
};
