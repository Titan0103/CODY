// packname.js — every sticker gets branded as "⚉ • <PACK_NAME>" when
// PACK_NAME is set (env or .setvar). Read live so it applies instantly.
// @crysnovax—FIX06-08-26
const { getVar } = require('./configManager');

function getPackName() {
    // Branded as "⚉ • <PACK_NAME>" — CODY AI only as the default when
    // nothing is set (@crysnovax—FIX08-07-26).
    const pack = String(getVar('PACK_NAME') || process.env.PACK_NAME || '').trim() || 'CODY AI';
    return `⚉ • ${pack}`;
}

// Full sticker branding. The author is NEVER hardcoded: it follows
// STICKER_AUTHOR → PACK_NAME → default, so users don't see a stray
// "CODY AI" next to their own pack name. (@crysnovax—FIX08-07-26)
function getStickerBranding() {
    const pack = getPackName();
    const author = String(
        getVar('STICKER_AUTHOR') || process.env.STICKER_AUTHOR ||
        getVar('PACK_NAME') || process.env.PACK_NAME || ''
    ).trim() || 'CODY AI';
    return { pack, author };
}

module.exports = { getPackName, getStickerBranding };
