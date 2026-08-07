// packname.js — every sticker gets branded as "⚉ • <PACK_NAME>" when
// PACK_NAME is set (env or .setvar). Read live so it applies instantly.
// @crysnovax—FIX06-08-26
const { getVar } = require('./configManager');

function getPackName() {
    // Branded as "⚉ • <PACK_NAME>" — falls back to CODY AI, never a
    // hardcoded crysnovax packname (@crysnovax—FIX08-07-26).
    const pack = String(getVar('PACK_NAME') || process.env.PACK_NAME || '').trim() || 'CODY AI';
    return `⚉ • ${pack}`;
}

module.exports = { getPackName };
