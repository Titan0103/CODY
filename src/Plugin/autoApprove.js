// autoApprove.js — group join requests get approved automatically after a
// delay (default 60s, adjustable), with an optional country-code filter.
// Vars: AUTO_APPROVE, AUTO_APPROVE_DELAY (seconds), AUTO_APPROVE_CC.
// @crysnovax—FIX06-08-26
const { getVar } = require('./configManager');

const pending = new Map(); // `${groupId}:${jid}` -> firstSeen timestamp
let interval = null;
let approvalGroups = []; // group metadata of groups with joiningApprovalMode on
let tickCount = 0;

async function refreshApprovalGroups(sock) {
    try {
        if (typeof sock.groupFetchAllParticipating !== 'function') return;
        const groups = await sock.groupFetchAllParticipating();
        approvalGroups = Object.values(groups || {}).filter(g => g?.joiningApprovalMode);
    } catch (err) {
        console.error('[AUTO-APPROVE] refresh failed:', err.message);
    }
}

async function tick(sock) {
    try {
        if (!getVar('AUTO_APPROVE', false)) return;

        const delayMs = (parseInt(getVar('AUTO_APPROVE_DELAY', 60), 10) || 60) * 1000;
        const cc = String(getVar('AUTO_APPROVE_CC') || '').trim();
        const now = Date.now();

        for (const g of approvalGroups) {
            const pend = g?.pendingParticipants || [];
            if (!pend.length) continue;

            for (const p of pend) {
                const jid = p?.id;
                if (!jid) continue;

                // country code filter, e.g. cc = "234" only approves +234 numbers
                if (cc) {
                    const num = jid.split('@')[0].replace(/\D/g, '');
                    if (!num.startsWith(cc)) {
                        pending.delete(`${g.id}:${jid}`);
                        continue;
                    }
                }

                const key = `${g.id}:${jid}`;
                if (!pending.has(key)) pending.set(key, now);

                if (now - pending.get(key) >= delayMs) {
                    try {
                        if (typeof sock.groupAcceptJoinRequest === 'function') {
                            await sock.groupAcceptJoinRequest(g.id, jid);
                            console.log(`[AUTO-APPROVE] approved ${jid} in ${g.id}`);
                        }
                    } catch (err) {
                        console.error('[AUTO-APPROVE] approve failed:', err.message);
                    }
                    pending.delete(key);
                }
            }
        }

        // forget stale requests after 24h
        for (const [key, ts] of pending) {
            if (now - ts > 24 * 3600000) pending.delete(key);
        }
    } catch (err) {
        console.error('[AUTO-APPROVE] tick error:', err.message);
    }
}

function setupAutoApprove(sock) {
    if (interval) return;

    refreshApprovalGroups(sock);
    console.log('[AUTO-APPROVE] started — polling join requests every 30s');

    interval = setInterval(() => {
        tickCount++;
        // refresh the group list every 10th tick (~5 minutes)
        if (tickCount % 10 === 0) refreshApprovalGroups(sock);
        tick(sock);
    }, 30000);
}

module.exports = { setupAutoApprove };
