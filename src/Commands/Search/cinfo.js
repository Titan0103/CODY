const axios = require('axios');

// restcountries.com's free v1–v4 endpoints were shut down and v5 requires an
// API key — so this command sources from Wikipedia REST (always works, gives
// name + extract + image + link) with countriesnow.space layered on top for
// capital/currency/population as BEST-EFFORT extras. A countriesnow rate-limit
// or outage can never fail the command — only Wikipedia is required.
// (@crysnovax—FIX12-08-26)
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; CRYSNOVA-Bot; +https://github.com/crysnovax)' };
const get = (url, timeout = 12000) => axios.get(url, { timeout, headers: UA });
const post = (url, body) => axios.post(url, body, { timeout: 6000, headers: UA });

module.exports = {
    name: 'countryinfo',
    alias: ['country', 'nation', 'flag'],
    desc: 'Get detailed country information',
    category: 'Search',
    usage: `${prefix}countryinfo <country name>`,

    execute: async (sock, m, { args, reply, prefix }) => {
        const country = args.join(' ').trim();

        if (!country) {
            return reply(
                `╭─❍ *COUNTRY INFO*\n│\n` +
                `│ ⚉ *Usage:* ${prefix}countryinfo <name>\n│\n` +
                `│ ✪ *Examples:*\n` +
                `│ ${prefix}countryinfo Nigeria\n` +
                `│ ${prefix}countryinfo Japan\n` +
                `│ ${prefix}countryinfo "United States"\n│\n` +
                `│ 🌍 *Detailed country data*\n` +
                `╰──────────────────`
            );
        }

        await sock.sendMessage(m.chat, { react: { text: '🌍', key: m.key } });

        let wiki = null;
        let extras = { capital: null, currency: null, population: null };

        // Wikipedia is the reliable core — fetch it first.
        try {
            wiki = (await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(country)}`)).data;
        } catch (err) {
            // title may include "country" suffix the user didn't type — retry once
            try {
                wiki = (await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(country + ' (country)')}`)).data;
            } catch {}
        }

        if (!wiki?.extract && !wiki?.title) {
            await sock.sendMessage(m.chat, { react: { text: '🏗️', key: m.key } });
            return reply(`\`✘ Could not find info for "${country}". Check spelling and try again.\``);
        }

        // Best-effort structured stats — each independently, never fatal.
        try {
            const [capitalRes, currencyRes, popRes] = await Promise.allSettled([
                post('https://countriesnow.space/api/v0.1/countries/capital', { country }),
                post('https://countriesnow.space/api/v0.1/countries/currency', { country }),
                post('https://countriesnow.space/api/v0.1/countries/population', { country }),
            ]);
            extras.capital = capitalRes.status === 'fulfilled' ? capitalRes.value?.data?.data?.capital : null;
            extras.currency = currencyRes.status === 'fulfilled' ? currencyRes.value?.data?.data?.currency : null;
            const popData = popRes.status === 'fulfilled' ? popRes.value?.data?.data : null;
            if (popData?.populationCounts?.length) {
                extras.population = Number(popData.populationCounts[popData.populationCounts.length - 1].value).toLocaleString();
            }
        } catch {}

        const name = wiki.title || country;
        const lines = [`🌍 *${name}*`];
        if (extras.capital) lines.push(`🏙️ Capital: *${extras.capital}*`);
        if (extras.population) lines.push(`👥 Population: *${extras.population}*`);
        if (extras.currency) lines.push(`💰 Currency: *${extras.currency}*`);
        if (wiki.description) lines.push(`🗂️ ${wiki.description}`);
        if (wiki.extract) {
            lines.push(`\n📖 ${wiki.extract.slice(0, 420)}${wiki.extract.length > 420 ? '…' : ''}`);
        }
        const link = wiki.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(country)}`;
        lines.push(`\n🔗 ${link}`);

        // Send the article thumbnail as a picture card when available.
        if (wiki.thumbnail?.source) {
            try {
                await sock.sendMessage(m.chat, {
                    image: { url: wiki.thumbnail.source },
                    caption: lines.join('\n'),
                }, { quoted: m });
                await sock.sendMessage(m.chat, { react: { text: '🔖', key: m.key } });
                return;
            } catch {}
        }

        await sock.sendMessage(m.chat, { text: lines.join('\n') }, { quoted: m });
        await sock.sendMessage(m.chat, { react: { text: '🔖', key: m.key } });
    }
};
