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

            // Free, no-key Google Emoji Kitchen image endpoint.
            // The emoji pair is encoded as a path segment so variation selectors
            // and non-ASCII emoji survive URL construction correctly.
            const pair = encodeURIComponent(`${emoji1}_${emoji2}`);
            const imageUrl = `https://emojik.vercel.app/s/${pair}?size=512`;

            const response = await fetch(imageUrl, {
                headers: { accept: 'image/png,image/*;q=0.9', 'user-agent': 'CODY-AI/2.0' }
            });
            if (!response.ok) {
                if (response.status === 404) return reply("𓉤 _*Emoji cannot be mixed*_.");
                throw new Error(`Emoji Kitchen request failed (${response.status})`);
            }
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.startsWith('image/')) {
                throw new Error('Emoji Kitchen returned a non-image response');
            }

            const tmpDir = path.join(process.cwd(), "tmp");
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }

            const tempFile = path.join(tmpDir, `mix_${Date.now()}.png`);
            const outputFile = path.join(tmpDir, `mix_${Date.now()}.webp`);

            /* Download image */

            const imageResponse = response;
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
