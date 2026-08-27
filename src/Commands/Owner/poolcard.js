/*
 * RichGen spin-wheel television surface.
 * Design target: one Meta-style AI RichGen message whose image is refreshed in
 * place for a short, bounded sequence. No carousel, buttons, WebView, location
 * bubble, or second message is emitted by this command.
 */

const FRAME_URLS = [
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/fcbBUuugXWdVqlSk.png',
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/gFNpabvvIWiXhNWJ.png',
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/DplomqMiJDHojiTc.png',
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/FMxDWkUHqCJCkTYg.png',
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/NREJnjsJydLaVvlW.png',
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663721894305/mMICZTrpDCQZkWeq.png'
];

const FRAME_DELAY_MS = 1200;

const generationPayload = (frame, status) => ({
    text: `CRYSNOVA live spin wheel · frame ${frame + 1}/${FRAME_URLS.length}`,
    mediaType: 'image',
    status,
    url: FRAME_URLS[frame],
    mimeType: 'image/png'
});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const poolcard = {
    name: 'pooltable',
    alias: ['poolcard', 'nativepool', 'poolrich', 'spinwheel', 'wheel'],
    desc: 'Show a bounded RichGen spin-wheel television frame animation',
    category: 'Owner',
    owner: true,
    ownerOnly: true,
    reactions: { start: '🎡', success: '✅', error: '❔' },

    execute: async (sock, m, { args = [], reply }) => {
        if (args.length) {
            return reply('The spin wheel is automatic. Send .pooltable without arguments.');
        }
        if (typeof sock.sendRichGeneration !== 'function' || typeof sock.updateRichGeneration !== 'function') {
            return reply('This Baileys version does not expose the RichGen generation and update helpers.');
        }

        try {
            const first = await sock.sendRichGeneration(
                m.chat,
                generationPayload(0, 'READY'),
                m
            );
            if (!first?.messageId || !first?.responseId || !first?.itemId) {
                return reply('Spin wheel was not sent with a complete RichGen receipt.');
            }

            for (let frame = 1; frame < FRAME_URLS.length; frame += 1) {
                await pause(FRAME_DELAY_MS);
                await sock.updateRichGeneration(
                    m.chat,
                    first.messageId,
                    generationPayload(frame, frame === FRAME_URLS.length - 1 ? 'READY' : 'GENERATING'),
                    { itemId: first.itemId, responseId: first.responseId }
                );
            }
        } catch (error) {
            return reply(`Spin wheel failed: ${error?.message || error}`);
        }
    }
};

module.exports = poolcard;
module.exports.FRAME_URLS = FRAME_URLS;
module.exports.generationPayload = generationPayload;
