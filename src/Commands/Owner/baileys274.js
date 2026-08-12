'use strict';

function usage(reply) {
    return reply([
        'Baileys 2.7.4 commands:',
        '.wa groupcall <group-jid> <jid,...> [video]',
        '.wa regcheck <number>',
        '.wa regcode <number> [sms|voice]',
        '.wa managed',
        '.wa profilestatus <text>',
        '.wa statusprivacy <contacts|whitelist|blacklist|null> [jid,...]',
        '.wa chatblock <block|unblock>',
        '.wa pushconfig <get|set> [json]',
        '.wa aiprompt <jid> <prompt>',
        '.wa aigroup <create|addbot|metadata> <jid> [name]',
        '.wa resync [collection,...]'
    ].join('\n'));
}

function requireMethod(sock, name) {
    if (typeof sock?.[name] !== 'function') throw new Error(`Baileys method ${name} is unavailable`);
}

module.exports = {
    name: 'wa',
    alias: ['baileys274', 'wafeatures'],
    category: 'Owner',
    ownerOnly: true,
    desc: 'Baileys 2.7.4 feature commands',
    execute: async (sock, m, { args, reply }) => {
        const sub = String(args.shift() || '').toLowerCase();
        try {
            if (!sub) return usage(reply);
            if (sub === 'groupcall') {
                requireMethod(sock, 'groupCall');
                const jid = args.shift();
                const participants = String(args.shift() || '').split(',').filter(Boolean);
                const result = await sock.groupCall(jid, participants, args[0] === 'video');
                return reply(`Group call started: ${result?.id || 'created'}`);
            }
            if (sub === 'regcheck') {
                requireMethod(sock, 'checkNumberAvailable');
                return reply(JSON.stringify(await sock.checkNumberAvailable(args[0])));
            }
            if (sub === 'regcode') {
                requireMethod(sock, 'requestRegistrationCode');
                return reply(JSON.stringify(await sock.requestRegistrationCode(args[0], args[1] === 'voice' ? 'voice' : 'sms')));
            }
            if (sub === 'managed') {
                requireMethod(sock, 'fetchManagedAccount');
                return reply(JSON.stringify(await sock.fetchManagedAccount()));
            }
            if (sub === 'profilestatus') {
                requireMethod(sock, 'updateProfileStatus');
                await sock.updateProfileStatus(args.join(' '));
                return reply('Profile status updated.');
            }
            if (sub === 'statusprivacy') {
                requireMethod(sock, 'setStatusPrivacy');
                const type = args.shift();
                const jids = String(args.shift() || '').split(',').filter(Boolean);
                await sock.setStatusPrivacy(type, jids);
                return reply('Status privacy updated.');
            }
            if (sub === 'chatblock') {
                requireMethod(sock, 'updateChatBlockingStatus');
                await sock.updateChatBlockingStatus(args[0] === 'block' ? 'block' : 'unblock');
                return reply('Chat blocking updated.');
            }
            if (sub === 'pushconfig') {
                if (args[0] === 'get') {
                    requireMethod(sock, 'getPushConfig');
                    return reply(JSON.stringify(await sock.getPushConfig()));
                }
                requireMethod(sock, 'setPushConfig');
                await sock.setPushConfig(JSON.parse(args.slice(1).join(' ')));
                return reply('Push configuration updated.');
            }
            if (sub === 'aiprompt') {
                requireMethod(sock, 'aiPrompt');
                const answer = await sock.aiPrompt(args.shift(), args.join(' '));
                return reply(answer?.message?.conversation || answer?.message?.extendedTextMessage?.text || 'AI returned a media response.');
            }
            if (sub === 'aigroup') {
                const action = args.shift();
                if (action === 'create') {
                    requireMethod(sock, 'aiGroupCreate');
                    const result = await sock.aiGroupCreate(args.shift(), args);
                    return reply(`AI group created: ${result?.id || result}`);
                }
                if (action === 'addbot') {
                    requireMethod(sock, 'aiGroupAddBot');
                    await sock.aiGroupAddBot(args[0]);
                    return reply('Meta AI bot added.');
                }
                requireMethod(sock, 'aiGroupMetadata');
                return reply(JSON.stringify(await sock.aiGroupMetadata(args[0])));
            }
            if (sub === 'resync') {
                requireMethod(sock, 'resyncAppState');
                await sock.resyncAppState(String(args[0] || 'regular_high,regular_low').split(','), false);
                return reply('App state resync requested.');
            }
            return usage(reply);
        } catch (error) {
            console.error('[BAILEYS 2.7.4 COMMAND]', error);
            return reply(`Baileys error: ${error.message}`);
        }
    }
};
