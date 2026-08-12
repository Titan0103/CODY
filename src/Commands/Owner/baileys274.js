'use strict';

function usage(reply) {
    return reply([
        'Baileys 2.7.5 commands:',
        '.wa groupcall <group-jid> <jid,...> [video]',
        '.wa regcheck <number>',
        '.wa regcode <number> [sms|voice]',
        '.wa managed',
        '.wa profilestatus <text>',
        '.wa chatblock <block|unblock>',
        '.wa pushconfig <get|set> [json]',
        '.wa aiprompt <jid> <prompt>',
        '.wa aigroup <create|addbot|metadata> <jid> [name]',
        '.wa resync [collection,...]',
        '.wa groupcallcancel <group-jid> <call-id>',
        '.wa companionremove <device-jid> [reason]',
        '.wa keyindex [send|update] [timestamp] [base64]',
        '.wa qr <code>',
        '.wa logoutchallenge <id> <true|false>',
        '.wa interop <init|optin|optout|tos>',
        '.wa reachability <get|set> [allow] [allowNonContacts]',
        '.wa interopblock <block|trust> <jid>',
        '.wa bot <list|profile|block|unblock> [jid]',
        '.wa disclosures <list|accept> [notice-id] [version]',
        '.wa apppatch <json>',
        '.wa chatmodify <jid> <archive|unarchive>',
        '.wa businessdescription <text>'
    ].join('\n'));
}

function requireMethod(sock, name) {
    if (typeof sock?.[name] !== 'function') throw new Error(`Baileys method ${name} is unavailable`);
}

module.exports = {
    name: 'wa',
    alias: ['baileys275', 'wafeatures'],
    category: 'Owner',
    owner: true,
    desc: 'Baileys 2.7.5 feature commands',
    execute: async (sock, m, { args, reply }) => {
        const sub = String(args.shift() || '').toLowerCase();
        try {
            if (!sub) return usage(reply);
            if (sub === 'groupcall') {
                requireMethod(sock, 'groupCall');
                const jid = args.shift();
                const participants = String(args.shift() || '').split(',').map(value => value.trim()).filter(Boolean);
                if (!jid || !participants.length || (args[0] && args[0] !== 'video')) return usage(reply);
                const result = await sock.groupCall(jid, participants, args[0] === 'video');
                return reply(`Group call started: ${result?.id || 'created'}`);
            }
            if (sub === 'regcheck') {
                requireMethod(sock, 'checkNumberAvailable');
                if (!args[0]) return usage(reply);
                return reply(JSON.stringify(await sock.checkNumberAvailable(args[0])));
            }
            if (sub === 'regcode') {
                requireMethod(sock, 'requestRegistrationCode');
                if (!args[0] || (args[1] && !['sms', 'voice'].includes(args[1]))) return usage(reply);
                return reply(JSON.stringify(await sock.requestRegistrationCode(args[0], args[1] || 'sms')));
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
                const collections = String(args[0] || 'regular_high,regular_low').split(',').map(value => value.trim()).filter(Boolean);
                if (!collections.length) return usage(reply);
                await sock.resyncAppState(collections, false);
                return reply('App state resync requested.');
            }
            if (sub === 'groupcallcancel') {
                requireMethod(sock, 'cancelGroupCall');
                const groupJid = args.shift();
                const callId = args.shift();
                if (!groupJid || !callId) return usage(reply);
                await sock.cancelGroupCall(groupJid, callId);
                return reply('Group call cancelled.');
            }
            if (sub === 'companionremove') {
                requireMethod(sock, 'removeCompanionDevice');
                const deviceJid = args.shift();
                if (!deviceJid) return usage(reply);
                await sock.removeCompanionDevice(deviceJid, args[0] || 'user_initiated');
                return reply('Companion device removed.');
            }
            if (sub === 'keyindex') {
                const action = args.shift() || 'send';
                if (action === 'send') {
                    requireMethod(sock, 'sendKeyIndexList');
                    await sock.sendKeyIndexList();
                    return reply('Key-index list reasserted.');
                }
                requireMethod(sock, 'updateKeyIndexList');
                const timestamp = Number(args.shift());
                const payload = args.shift();
                if (!Number.isFinite(timestamp) || !payload) return usage(reply);
                await sock.updateKeyIndexList(timestamp, Buffer.from(payload, 'base64'));
                return reply('Key-index list updated.');
            }
            if (sub === 'qr') {
                requireMethod(sock, 'fetchQRCode');
                if (!args[0]) return usage(reply);
                return reply(JSON.stringify(await sock.fetchQRCode(args[0])));
            }
            if (sub === 'logoutchallenge') {
                requireMethod(sock, 'confirmDeviceLogout');
                const id = args.shift();
                const decision = String(args.shift()).toLowerCase();
                if (!id || !['true', 'false'].includes(decision)) return usage(reply);
                await sock.confirmDeviceLogout(id, decision === 'true');
                return reply('Device logout challenge handled.');
            }
            if (sub === 'interop') {
                const actions = { init: 'initInterop', optin: 'optInIntegrators', optout: 'optOutIntegrators', tos: 'acceptInteropTOS' };
                const method = actions[args.shift()];
                if (!method) return usage(reply);
                requireMethod(sock, method);
                await sock[method]();
                return reply('Interop action completed.');
            }
            if (sub === 'reachability') {
                const action = args.shift();
                if (action === 'get') {
                    requireMethod(sock, 'getReachabilitySettings');
                    return reply(JSON.stringify(await sock.getReachabilitySettings()));
                }
                requireMethod(sock, 'setReachabilitySettings');
                if (!['true', 'false'].includes(String(args[0]).toLowerCase()) || !['true', 'false'].includes(String(args[1]).toLowerCase())) return usage(reply);
                await sock.setReachabilitySettings({ allow: args[0] === 'true', allowNonContacts: args[1] === 'true' });
                return reply('Reachability settings updated.');
            }
            if (sub === 'interopblock') {
                const action = args.shift();
                const method = action === 'block' ? 'blockInteropUser' : action === 'trust' ? 'trustInteropContact' : null;
                if (!method || !args[0]) return usage(reply);
                requireMethod(sock, method);
                await sock[method](args[0]);
                return reply(`Interop contact ${action === 'trust' ? 'trusted' : 'blocked'}.`);
            }
            if (sub === 'bot') {
                const action = args.shift();
                if (action === 'list') {
                    requireMethod(sock, 'getBotListV2');
                    return reply(JSON.stringify(await sock.getBotListV2()));
                }
                const method = { profile: 'getBotProfile', block: 'blockBot', unblock: 'unblockBot' }[action];
                if (!method || !args[0]) return usage(reply);
                requireMethod(sock, method);
                const result = await sock[method](args[0]);
                return reply(action === 'profile' ? JSON.stringify(result) : `Bot ${action}ed.`);
            }
            if (sub === 'disclosures') {
                const action = args.shift();
                if (action === 'list') {
                    requireMethod(sock, 'getUserDisclosures');
                    return reply(JSON.stringify(await sock.getUserDisclosures()));
                }
                requireMethod(sock, 'acceptTosNotice');
                if (!args[0] || !args[1]) return usage(reply);
                await sock.acceptTosNotice(args[0], args[1]);
                return reply('Disclosure accepted.');
            }
            if (sub === 'apppatch') {
                requireMethod(sock, 'appPatch');
                if (!args.length) return usage(reply);
                return reply(JSON.stringify(await sock.appPatch(JSON.parse(args.join(' ')))));
            }
            if (sub === 'chatmodify') {
                requireMethod(sock, 'chatModify');
                const jid = args.shift();
                const action = args.shift();
                if (!jid || !['archive', 'unarchive'].includes(action)) return usage(reply);
                await sock.chatModify({ archive: action === 'archive' }, jid);
                return reply('Chat modified.');
            }
            if (sub === 'businessdescription') {
                requireMethod(sock, 'updateBusinessProfile');
                const description = args.join(' ').trim();
                if (!description) return usage(reply);
                await sock.updateBusinessProfile({ description });
                return reply('Business description updated.');
            }
            return usage(reply);
        } catch (error) {
            console.error('[BAILEYS 2.7.4 COMMAND]', error);
            return reply(`Baileys error: ${error.message}`);
        }
    }
};
