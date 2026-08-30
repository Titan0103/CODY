const API_BASE = 'https://baron0.com';

async function checkNumber(apiKey, number) {
    const res = await fetch(`${API_BASE}/api/v2/check`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number }),
    });

    const body = await res.json();

    if (!res.ok) {
        throw new Error(`[${body.status}] ${body.title}: ${body.detail} (requestId: ${body.requestId})`);
    }

    return body; // { status: 'ok', banned: boolean, reason?: string }
}

async function bulkCheckNumbers(apiKey, numbers) {
    const res = await fetch(`${API_BASE}/api/v2/bulk-check`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ numbers }),
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    return body.results; // [{ number, status, banned, reason? }, ...]
}

function normalizeNumber(value = '') {
    return String(value).replace(/[^0-9+]/g, '');
}

function formatBanResult(result) {
    const lines = [
        `Number: ${result.number}`,
        `Status: ${result.status}`,
        `Banned: ${result.banned ? 'YES' : 'NO'}`,
    ];
    if (result.reason) lines.push(`Reason: ${result.reason}`);
    if (result.banned) {
        lines.push('Source: baron0.com Ban Check API');
    } else {
        lines.push('Source: baron0.com Ban Check API');
    }
    return lines.join('\n');
}

function formatBulkResult(results) {
    const lines = ['Bulk Ban Check Results:', ''];
    for (const r of results) {
        const status = r.banned ? '🚫 BANNED' : '✅ CLEAN';
        let line = `${r.number}: ${status}`;
        if (r.banned && r.reason) line += ` (${r.reason})`;
        lines.push(line);
    }
    return lines.join('\n');
}

module.exports = {
    name: 'bancheck',
    alias: ['checkban', 'numbercheck', 'bc'],
    category: 'Owner',
    ownerOnly: true,
    desc: 'Check WhatsApp ban status via baron0.com API',
    execute: async (_sock, m, { args = [], reply }) => {
        const apiKey = process.env.BARON0_API_KEY;
        if (!apiKey) {
            return reply('BARON0_API_KEY is not set. Please add it in Settings → Environment.');
        }

        const diagnostic = args.some((arg) => /^(--)?debug$/i.test(String(arg)));
        const numberArg = args.find((arg) => !/^(--)?debug$/i.test(String(arg)));
        const number = normalizeNumber(numberArg || m?.sender || '');

        if (!number) {
            return reply('Usage: .bancheck <country-code-and-number>\nExample: .bancheck +491701234567');
        }

        try {
            const result = await checkNumber(apiKey, number.startsWith('+') ? number : `+${number}`);
            return reply(formatBanResult(result));
        } catch (error) {
            return reply(`Ban check failed for ${number}: ${error?.message || error}`);
        }
    },
    formatBanResult,
    formatBulkResult,
    normalizeNumber,
    checkNumber,
    bulkCheckNumbers,
};
