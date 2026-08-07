// lunav.js — Luna AI Voice: a smart AI answer, read aloud as a voice note.
// Text generation now uses the working PREXZY chat endpoints (same as .luna)
// instead of the dead appex.crysnovax.link gateway, which was returning 500.
// TTS uses the CRYSNOVA gateway with a Google Translate TTS fallback.
// @crysnovax—FIX08-07-26
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');

const PREXZY = 'https://prexzyapis.com';
const TTS_GATEWAY = 'https://api.crysnovax.link/tools/tts';
const TTS_TOKEN = 'x';
const GOOGLE_TTS = 'https://translate.google.com/translate_tts';

const CHUNK_SIZE = 180;
const MAX_TOTAL_CHARS = 1600;

const SYSTEM_PROMPT =
    'You are Luna AI, a highly intelligent and helpful AI assistant. Give a direct, accurate, and informative answer to this question. Be concise but thorough. Question: ';
const PROFESSIONAL_PROMPT =
    'SYSTEM: You are a professional AI. No flirting. No roleplay. Just facts.\n\nUSER: ';

function splitTextIntoChunks(text, size) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let current = '';
    for (const s of sentences) {
        if ((current + s).length <= size) current += s;
        else {
            if (current) chunks.push(current.trim());
            current = s;
        }
    }
    if (current) chunks.push(current.trim());
    return chunks.filter(Boolean);
}

async function askLuna(query) {
    const endpoints = [
        `${PREXZY}/ai/ch?q=`,
        `${PREXZY}/ai/askgpt5?prompt=`,
    ];
    for (const ep of endpoints) {
        try {
            const { data } = await axios.get(ep + encodeURIComponent(query), { timeout: 60000 });
            const text = data?.response || data?.result || data?.text || data?.message || data?.output;
            if (typeof text === 'string' && text.trim().length > 3) return text.trim();
        } catch {}
    }
    return null;
}

async function downloadTTSChunk(text, outFile) {
    const urls = [
        `${TTS_GATEWAY}?text=${encodeURIComponent(text)}&token=${encodeURIComponent(TTS_TOKEN)}`,
        `${GOOGLE_TTS}?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`,
    ];
    let lastErr = null;
    for (const url of urls) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            const buf = Buffer.from(res.data);
            // skip empty bodies and HTML error pages
            if (buf.length > 1000 && buf[0] !== 0x3c) {
                fs.writeFileSync(outFile, buf);
                return;
            }
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('TTS download failed');
}

function runFfmpeg(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve();
        });
    });
}

async function concatenateMP3s(chunks, outMp3) {
    const listFile = outMp3 + '.list.txt';
    fs.writeFileSync(listFile, chunks.map(c => `file '${c}'`).join('\n'));
    try {
        await runFfmpeg(`ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outMp3}" -y`);
    } finally {
        try { fs.unlinkSync(listFile); } catch {}
    }
}

async function convertToVoiceNote(inMp3, outOgg) {
    await runFfmpeg(`ffmpeg -i "${inMp3}" -ac 1 -ar 48000 -c:a libopus -b:a 16k "${outOgg}" -y`);
}

module.exports = {
    name: 'lunav',
    alias: ['lvoice', 'lv'],
    desc: 'Luna AI Voice — smart AI answers via voice note',
    category: 'Converter',
    reactions: { start: '🎙️', success: '✨', error: '🙈' },

    execute: async (sock, m, { args, reply }) => {
        const query = args.join(' ').trim();
        if (!query) return reply('_*⚉ Ask Luna something.*_');

        const tempDir = path.join(__dirname, '../../temp');
        try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}

        const stamp = Date.now();
        const concatMp3 = path.join(tempDir, `luna_${stamp}_concat.mp3`);
        const outOgg = path.join(tempDir, `luna_${stamp}.ogg`);
        const chunkFiles = [];

        try {
            await sock.sendMessage(m.chat, { react: { text: '🎙️', key: m.key } });

            let answer = await askLuna(SYSTEM_PROMPT + query);
            if (!answer) return reply('_*✦ Luna returned no response.*_');

            // anti-flirt guard — keep it professional
            if (/(flirty|darling|handsome)/i.test(answer)) {
                const retry = await askLuna(PROFESSIONAL_PROMPT + query);
                if (retry) answer = retry;
            }

            // clean text so the TTS reads it nicely
            answer = answer
                .replace(/[*_~`#]/g, '')
                .replace(/\[.*?\]\(.*?\)/g, '')
                .replace(/\n{3,}/g, '. ')
                .replace(/\n/g, '. ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (answer.length > MAX_TOTAL_CHARS) answer = answer.slice(0, MAX_TOTAL_CHARS) + '... truncated.';

            const chunks = splitTextIntoChunks(answer, CHUNK_SIZE);
            if (!chunks.length) return reply('_*✦ No text to speak.*_');

            for (let i = 0; i < chunks.length; i++) {
                const f = path.join(tempDir, `luna_${stamp}_chunk_${i}.mp3`);
                await downloadTTSChunk(chunks[i], f);
                chunkFiles.push(f);
            }

            await concatenateMP3s(chunkFiles, concatMp3);
            await convertToVoiceNote(concatMp3, outOgg);

            if (fs.existsSync(outOgg) && fs.statSync(outOgg).size > 0) {
                await sock.sendMessage(m.chat, {
                    audio: fs.readFileSync(outOgg),
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                }, { quoted: m });
                await sock.sendMessage(m.chat, { react: { text: '✨', key: m.key } });
            } else {
                return reply('_*✦ Voice generation failed.*_');
            }
        } catch (err) {
            console.error('[LUNAV ERROR]', err.message);
            await sock.sendMessage(m.chat, { react: { text: '🙈', key: m.key } }).catch(() => {});
            return reply('_*✦ Voice generation failed.*_');
        } finally {
            try { if (fs.existsSync(concatMp3)) fs.unlinkSync(concatMp3); } catch {}
            try { if (fs.existsSync(outOgg)) fs.unlinkSync(outOgg); } catch {}
            for (const f of chunkFiles) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
        }
    }
};
