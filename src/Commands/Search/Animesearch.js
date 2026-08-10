const axios = require('axios');
const config = require('../../../settings/config');

// Prefer the real env token (process.env.GATEWAY_TOKEN) — config only holds a
// dev placeholder. Without this fallback the command hit the gateway with the
// placeholder and always failed. (@crysnovax—FIX12-08-26)
const GATEWAY_URL = process.env.GATEWAY_URL || config.api?.gateway || 'https://api.crysnovax.link';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || config.api?.gatewayToken || '';

module.exports = {
    name: 'animesearch',
    alias: ['anisearch', 'findanime'],
    desc: 'Search for anime with beautiful swipeable cards',
    category: 'Anime',
    usage: `${prefix}animesearch <title>`,

    execute: async (sock, m, { args, reply }) => {
        const query = args.join(' ').trim();
        if (!query) return reply('_Provide an anime title to search._');

        const fetchResults = async () => {
            const res = await axios.get(
                `${GATEWAY_URL}/anime/animesearch?token=${encodeURIComponent(GATEWAY_TOKEN)}&query=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            );
            // accept every plausible response shape: {data:{results}} | {results} | {result}
            const d = res.data?.data || res.data || {};
            return d.results || d.result || [];
        };

        let results = [];
        try {
            results = await fetchResults();
        } catch (err) {
            // one retry — the gateway can be flaky
            try { results = await fetchResults(); } catch {}
        }

        if (!Array.isArray(results) || results.length === 0) {
            return reply('`✘ No results found — the gateway may be down or the token may be missing.`');
        }

        await sock.sendMessage(m.chat, { react: { text: '🎬', key: m.key } });

        // 1) Plain-text summary first — reliable on every fork, so the command
        //    NEVER dies on the fancier card payload.
        const summary = results.slice(0, 6).map((a, i) =>
            `${i + 1}. *${a.title || a.name || '?'}*\n   📺 ${a.type || ''} ${a.status || ''} ${a.episode || ''}\n   🔗 ${a.url || ''}`
        ).join('\n');
        await sock.sendMessage(m.chat, {
            text: `𖣘 *ANIME SEARCH: ${query}* — ${results.length} results\n\n${summary}`
        }, { quoted: m });

        // 2) Then try the interactive carousel cards — if the fork rejects
        //    them we already delivered the summary, so nothing is lost.
        try {
            const cards = results.slice(0, 10).map(anime => ({
                image: { url: anime.image },
                caption: `🎬 *${anime.title}*\n📺 ${anime.type} | ${anime.status} | ${anime.episode}`,
                footer: `⚉ CRYSNOVA Gateway`,
                nativeFlow: [{
                    text: '🔖 Open Link',
                    url: anime.url
                }, {
                    text: '📋 Copy Title',
                    copy: anime.title
                }]
            }));
            await sock.sendMessage(m.chat, {
                text: `𖣘 *ANIME SEARCH: ${query}*`,
                footer: `Found ${results.length} results`,
                cards: cards
            }, { quoted: m });
            await sock.sendMessage(m.chat, { react: { text: '🎭', key: m.key } });
        } catch (err) {
            console.error('[ANIMESEARCH CARDS]', err.message);
        }
    }
};
