// packname.js — every sticker gets branded as "⚉ • <PACK_NAME>" when
// PACK_NAME is set (env or .setvar). Read live so it applies instantly.
// @crysnovax—FIX06-08-26
const { getVar } = require('./configManager');

function getPackName() {
    const pack = String(getVar('PACK_NAME') || process.env.PACK_NAME || '').trim();
    if (!pack) return null;
    return `⚉ • ${pack}`;
}

module.exports = { getPackName };
