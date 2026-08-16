const { downloadQuotedMedia: defaultDownloadQuotedMedia } = require('./poststory.js');

function parseBackground(args = []) {
    const token = args.find(value => /^--bg=/i.test(value));
    return token ? token.slice(token.indexOf('=') + 1).trim() : undefined;
}

function textArgs(args = []) {
    return args.filter(value => !/^--bg=/i.test(value)).join(' ').trim();
}

module.exports = {
    name: 'ownerstatus',
    alias: ['owner-groupstatus'],
    category: 'Owner',
    ownerOnly: true,
    desc: 'Post text or replied audio/media to a group status',
    execute: async (sock, m, context = {}) => {
        const { args = [], reply, prefix = '.', downloadQuotedMedia = defaultDownloadQuotedMedia } = context;
        if (!m?.isGroup && !String(m?.chat || '').endsWith('@g.us')) {
            return reply('groupstatus can only be used in a WhatsApp group.');
        }

        try {
            const backgroundColor = parseBackground(args);
            const text = textArgs(args);
            const quoted = await downloadQuotedMedia(m);
            let content;

            if (quoted?.type === 'audio') {
                content = {
                    audio: quoted.buffer,
                    mimetype: quoted.media?.mimetype || 'audio/ogg; codecs=opus',
                    ptt: Boolean(quoted.media?.ptt)
                };
            } else if (quoted?.type === 'image' || quoted?.type === 'video') {
                content = {
                    [quoted.type]: quoted.buffer,
                    ...(text ? { caption: text } : {})
                };
            } else {
                if (!text) return reply(`Usage: ${prefix}groupstatus [--bg=#RRGGBB] <text>, or reply to media.`);
                content = { text };
            }

            const options = backgroundColor ? { backgroundColor } : {};
            if (typeof sock.sendGroupStatus === 'function') {
                await sock.sendGroupStatus(m.chat, content, options);
            } else {
                await sock.sendMessage(m.chat, { ...content, groupStatus: true }, options);
            }
            return reply('Group status posted successfully.');
        } catch (error) {
            console.error('[GROUPSTATUS ERROR]', error?.stack || error);
            return reply(`Failed to post group status: ${error?.message || 'unknown WhatsApp error'}`);
        }
    },
    parseBackground,
    textArgs
};
