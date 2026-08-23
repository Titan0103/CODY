const NEXRAY_SUNO_URL = 'https://api.nexray.eu.cc/ai/suno';
const REQUEST_TIMEOUT_MS = 150_000;

function parseMusicPrompt(args = []) {
  const raw = args.join(' ').trim();
  if (!raw) return null;

  const [promptPart, tagsPart, durationPart] = raw.split('|').map(value => value.trim());
  const prompt = promptPart || raw;
  const tags = tagsPart || '';
  const duration = durationPart && /^\d+$/.test(durationPart) ? Number(durationPart) : null;

  return { prompt, tags, duration };
}

async function generateMusic(input) {
  const prompt = [
    input.prompt,
    input.tags ? `Tags: ${input.tags}` : '',
    input.duration ? `Duration: ${input.duration} seconds` : ''
  ].filter(Boolean).join(' | ');
  const url = `${NEXRAY_SUNO_URL}?${new URLSearchParams({ prompt })}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'CODY-AI/2.0' }
    });
    const body = await response.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`music API returned non-JSON HTTP ${response.status}`);
    }
    if (!response.ok || data?.status !== true || !data?.result?.url) {
      throw new Error(data?.message || data?.error || `music API HTTP ${response.status}`);
    }
    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAudio(url) {
  const response = await fetch(url, {
    headers: { accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8', 'user-agent': 'CODY-AI/2.0' }
  });
  if (!response.ok) throw new Error(`audio download HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('music API returned an empty audio file');
  return Buffer.from(bytes);
}

module.exports = {
  name: 'musicgen',
  alias: ['musicai', 'aimusic', 'genmusic', 'text2music'],
  desc: 'Generate AI music from a description using the Suno-compatible Nexray API',
  category: 'AI',
  usage: '.musicgen <description> | <tags> | <duration>',
  execute: async (sock, m, { args, reply }) => {
    const input = parseMusicPrompt(args);
    if (!input) {
      return reply(
        '🎵 *Music Generator*\n\n' +
        'Usage: .musicgen <description> | <tags> | <duration>\n' +
        'Example: .musicgen Afrobeats song about hope | afrobeats, uplifting | 180'
      );
    }

    await sock.sendMessage(m.chat, { react: { text: '🎵', key: m.key } }).catch(() => {});
    let progress;
    try {
      progress = await sock.sendMessage(m.chat, {
        text: '🎼 Generating your music… this may take up to a few minutes.'
      }, { quoted: m });
      const result = await generateMusic(input);
      const audio = await fetchAudio(result.url);
      const title = String(result.title || input.prompt).slice(0, 80);
      const tags = result.tags ? `\nTags: ${result.tags}` : '';
      const duration = result.duration ? `\nDuration: ${result.duration}s` : '';

      await sock.sendMessage(m.chat, {
        audio,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${title.replace(/[^a-z0-9._ -]/gi, '').trim() || 'cody-music'}.mp3`,
        contextInfo: {
          externalAdReply: {
            title,
            body: `CODY Music Generator${tags}${duration}`,
            mediaType: 2,
            thumbnailUrl: result.thumbnail || undefined,
            sourceUrl: result.url,
            renderLargerThumbnail: true,
            showAdAttribution: false
          }
        }
      }, { quoted: m });

      if (progress?.key) await sock.sendMessage(m.chat, { delete: progress.key }).catch(() => {});
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
    } catch (error) {
      if (progress?.key) await sock.sendMessage(m.chat, { delete: progress.key }).catch(() => {});
      console.error('[MUSICGEN]', error.stack || error.message);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply(`✘ Music generation failed: ${error.message}`);
    }
  }
};

module.exports.parseMusicPrompt = parseMusicPrompt;
module.exports.generateMusic = generateMusic;
