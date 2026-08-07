// plogme.js — command interface for the PLOGME internal processing AI.
// Auto-reply works automatically via the hook in ?.js; this command controls
// the toggles (on/off/mode/train/personality/dev/status/memory/facts).
// @crysnovax—FIX08-07-26
const plogme = require('../Core/plogme.js');

module.exports = {
    name: 'plogme',
    alias: ['plg', 'plog'],
    desc: 'PLOGME — internal processing AI: auto-reply chatbot + bot control (run/toggle commands, fix code, reload, dev mode)',
    category: 'AI',
    usage: '.plogme on | off | on all | off all | mode all|tag | train <text> | personality <text> | dev on|off | status | memory | clear | remember <fact> | forget <n> | help',

    execute: async (sock, m, { args, reply, prefix }) => {
        const sub = (args[0] || '').toLowerCase();
        const rest = args.slice(1).join(' ').trim();

        switch (sub) {
            case 'on': {
                if (rest === 'all') {
                    plogme.setGlobalPrivateEnabled(true);
                    return reply('`—͟͟͞͞𖣘 plogme on all DM`');
                }
                plogme.setEnabled(m.chat, true);
                return reply('`Chatbot ON`');
            }
            case 'off': {
                if (rest === 'all') {
                    plogme.setGlobalPrivateEnabled(false);
                    return reply('`GLOBAL MODE OFF`');
                }
                plogme.setEnabled(m.chat, false);
                return reply('`✘ DISABLED`');
            }
            case 'mode': {
                const mode = (args[1] || '').toLowerCase();
                if (mode === 'all') { plogme.setMode(m.chat, 'all'); return reply('`✐ Mode ALL`'); }
                if (mode === 'tag') { plogme.setMode(m.chat, 'tag'); return reply('`⎔ Mode TAG`'); }
                return reply('_*ⓘ Usage: .plogme mode all | tag*_');
            }
            case 'train': {
                if (!rest) {
                    const cur = plogme.getTraining();
                    return reply(cur ? `⎙ Current training:\n"${cur}"` : '_No global training set. Use .plogme train <text>_');
                }
                plogme.setTraining(rest);
                return reply(`⁠☞⁠ ͡° ͜ʖ ͡°)☞ Global training saved:\n"${rest.slice(0, 150)}${rest.length > 150 ? '...' : ''}"`);
            }
            case 'personality': {
                if (!rest) {
                    const cur = plogme.getPersonality();
                    return reply(cur && cur !== plogme.DEFAULT_PERSONALITY
                        ? `ಥ‿ಥ Current personality:\n"${cur.slice(0, 150)}…"`
                        : '_Default PLOGME personality active. Use .plogme personality <text> to replace._');
                }
                plogme.setPersonality(rest);
                return reply(`⚉ Global personality set:\n"${rest.slice(0, 150)}${rest.length > 150 ? '...' : ''}"`);
            }
            case 'dev': {
                const arg = (args[1] || 'toggle').toLowerCase();
                const next = arg === 'toggle' ? !plogme.isDev() : arg === 'on';
                plogme.setDev(next);
                return reply(`_*🛠️ Developer mode ${next ? 'ON' : 'OFF'}*_`);
            }
            case 'status': {
                return reply(
                    `╭─❍ *PLOGME STATUS*\n│\n` +
                    `│ 🧠 Personality : ${plogme.getPersonality().slice(0, 40)}…\n` +
                    `│ 𓄄 Training     : ${plogme.getTraining() ? '✓ set' : '—'}\n` +
                    `│ 🛠️ Dev mode     : ${plogme.isDev() ? '✓ ON' : 'OFF'}\n` +
                    `│ 📎 Facts        : ${plogme.getFacts().length}\n` +
                    `│ 🧠 This chat    : ${plogme.isEnabled(m.chat) ? '✓ ON' : 'OFF'} (mode: ${plogme.getMode(m.chat)})\n` +
                    `╰──────────────────`
                );
            }
            case 'memory': {
                const mem = plogme.getMemory(m.chat);
                const facts = plogme.getFacts();
                return reply(
                    `_*🧠 PLOGME memory*_\n\n` +
                    (facts.length ? `_Persistent facts:_\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n` : '') +
                    (mem.length ? `_Last ${Math.min(mem.length, 10)} turns in this chat:_\n${mem.slice(-10).map(t => `• ${t.role === 'user' ? '👤' : '🤖'} ${String(t.content).slice(0, 60)}`).join('\n')}` : '_Empty_')
                );
            }
            case 'clear': {
                plogme.clearMemory(m.chat);
                return reply('_*✦ memory wiped*_');
            }
            case 'remember': {
                if (!rest) return reply('_*ⓘ Usage: .plogme remember <fact>*_');
                plogme.addFact(rest);
                return reply('_*📎 Remembered ✓*_');
            }
            case 'forget': {
                const idx = parseInt(args[1] || '0', 10);
                return reply(plogme.removeFact(idx - 1) ? '_*🗑️ Fact forgotten*_' : '_✘ Invalid fact number_');
            }
            case 'help':
            default:
                return reply(
                    `╭─❍ *PLOGME* 𓉤\n│\n` +
                    `│ 🧠 Internal processing AI — auto-reply chatbot + bot control.\n│\n` +
                    `│ *Chatbot:*\n` +
                    `│ • .plogme on / off (this chat)\n` +
                    `│ • .plogme on all / off all (global DM)\n` +
                    `│ • .plogme mode all | tag\n` +
                    `│ • .plogme train <text> (global)\n` +
                    `│ • .plogme personality <text> (global)\n` +
                    `│ • .plogme status | memory | clear\n` +
                    `│ • .plogme remember <fact> | forget <n>\n│\n` +
                    `│ *Owner / sudo / dual — bot control:*\n` +
                    `│ • plogme run <command> — run any command\n` +
                    `│ • plogme toggle <cmd> on|off — toggle a command\n` +
                    `│ • plogme toggled — list toggled-off commands\n` +
                    `│ • plogme fix <code> — fix code with AI\n` +
                    `│ • plogme test <code|file> — syntax test\n` +
                    `│ • plogme add command <name>: <code>\n` +
                    `│ • plogme delete command <name>\n` +
                    `│ • plogme reload — reload all commands\n` +
                    `│ • plogme restart — restart the bot\n` +
                    `│ • plogme dev on|off — developer mode\n` +
                    `╰──────────────────`
                );
        }
    }
};
