const { createAntiMessageModeration } = require('../../Plugin/antiMessageModeration');

// ─── DETECTOR: does this message contain a view-once media envelope? ───
function isViewOnceMessage(message) {
    if (!message || typeof message !== 'object') return false;

    // Direct view-once envelopes
    if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true;

    // Also catch view-once wrapped inside ephemeral
    if (message.ephemeralMessage) {
        const inner = message.ephemeralMessage?.message;
        if (inner?.viewOnceMessage || inner?.viewOnceMessageV2 || inner?.viewOnceMessageV2Extension) return true;
    }

    return false;
}

const plugin = createAntiMessageModeration({
    command: 'antivv',
    aliases: ['antiviewonce', 'antivo'],
    label: 'Anti View-Once',
    description: 'Block view-once media messages in groups',
    databaseName: 'antivv.json',
    warningDatabaseName: 'antivv_warns.json',
    detector: isViewOnceMessage,
    violationLabel: 'view-once messages'
});

plugin.handleAntiVV = plugin.handleModeration;
plugin.isViewOnceMessage = isViewOnceMessage;

module.exports = plugin;
