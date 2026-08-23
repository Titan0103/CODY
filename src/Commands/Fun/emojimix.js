const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
// PACK_NAME branding — ⚉ • <PACK_NAME> (@crysnovax—FIX09-08-26)
const { addExif } = require('../../../library/exif');
const { getStickerBranding } = require('../../Plugin/packname');

module.exports = {
    name: "emojimix",
    alias: ["mixemoji", "emoji"],
    category: "fun",
     // ⭐ Reaction config
    reactions: {
        start: '👌',
        success: '✨'
    },
    

    execute: async (sock, m, { args, reply }) => {

        try {

            const text = args.join(" ");

            if (!text || !text.includes("+")) {
                return reply("🎴 _*Example:\n.emojimix 😎+🥰*_");
            }

            let [emoji1, emoji2] = text.split("+").map(e => e.trim());

            const tenorApiKey = process.env.TENOR_API_KEY;
            if (!tenorApiKey) {
                return reply('✘ Emoji Mix is unavailable because TENOR_API_KEY is not configured.');
            }

            const url =
                `https://tenor.googleapis.com/v2/featured?` +
                `key=${encodeURIComponent(tenorApiKey)}` +
                `&contentfilter=high` +
                `&media_filter=png_transparent` +
                `&collection=emoji_kitchen_v5` +
                `&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Tenor request failed (${response.status})`);
            const data = await response.json();

            if (!data.results?.length) {
                return reply("𓉤 _*Emoji cannot be mixed*_.");
            }

            const imageUrl = data.results[0].url;

            const tmpDir = path.join(process.cwd(), "tmp");
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }

            const tempFile = path.join(tmpDir, `mix_${Date.now()}.png`);
            const outputFile = path.join(tmpDir, `mix_${Date.now()}.webp`);

            /* Download image */

            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) throw new Error(`Emoji image download failed (${imageResponse.status})`);
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            fs.writeFileSync(tempFile, imageBuffer);

            /* Convert to sticker */

            const ffmpegCmd =
                `ffmpeg -y -i "${tempFile}" ` +
                `-vf "scale=512:512:force_original_aspect_ratio=decrease,` +
                `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" ` +
                `"${outputFile}"`;

            await new Promise((resolve, reject) => {
                exec(ffmpegCmd, err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            if (!fs.existsSync(outputFile)) {
                return reply("✘ *Sticker generation failed*.");
            }

            let stickerBuffer = fs.readFileSync(outputFile);

            // apply ⚉ • <PACK_NAME> branding before sending
            try {
                const { pack, author } = getStickerBranding();
                stickerBuffer = await addExif(stickerBuffer, pack, author, ['🔥']);
            } catch {}

            await sock.sendMessage(
                m.key.remoteJid,
                {
                    sticker: stickerBuffer
                },
                { quoted: m }
            );

            /* Cleanup */

            try {
                fs.unlinkSync(tempFile);
                fs.unlinkSync(outputFile);
            } catch {}

        } catch (err) {

            console.error("EmojiMix Error:", err.message);
            reply("❌ Failed to mix emojis.");

        }
    }
};
