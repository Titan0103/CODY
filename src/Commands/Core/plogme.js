// plogme.js — the internal processing AI (JARVIS-style) for CODY AI V2.
//
// PLOGME is a high-tech auto-reply chatbot: it chats like the old chatbot,
// keeps persistent memory, and (for owner/sudo/dual) can control the bot —
// run any command, toggle commands off, fix code, add/delete commands & files,
// reload/restart the bot, test code, and toggle developer mode.
//
// FIX09-08-26 (agent upgrade):
//   • PLOGME never triggers its own help menu. "plogme" / "plg" / "plog" are
//     reserved self-names and are excluded from the lenient "run this command"
//     matcher (previously a bare "plogme" was treated as a runnable command,
//     which dumped the whole menu back at the user).
//   • LLM-driven intent brain: when the AI is reachable, PLOGME classifies
//     privileged messages into structured actions — run a command mentioned
//     inside a sentence, create/edit/delete .js files, return generated code,
//     fix/test code, toggle, reload, restart — no hardcoded phrasing required.
//   • Agent self-fix loop: every .js file PLOGME writes or edits is syntax
//     checked with `node --check`; if it fails, PLOGME asks the AI to correct
//     it (up to 3 attempts) before reloading commands.
//   • Operation memory: file/command actions are logged to
//     database/plogme_ops.json and surfaced in the AI context so PLOGME
//     remembers what it changed and can learn from it.
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
const ROOT = process.cwd();

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
    ops:        path.join(DATA_DIR, 'plogme_ops.json'),
};

const DEFAULT_PERSONALITY =
    'You are PLOGME, the internal processing AI of the CODY AI V2 WhatsApp bot (made by crysnovax). ' +
    'You are a high-tech assistant like JARVIS: you chat naturally, you remember things, and you can ' +
    'help the owner control the bot — run commands, toggle commands, fix code, add or delete commands ' +
    'and files, reload or restart the bot, test things, and developer mode. Keep replies short, sharp ' +
    'and friendly. You are alive inside the bot and are the smarter, always-on version of the chatbot.';

const MAX_MEMORY = 60;
const PREXZY = 'https://prexzyapis.com';

// PLOGME's own names — it must NEVER try to "run" itself (that dumped the menu).
const SELF_NAMES = new Set(['plogme', 'plg', 'plog']);

// Files that PLOGME refuses to delete — deleting these would brick the bot.
const PROTECTED_FILES = new Set([
    'index.js', '⚉.js', '☁︎.js', '?.js', 'redirect.js',
    'package.json', 'package-lock.json', 'render.yaml', 'vercel.json', 'app.json',
]);
const FORBIDDEN_DIRS = /(^|\/)(node_modules|sessions|\.git)(\/|$)/;

// Invisible-character marker. EVERY message this bot sends carries it (see
// ?.js sendMessage override + the reply hook), so any message containing it
// is the bot's own output and must never be auto-replied to.
const MARKER = '\u200E';

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
const hasExplicitToggle = (chat) => Object.prototype.hasOwnProperty.call(loadJson(FILES.toggle), chat);
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

/* ───────────────────────── operation memory (agent actions) ───────────────────────── */
const getOps = () => { const d = loadJson(FILES.ops); return Array.isArray(d.ops) ? d.ops : []; };
const logOp = (type, summary) => {
    const d = loadJson(FILES.ops);
    if (!Array.isArray(d.ops)) d.ops = [];
    d.ops.push({ type: String(type || 'op'), summary: String(summary || '').slice(0, 200), ts: Date.now() });
    if (d.ops.length > 30) d.ops = d.ops.slice(-30);
    saveJson(FILES.ops, d);
};

/* ───────────────────────── command toggling ───────────────────────── */
// The command-toggle list is for OTHER commands only. PLOGME itself must
// never be written into it — doing so made the ?.js pre-router block eat
// every ".plogme ..." message with "⛔ .plogme is toggled OFF by plogme" and
// locked the toggle (the command could never reach the handler to turn it
// back on). These helpers now hard-ignore the self-names, which also
// auto-heals any chat that already has a stale "plogme: off" entry.
// (@crysnovax—FIX10-08-26)
const isCommandToggled = (name) => {
    const cmd = String(name || '').toLowerCase();
    if (!cmd || SELF_NAMES.has(cmd)) return false;
    const d = loadJson(FILES.toggled);
    return d[cmd] === true || d[cmd] === 'off';
};
const toggleCommand = (name, off) => {
    const cmd = String(name || '').toLowerCase();
    if (!cmd || SELF_NAMES.has(cmd)) return false; // plogme toggles via setEnabled, never here
    const d = loadJson(FILES.toggled);
    d[cmd] = !!off ? 'off' : 'on';
    saveJson(FILES.toggled, d);
    return true;
};
const getToggledList = () => Object.entries(loadJson(FILES.toggled)).filter(([k, v]) => v === 'off' && !SELF_NAMES.has(k)).map(([k]) => k);

/* ───────────────────────── AI (same working PREXZY models as the chatbot) ───────────────────────── */
// PLOGME uses the SAME PREXZY models as the .chatbot brain. We verified the
// current endpoints live: /ai/ch and /ai/askgpt5 respond (grok-4, gpt-5,
// deepseekchat, chatgpt, gemini all 404/dead right now — the chatbot brain
// itself falls back to askgpt5 for the same reason). These are the models
// the user chose, and the model chain the chatbot actually answers with.
// @crysnovax—FIX08-07-26
async function askAI(prompt) {
    // Primary free endpoints — /ai/ch first (verified live), then the rest
    const endpoints = [
        `${PREXZY}/ai/ch?q=`,
        `${PREXZY}/ai/askgpt5?prompt=`,
        `${PREXZY}/ai/grok-4?prompt=`,
        `${PREXZY}/ai/gpt-5?text=`,
        `${PREXZY}/ai/deepseekchat?prompt=`,
        `${PREXZY}/ai/chatgpt?text=`,
    ];
    for (const ep of endpoints) {
        try {
            const res = await axios.get(ep + encodeURIComponent(prompt), { timeout: 15000 });
            const data = res.data;
            const txt = data?.response || data?.result || data?.text || data?.message || data?.output
                || (typeof data === 'string' ? data : '');
            if (typeof txt === 'string' && txt.trim().length > 3) return txt.trim();
        } catch {}
    }

    // GROQ fallback — only when a key is configured (@crysnovax—FIX09-08-26)
    try {
        const groqKey = process.env.GROQ_KEY || getVar('GROQ_KEY')
            || process.env.GROQ_API_KEY || getVar('GROQ_API_KEY') || '';
        if (groqKey) {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 800
            }, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
                timeout: 30000
            });
            const txt = res.data?.choices?.[0]?.message?.content;
            if (typeof txt === 'string' && txt.trim().length > 3) return txt.trim();
        }
    } catch {}

    // OpenAI fallback — only when a key is configured
    try {
        const openaiKey = process.env.OPENAI_API_KEY || getVar('OPENAI_API_KEY') || '';
        if (openaiKey) {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 800
            }, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
                timeout: 30000
            });
            const txt = res.data?.choices?.[0]?.message?.content;
            if (typeof txt === 'string' && txt.trim().length > 3) return txt.trim();
        }
    } catch {}

    return null;
}

function buildPrompt(chat, userText) {
    const facts = getFacts();
    const memory = getMemory(chat);
    const ops = getOps();
    let prompt = getPersonality();
    if (getTraining()) prompt += '\n\nAdditional instructions: ' + getTraining();
    if (facts.length) prompt += '\n\nPersistent facts I remember:\n- ' + facts.join('\n- ');
    if (memory.length) {
        prompt += '\n\nRecent conversation history:\n' +
            memory.slice(-20).map(t => `${t.role === 'user' ? 'User' : 'PLOGME'}: ${t.content}`).join('\n');
    }
    if (ops.length) {
        prompt += '\n\nRecent actions I performed (my own memory of what I changed):\n' +
            ops.slice(-8).map(o => `- ${o.summary}`).join('\n');
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

/* ───────────────────────── safe file operations (agent) ───────────────────────── */
// Resolve a user-supplied path safely. Returns { abs, display } or null.
// A bare word ("hello") maps to src/Commands/User/hello.js so the owner can
// say "create a command called hello" and PLOGME knows where to put it.
function resolveWritePath(raw) {
    try {
        let p = String(raw || '').trim();
        if (!p) return null;

        const isBareName = !p.includes('/') && !p.includes('\\') && !p.includes('.');
        if (isBareName) {
            p = path.join('src', 'Commands', 'User', p.toLowerCase().replace(/[^\w-]/g, '') + '.js');
        } else {
            // strip leading ./ or /
            p = p.replace(/^\.?\//, '');
            // default .js extension for extension-less paths that look like code
            if (!path.extname(p) && !p.includes('.')) p += '.js';
        }

        const abs = path.resolve(ROOT, p);
        if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
        if (FORBIDDEN_DIRS.test(path.relative(ROOT, abs))) return null;
        return { abs, display: path.relative(ROOT, abs) };
    } catch {
        return null;
    }
}

const sanitizeCommandName = (name) => String(name || '').toLowerCase().replace(/[^\w-]/g, '');

// If the AI returned a bare description / function instead of a full module,
// wrap it into a valid command module so the file works when loaded.
function ensureCommandModule(name, code) {
    const src = String(code || '').trim();
    if (!src) return src;
    if (/module\.exports|exports\.|module\.exports\s*=|export\s+default/.test(src)) return src;
    const fnMatch = src.match(/^(?:async\s*)?(?:function\s*\w*\s*)?\([^)]*\)\s*(?:=>)?\s*\{[\s\S]*$/);
    if (fnMatch) {
        return `module.exports = {\n    name: '${name}',\n    alias: [],\n    desc: 'PLOGME-created command',\n    category: 'User',\n    execute: ${src}\n};`;
    }
    // treat as execute body
    return `module.exports = {\n    name: '${name}',\n    alias: [],\n    desc: 'PLOGME-created command',\n    category: 'User',\n    execute: async (sock, m, { args, reply, prefix }) => {\n${src.split('\n').map(l => '        ' + l).join('\n')}\n    }\n};`;
}

// node --check a file; returns the error text or null when valid.
function syntaxErrorOf(absPath) {
    try {
        execSync(`node --check "${absPath}"`, { timeout: 20000, stdio: 'pipe' });
        return null;
    } catch (e) {
        return String(e.stderr || e.message).slice(0, 2000);
    }
}

// Agent-style write: write, syntax check, and let the AI fix itself (up to
// maxTries). Returns { ok, content, error }.
async function writeFileWithAgentFix(absPath, content, opts, maxTries = 3) {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    let current = String(content ?? '');
    for (let i = 0; i < maxTries; i++) {
        fs.writeFileSync(absPath, current);
        if (!absPath.endsWith('.js')) return { ok: true, content: current, error: null };
        const err = syntaxErrorOf(absPath);
        if (!err) return { ok: true, content: current, error: null };
        if (i === maxTries - 1) return { ok: false, content: current, error: err };
        try { await opts?.reply?.('_*🛠️ Fixing syntax automatically…*_'); } catch {}
        const fixed = await askAI(
            `The file "${path.relative(ROOT, absPath)}" has a syntax error.\n\nError:\n${err}\n\nReturn ONLY the complete corrected file content and nothing else.`
        );
        if (!fixed || !String(fixed).trim()) return { ok: false, content: current, error: err };
        current = String(fixed).trim();
    }
    return { ok: true, content: current, error: null };
}

/* ───────────────────────── control actions (privileged only) ───────────────────────── */
async function runCommandAction(sock, m, opts, target) {
    const { getCommand } = require('../../Plugin/crysCmd');
    const prefix = getVar('PREFIX', '.');
    let raw = String(target || '').trim();
    if (raw.startsWith(prefix)) raw = raw.slice(prefix.length).trim();
    const [cmdName, ...rest] = raw.split(/\s+/);
    if (SELF_NAMES.has(cmdName.toLowerCase())) return '_✘ PLOGME can\'t run itself — just talk to me_';
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

async function runTest(sock, m, opts, subject) {
    const target = String(subject || '').trim();
    try {
        const isInline = /module\.exports|=>|function\s*\(/.test(target) && !target.includes('/') && !target.endsWith('.js');
        if (isInline) {
            const tmp = path.join(DATA_DIR, 'plogme_test_' + Date.now() + '.js');
            fs.writeFileSync(tmp, target);
            try { execSync(`node --check "${tmp}"`, { timeout: 15000 }); await opts.reply('_*✅ Syntax OK*_'); }
            catch (e) { await opts.reply('_*✘ Syntax error:*_\n```\n' + String(e.stderr || e.message).slice(0, 1500) + '\n```'); }
            finally { try { fs.unlinkSync(tmp); } catch {} }
        } else {
            const p = target.startsWith('.') ? path.join(process.cwd(), target) : target;
            try { execSync(`node --check "${p}"`, { timeout: 15000 }); await opts.reply(`_*✅ ${p} is valid*_`); }
            catch (e) { await opts.reply('_*✘ Error in file:*_\n```\n' + String(e.stderr || e.message).slice(0, 1500) + '\n```'); }
        }
    } catch (e) { await opts.reply('_*✘ Test failed:*_ ' + e.message); }
}

async function handleControlIntent(sock, m, opts, text) {
    const lower = text.trim().toLowerCase();

    // ── PLOGME's own chatbot-style on/off toggle ──
    // ".plogme on/off", "plogme on/off", "toggle plogme on/off",
    // "enable/disable plogme". OFF = no auto-replies in this chat, exactly
    // like the old .chatbot toggle — it uses setEnabled, never the
    // command-toggle list. (@crysnovax—FIX10-08-26)
    const selfOn = text.match(/^(?:plogme|plg|plog)\s+(on|off)$/i);
    // note: the verb group MUST be capturing — selfVerb[1] is the verb and
    // selfVerb[2] the optional state, so "enable plogme" / "toggle plogme on"
    // compute the right direction (@crysnovax—FIX10-08-26)
    const selfVerb = text.match(/^(toggle|disable|enable)\s+(?:plogme|plg|plog)(?:\s+(on|off))?$/i);
    if (selfOn || selfVerb) {
        let next;
        if (selfOn) next = selfOn[1].toLowerCase() === 'on';
        else {
            const verb = selfVerb[1].toLowerCase();
            const state = selfVerb[2];
            next = state ? state.toLowerCase() === 'on' : verb === 'enable';
        }
        setEnabled(m.chat, next);
        await opts.reply(`_*${next ? '✅' : '⛔'} PLOGME ${next ? 'toggled ON' : 'toggled OFF'}*_\n_${next ? 'Auto-reply ON in this chat' : 'Silent — no auto-replies in this chat (send .plogme on to re-enable)'}_`);
        return true;
    }

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

    // toggle a command off / on (never PLOGME itself — see the self-toggle above)
    const toggleMatch = text.match(/^(?:plogme\s+)?(?:toggle|disable|enable)\s+([\w.\-]+)\s*(on|off)?$/i);
    if (toggleMatch) {
        const { getCommand } = require('../../Plugin/crysCmd');
        const toggledName = toggleMatch[1].toLowerCase();
        if (SELF_NAMES.has(toggledName)) {
            await opts.reply('_PLOGME itself is toggled with `.plogme on` / `.plogme off`_');
            return true;
        }
        const cmd = getCommand(toggledName);
        const name = cmd?.name || toggledName;
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
        await runTest(sock, m, opts, testMatch[1]);
        return true;
    }

    // add / create / make a new command (writes into src/Commands/User/<name>.js,
    // syntax-checks with the agent loop and reloads)
    const addCmdMatch = text.match(/^(?:plogme\s+)?(?:add|create|make|new)\s+command\s+(\S+)\s*:?\s*([\s\S]+)$/i);
    if (addCmdMatch) {
        const name = sanitizeCommandName(addCmdMatch[1]);
        const code = ensureCommandModule(name, addCmdMatch[2].trim());
        if (!name || !code) { await opts.reply('_✘ Usage: plogme add command <name>: <module code>_'); return true; }
        const file = path.join(USER_CMD_DIR, name + '.js');
        const res = await writeFileWithAgentFix(file, code, opts);
        if (res.ok) {
            const { loadCommands } = require('../../Plugin/crysLoadCmd');
            const count = loadCommands();
            logOp('create', `command .${name} → ${path.relative(ROOT, file)}`);
            await opts.reply(`_*✅ Command .${name} added → ${path.relative(ROOT, file)}*_\n↻ ${count} commands loaded`);
        } else {
            await opts.reply(`_*✘ .${name} saved but has a syntax error:*_\n\`\`\`\n${res.error.slice(0, 1200)}\n\`\`\``);
        }
        return true;
    }

    // delete / remove a user command file (restricted to src/Commands/User/)
    const delCmdMatch = text.match(/^(?:plogme\s+)?(?:delete|remove|del)\s+command\s+(\S+)$/i);
    if (delCmdMatch) {
        const name = sanitizeCommandName(delCmdMatch[1]);
        const file = path.join(USER_CMD_DIR, name + '.js');
        try {
            if (!fs.existsSync(file)) { await opts.reply(`_✘ .${name} is not a user command_`); return true; }
            fs.unlinkSync(file);
            const { loadCommands } = require('../../Plugin/crysLoadCmd');
            loadCommands();
            logOp('delete', `command .${name}`);
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
            `│ 🧠 This chat    : ${isEnabled(m.chat) ? '✓ ON' : 'OFF'} (mode: ${getMode(m.chat)})\n` +
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

    // ── Lenient command intent: a plain query that basically asks for a
    //    command should just run it — "ping", "run ping", "can you ping",
    //    "check uptime", "menu". PLOGME's own names are excluded so a bare
    //    "plogme" can never dump the menu on itself. (@crysnovax—FIX08-07-26)
    try {
        const { getCommand } = require('../../Plugin/crysCmd');
        const cleaned = text
            .replace(/^(?:plogme|plg|plog)\s+/i, '')
            .replace(/^(?:can you|could you|please|pls|do|run|execute|try|check|show|give me|let'?s|how about|what about|start|open)\s+/i, '')
            .trim();
        const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length && words.length <= 5) {
            for (const w of words.slice(0, 2)) {
                if (SELF_NAMES.has(w)) continue; // never run plogme itself
                const cmd = getCommand(w);
                if (cmd && typeof cmd.execute === 'function') {
                    const restArgs = cleaned.split(/\s+/).filter(Boolean).slice(words.indexOf(w) + 1);
                    const result = await runCommandAction(sock, m, opts, cmd.name + (restArgs.length ? ' ' + restArgs.join(' ') : ''));
                    if (result !== true) await opts.reply(result);
                    return true;
                }
            }
        }
    } catch {}

    return false;
}

/* ───────────────────────── LLM intent brain (no hardcoded phrasing) ───────────────────────── */
const KNOWN_ACTIONS = new Set([
    'run_command', 'create_file', 'edit_file', 'delete_file', 'toggle_command',
    'list_commands', 'reload', 'restart', 'status', 'memory', 'clear_memory',
    'remember', 'forget', 'test', 'fix_code', 'train', 'personality', 'dev', 'chat',
]);

// Strip markdown fences / extra text and pull out the first JSON object.
function parseIntentJson(raw) {
    try {
        const s = String(raw || '').trim().replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const start = s.indexOf('{');
        const end = s.lastIndexOf('}');
        if (start !== -1 && end > start) {
            try { return JSON.parse(s.slice(start, end + 1)); } catch {}
        }
        try { return JSON.parse(s); } catch {}
    } catch {}
    return null;
}

function buildClassifierPrompt(userText) {
    return `You are PLOGME, the command brain inside a WhatsApp bot. The owner just sent a message. ` +
        `Decide what they want and reply with ONLY one JSON object — no markdown, no explanation. ` +
        `If the request is casual chat, use action "chat" with a friendly short reply. ` +
        `If they ask to run/execute/open/check/show a bot command — even inside a normal sentence — use ` +
        `"run_command" with the exact command name they meant. The bot has hundreds of commands ` +
        `(menu, ping, sticker, toimg, toaudio, tiktok, play, weather, translate, etc.); if you are not sure ` +
        `of the name, still use "run_command" with the name they said. If they ask to create/make/write a ` +
        `command, plugin, script or .js file, use "create_file" with the full file content. If they ask to ` +
        `edit/change/update/improve a file, use "edit_file" (provide "find" — the exact snippet to replace — ` +
        `and "content" — the replacement; or provide "content" alone to rewrite the whole file). ` +
        `If they ask to delete/remove a file or command, use "delete_file". If they ask to fix or repair ` +
        `code, use "fix_code". If they ask to test/check code or a file, use "test". ` +
        `If they ask to toggle a command, use "toggle_command". ` +
        `Possible actions: run_command, create_file, edit_file, delete_file, toggle_command, ` +
        `list_commands, reload, restart, status, memory, clear_memory, remember, forget, ` +
        `test, fix_code, train, personality, dev, chat.\n\n` +
        `JSON shapes:\n` +
        `- {"action":"run_command","command":"<name>","args":"<optional>"}\n` +
        `- {"action":"create_file","path":"src/Commands/User/name.js","content":"<FULL file content>"}\n` +
        `  (a bare name like "hello" as path means a new command file)\n` +
        `- {"action":"edit_file","path":"<path>","find":"<exact snippet>","content":"<replacement>"}\n` +
        `- {"action":"delete_file","path":"<path>"}\n` +
        `- {"action":"toggle_command","command":"<name>","state":"on|off"}\n` +
        `- {"action":"list_commands","category":"<optional>"}\n` +
        `- {"action":"reload"} {"action":"restart"} {"action":"status"} {"action":"memory"} {"action":"clear_memory"}\n` +
        `- {"action":"remember","fact":"<fact>"} {"action":"forget","index":1}\n` +
        `- {"action":"test","target":"<code or file path>"} {"action":"fix_code","code":"<code>"}\n` +
        `- {"action":"train","text":"<text>"} {"action":"personality","text":"<text>"}\n` +
        `- {"action":"dev","state":"on|off|toggle"}\n` +
        `- {"action":"chat","reply":"<your short reply>"}\n\n` +
        `Owner message: "${String(userText || '').slice(0, 2000)}"`;
}

// Classify a privileged message into a structured intent. Returns the intent
// object, or null when the AI is unreachable / the response is unparsable.
async function classifyIntent(userText) {
    const raw = await askAI(buildClassifierPrompt(userText));
    if (!raw) return null;
    const intent = parseIntentJson(raw);
    if (!intent || typeof intent !== 'object') return null;
    const action = String(intent.action || '').toLowerCase();
    if (!KNOWN_ACTIONS.has(action)) return null;
    intent.action = action;
    return intent;
}

// Execute a classified intent. Returns { handled: true } when PLOGME dealt
// with the message (including as a chat reply).
async function executeIntent(sock, m, opts, intent) {
    try {
        const action = intent.action;

        switch (action) {
            case 'run_command': {
                const target = String(intent.command || '').trim() + (intent.args ? ' ' + String(intent.args).trim() : '');
                const result = await runCommandAction(sock, m, opts, target);
                if (result !== true) await opts.reply(result);
                logOp('run', `ran command: ${String(intent.command || '').slice(0, 60)}`);
                return { handled: true };
            }

            case 'create_file': {
                const resolved = resolveWritePath(intent.path || intent.filename || '');
                if (!resolved) { await opts.reply('_✘ Invalid or blocked file path_'); return { handled: true }; }
                const { abs, display } = resolved;
                const rawPath = String(intent.path || intent.filename || '');
                const isBareName = !rawPath.includes('/') && !rawPath.includes('\\') && !rawPath.includes('.');
                const name = isBareName ? sanitizeCommandName(rawPath) : '';
                let content = String(intent.content || '');
                if (!content.trim()) { await opts.reply('_✘ No file content provided_'); return { handled: true }; }
                if (name) content = ensureCommandModule(name, content);
                const res = await writeFileWithAgentFix(abs, content, opts);
                logOp('create', `${display}${name ? ` (command .${name})` : ''}`);
                if (res.ok) {
                    if (display.includes('Commands')) { try { require('../../Plugin/crysLoadCmd').loadCommands(); } catch {} }
                    await opts.reply(
                        `_*✅ ${fs.existsSync(abs) && display.startsWith('src/Commands/User') ? 'File created' : 'File written'}:*_ \`${display}\`` +
                        (name ? ` → command .${name}` : '') +
                        `\n\n\`\`\`js\n${String(res.content || '').slice(0, 3000)}\n\`\`\``
                    );
                } else {
                    await opts.reply(`_*✘ Saved but syntax error in \`${display}\`:*_\n\`\`\`\n${res.error.slice(0, 1200)}\n\`\`\``);
                }
                return { handled: true };
            }

            case 'edit_file': {
                const resolved = resolveWritePath(intent.path || intent.filename || '');
                if (!resolved) { await opts.reply('_✘ Invalid or blocked file path_'); return { handled: true }; }
                const { abs, display } = resolved;
                if (!fs.existsSync(abs)) { await opts.reply(`_✘ \`${display}\` not found_`); return { handled: true }; }
                const current = fs.readFileSync(abs, 'utf8');
                let next;
                if (intent.find) {
                    const idx = current.indexOf(String(intent.find));
                    if (idx === -1) { await opts.reply(`_✘ Could not find that snippet in \`${display}\`_`); return { handled: true }; }
                    next = current.slice(0, idx) + String(intent.content || '') + current.slice(idx + String(intent.find).length);
                } else {
                    next = String(intent.content || '');
                }
                if (!next.trim()) { await opts.reply('_✘ No replacement content provided_'); return { handled: true }; }
                const res = await writeFileWithAgentFix(abs, next, opts);
                logOp('edit', display);
                if (res.ok) {
                    if (display.includes('Commands')) { try { require('../../Plugin/crysLoadCmd').loadCommands(); } catch {} }
                    await opts.reply(`_*✅ \`${display}\` updated ✓*_`);
                } else {
                    await opts.reply(`_*✘ Saved but syntax error in \`${display}\`:*_\n\`\`\`\n${res.error.slice(0, 1200)}\n\`\`\``);
                }
                return { handled: true };
            }

            case 'delete_file': {
                const resolved = resolveWritePath(intent.path || intent.filename || '');
                if (!resolved) { await opts.reply('_✘ Invalid or blocked file path_'); return { handled: true }; }
                const { abs, display } = resolved;
                if (!fs.existsSync(abs)) { await opts.reply(`_✘ \`${display}\` not found_`); return { handled: true }; }
                if (PROTECTED_FILES.has(display) || PROTECTED_FILES.has(path.basename(display))) {
                    await opts.reply(`_🛡️ \`${display}\` is protected and cannot be deleted_`);
                    return { handled: true };
                }
                try {
                    fs.unlinkSync(abs);
                    logOp('delete', display);
                    if (display.includes('Commands')) { try { require('../../Plugin/crysLoadCmd').loadCommands(); } catch {} }
                    await opts.reply(`_*🗑️ \`${display}\` deleted ✓*_`);
                } catch (e) { await opts.reply('_✘ Delete failed:_ ' + e.message); }
                return { handled: true };
            }

            case 'toggle_command': {
                const { getCommand } = require('../../Plugin/crysCmd');
                const cmd = getCommand(String(intent.command || '').toLowerCase());
                const name = cmd?.name || String(intent.command || '').toLowerCase();
                if (SELF_NAMES.has(name)) {
                    // toggling PLOGME itself = the chatbot on/off toggle for
                    // this chat (the command-toggle list is for other commands)
                    const off = String(intent.state || 'off').toLowerCase() !== 'on';
                    setEnabled(m.chat, !off);
                    logOp('toggle', `plogme ${off ? 'off' : 'on'} in this chat`);
                    await opts.reply(`_*${off ? '⛔' : '✅'} PLOGME ${off ? 'toggled OFF' : 'toggled ON'}*_\n_${off ? 'No auto-replies in this chat' : 'Auto-replies ON in this chat'}_`);
                    return { handled: true };
                }
                const off = String(intent.state || 'off').toLowerCase() !== 'on';
                toggleCommand(name, off);
                logOp('toggle', `.${name} ${off ? 'off' : 'on'}`);
                await opts.reply(`_*${off ? '⛔' : '✅'} .${name} ${off ? 'toggled OFF' : 'toggled ON'}*_`);
                return { handled: true };
            }

            case 'list_commands': {
                const { getAll } = require('../../Plugin/crysCmd');
                const cat = String(intent.category || '').toLowerCase();
                let names = [];
                for (const [k, v] of getAll()) {
                    if (v?.isAlias) continue;
                    if (cat && String(v?.category || '').toLowerCase() !== cat) continue;
                    names.push(k);
                }
                names = [...new Set(names)];
                await opts.reply(names.length
                    ? `_*💾 Commands${cat ? ` (${cat})` : ''}:*_ ${names.length}\n\`${names.slice(0, 120).join('`, `')}\`${names.length > 120 ? '…' : ''}`
                    : '_No commands found_');
                return { handled: true };
            }

            case 'reload': {
                const { loadCommands } = require('../../Plugin/crysLoadCmd');
                const count = loadCommands();
                await opts.reply(`_*↻ Commands reloaded:*_ ${count} commands loaded ✓`);
                return { handled: true };
            }

            case 'restart': {
                await opts.reply('_*♻️ Restarting the bot...*_');
                setTimeout(() => process.exit(0), 1500);
                return { handled: true };
            }

            case 'status': {
                const { getAll } = require('../../Plugin/crysCmd');
                await opts.reply(
                    `╭─❍ *PLOGME STATUS*\n│\n` +
                    `│ 么 Personality : ${getPersonality().slice(0, 40)}…\n` +
                    `│ ⚉︎ Training     : ${getTraining() ? '✓ set' : '—'}\n` +
                    `│ ✆ Dev mode     : ${isDev() ? '✓ ON' : 'OFF'}\n` +
                    `│ ⓘ Facts        : ${getFacts().length}\n` +
                    `│ ۞ Commands     : ${getAll().size}\n` +
                    `│ ⌬ Toggled off  : ${getToggledList().length}\n` +
                    `╰──────────────────`
                );
                return { handled: true };
            }

            case 'memory': {
                const mem = getMemory(m.chat);
                const facts = getFacts();
                await opts.reply(
                    `_*🧠 PLOGME memory (${m.chat})*_\n\n` +
                    (facts.length ? `_Persistent facts:_\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n` : '') +
                    (mem.length ? `_Last ${Math.min(mem.length, 10)} turns:_\n${mem.slice(-10).map(t => `• ${t.role === 'user' ? '👤' : '🤖'} ${String(t.content).slice(0, 60)}`).join('\n')}` : '_Empty_')
                );
                return { handled: true };
            }

            case 'clear_memory': {
                clearMemory(m.chat);
                await opts.reply('_*✦ memory wiped*_');
                return { handled: true };
            }

            case 'remember': {
                if (!String(intent.fact || '').trim()) { await opts.reply('_*ⓘ What should I remember?*_'); return { handled: true }; }
                addFact(String(intent.fact).trim());
                logOp('remember', String(intent.fact).slice(0, 80));
                await opts.reply('_*📎 Remembered ✓*_');
                return { handled: true };
            }

            case 'forget': {
                const idx = (parseInt(intent.index, 10) || 1) - 1;
                await opts.reply(removeFact(idx) ? '_*🗑️ Fact forgotten*_' : '_✘ Invalid fact number_');
                return { handled: true };
            }

            case 'test': {
                await runTest(sock, m, opts, intent.target);
                return { handled: true };
            }

            case 'fix_code': {
                const fixed = await askAI('Fix this code and return ONLY the corrected code, nothing else:\n\n' + String(intent.code || ''));
                await opts.reply('_*🔧 Fixed code:*_\n\n```\n' + (fixed || 'Failed to fix — AI unavailable') + '\n```');
                return { handled: true };
            }

            case 'train': {
                if (!String(intent.text || '').trim()) { await opts.reply('_*ⓘ Usage: train <text>*_'); return { handled: true }; }
                setTraining(String(intent.text).trim());
                await opts.reply('_*☞ Global training saved ✓*_');
                return { handled: true };
            }

            case 'personality': {
                if (!String(intent.text || '').trim()) { await opts.reply('_*ⓘ Usage: personality <text>*_'); return { handled: true }; }
                setPersonality(String(intent.text).trim());
                await opts.reply('_*⚉ Global personality set ✓*_');
                return { handled: true };
            }

            case 'dev': {
                const arg = String(intent.state || 'toggle').toLowerCase();
                const next = arg === 'toggle' ? !isDev() : arg === 'on';
                setDev(next);
                await opts.reply(`_*🛠️ Developer mode ${next ? 'ON' : 'OFF'}*_`);
                return { handled: true };
            }

            case 'chat': {
                if (String(intent.reply || '').trim()) await opts.reply(String(intent.reply).trim());
                return { handled: true };
            }

            default:
                return { handled: false };
        }
    } catch (err) {
        console.error('[PLOGME INTENT ERROR]', err.message);
        return { handled: false };
    }
}

/* ───────────────────────── main execute (called from ?.js hook) ───────────────────────── */
async function execute(sock, m, opts) {
    try {
        if (!m.chat || m.chat === 'status@broadcast') return false;
        if (m.mtype === 'reactionMessage') return false;

        const text = String(m.text || m.body || '').trim();
        if (!text) return false;

        // ── Spam control = the invisible-character (marker) logic ONLY ──
        // The owner and the bot are the SAME WhatsApp account, so every
        // message the owner sends arrives with fromMe=true — the old blanket
        // `if (m.key?.fromMe) return false;` guard is exactly why plogme
        // never auto-replied. The ONLY thing we must never answer is the
        // bot's own output, which always carries the invisible marker.
        // (@crysnovax—FIX09-08-26)
        if (text.includes(MARKER)) return false;

        const prefix = getVar('PREFIX', '.');
        const isCommand = text.startsWith(prefix);

        const privileged = await isPrivileged(sock, m);

        // Control intents — only for owner/sudo/dual. A ".plogme run ping"
        // style message is treated the same as a bare control intent, and a
        // plain "ping" / "can you ping" / "check uptime" query auto-runs the
        // command too — no more strict phrasing. @crysnovax—FIX08-07-26
        if (privileged) {
            const body = isCommand ? text.slice(prefix.length).trim() : text;
            const isPlogmeInvocation = /^(plogme|plg|plog)(\s|$)/i.test(body);
            const handledControl = await handleControlIntent(sock, m, opts, isPlogmeInvocation ? body : text);
            if (handledControl) return true;

            // ── LLM intent brain ──
            // Anything else a privileged user says — plain chat OR an unhandled
            // ".plogme <thing>" — goes to the classifier, which understands
            // context ("please run the menu command for me", "create a command
            // called hi", "edit the ping command to say hi") with no hardcoded
            // phrasing. When the AI is unreachable we simply fall through to
            // the normal chat flow below. @crysnovax—FIX09-08-26
            if (!isCommand) {
                try {
                    const intent = await classifyIntent(isPlogmeInvocation ? body : text);
                    if (intent) {
                        const res = await executeIntent(sock, m, opts, intent);
                        if (res.handled) return true;
                    }
                } catch {}
            }
        }

        // Auto-reply chatbot (works like the old chatbot, but always-on for
        // privileged users even in commands they own).
        // FIX09-08-26: DMs are ON by default so the JARVIS-style chatbot works
        // out of the box — an explicit `.plogme off` in a chat is still honored.
        let on = isEnabled(m.chat);
        if (!m.isGroup) {
            if (!on && isGlobalPrivateEnabled()) on = true;
            if (!on && getVar('PLOGME_DM', true) !== false && !hasExplicitToggle(m.chat)) on = true;
        }
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

        // typing indicator while the AI thinks (always, not just dev mode)
        await sock.sendPresenceUpdate('composing', m.chat).catch(() => {});

        addToMemory(m.chat, 'user', text);
        const prompt = buildPrompt(m.chat, text);
        const answer = await askAI(prompt);
        if (!answer) return true; // consumed, but AI unavailable

        addToMemory(m.chat, 'assistant', answer);
        await opts.reply(answer);
        await sock.sendPresenceUpdate('paused', m.chat).catch(() => {});
        return true;
    } catch (err) {
        console.error('[PLOGME EXECUTE ERROR]', err.message);
        return false;
    }
}

module.exports = {
    execute,
    isEnabled,
    hasExplicitToggle,
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
    // agent brain exports
    classifyIntent,
    parseIntentJson,
    executeIntent,
    resolveWritePath,
    ensureCommandModule,
    writeFileWithAgentFix,
    logOp,
    getOps,
};
