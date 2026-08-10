// PDF.js — multi-page PDF builder.
// • .pdf add            → queue the replied JPG/PNG image as a page
// • .pdf addtext <txt>  → queue text as a page (auto page-breaks when full)
// • .pdf text <txt>     → convert text straight to a PDF right away
// • .pdf del <n>        → remove a queued page
// • .pdf clear          → clear the queue
// • .pdf push           → build & send the PDF
// Rewritten on pdfkit so TEXT pages flow across pages automatically — the
// document just grows a new page whenever one fills up.
// (@crysnovax—FIX14-08-26)
const { PDFDocument } = require('pdf-lib');

module.exports = {
    name: 'pdf',
    alias: ['topdf', 'imgtopdf', 'imagepdf', 'textpdf'],
    category: 'tools',
    desc: 'Build multi-page PDF from images and text (auto page breaks)',
    reactions: { start: '📃', success: '📂', error: '❌' },

    execute: async (sock, m, { args, reply, prefix }) => {
        try {
            if (!global.pdfQueue) global.pdfQueue = {};
            const chat = m.chat;
            if (!global.pdfQueue[chat]) global.pdfQueue[chat] = { pages: [] };
            const queue = global.pdfQueue[chat];
            const sub = args[0] ? args[0].toLowerCase() : null;

            // ── USAGE ────────────────────────────────────────────────
            if (!sub) {
                let out = '📄 *PDF Builder*\n\n' + `✦ *Pages in queue:* ${queue.pages.length}\n\n`;
                if (queue.pages.length > 0) {
                    queue.pages.forEach((p, i) => {
                        const tag = p.mime === 'text' ? '📝' : (p.mime.includes('png') ? '🖼️ PNG' : '🖼️ JPG');
                        out += `${i + 1}. ${tag}\n`;
                    });
                } else out += 'Queue is empty.\n';
                out += '\nCommands:\n' +
                    `• ${prefix}pdf add → add replied image\n` +
                    `• ${prefix}pdf addtext <text> → add text page (auto page-break)\n` +
                    `• ${prefix}pdf text <text> → text to PDF right now\n` +
                    `• ${prefix}pdf del <number> → remove page\n` +
                    `• ${prefix}pdf clear → clear everything\n` +
                    `• ${prefix}pdf push → generate & send PDF`;
                return reply(out);
            }

            // ── ADD IMAGE ────────────────────────────────────────────
            if (sub === 'add') {
                const quoted = m.quoted;
                const isImg = quoted && (quoted.mtype === 'imageMessage' || quoted.message?.imageMessage || quoted.isImage || quoted.isImg);
                if (!isImg) {
                    return reply(`✘ *Reply to a JPG or PNG image!*\n\n_Usage: reply to photo → ${prefix}pdf add_`);
                }
                const buffer = await quoted.download();
                const mime = quoted.mimetype || quoted.message?.imageMessage?.mimetype || '';
                if (!mime.includes('jpeg') && !mime.includes('png') && !mime.includes('jpg')) {
                    return reply('𓄄 _*Only JPG and PNG images are supported.*_');
                }
                queue.pages.push({ buffer, mime });
                return reply(`✓ _*Page added!*_ ❏ Total pages: ${queue.pages.length}*_`);
            }

            // ── ADD TEXT PAGE ────────────────────────────────────────
            if (sub === 'addtext' || sub === 'txt' || sub === 'addtxt') {
                let text = args.slice(1).join(' ').trim();
                if (!text && m.quoted) text = (m.quoted.text || m.quoted.caption || '').trim();
                if (!text) return reply(`✘ _Usage: ${prefix}pdf addtext <your text here>_`);
                queue.pages.push({ mime: 'text', text });
                return reply(`✓ _*Text page added!*_ ❏ Total pages: ${queue.pages.length}*_`);
            }

            // ── TEXT → PDF DIRECTLY ──────────────────────────────────
            if (sub === 'text') {
                let text = args.slice(1).join(' ').trim();
                if (!text && m.quoted) text = (m.quoted.text || m.quoted.caption || '').trim();
                if (!text) return reply(`✘ _Usage: ${prefix}pdf text <your text here>_`);
                const pdf = await textToPdf(text);
                await sock.sendMessage(chat, {
                    document: pdf,
                    mimetype: 'application/pdf',
                    fileName: 'my-text-' + Date.now() + '.pdf'
                }, { quoted: m });
                return reply('❏ _*PDF with your text sent!*_ 𝓬𝓻𝔂𝓼𝓷𝓸𝓿𝓪𝔁 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭');
            }

            // ── DEL PAGE ─────────────────────────────────────────────
            if (sub === 'del') {
                const n = parseInt(args[1]);
                if (!n || n < 1 || n > queue.pages.length) {
                    return reply(`⚉ _*Invalid page number!\nCurrent pages: ${queue.pages.length}*_`);
                }
                queue.pages.splice(n - 1, 1);
                return reply(`✓ _*Page ${n} removed!*_ Remaining: ${queue.pages.length}*_`);
            }

            // ── CLEAR ────────────────────────────────────────────────
            if (sub === 'clear') {
                global.pdfQueue[chat] = { pages: [] };
                return reply('✦ _*Queue cleared!*_');
            }

            // ── PUSH (build & send) ──────────────────────────────────
            if (sub === 'push') {
                if (queue.pages.length === 0) return reply('𓉤 _*Queue is empty!*_ _Add some pages first._');
                const doc = await PDFDocument.create();

                for (const page of queue.pages) {
                    if (page.mime === 'text') {
                        await appendTextPage(doc, page.text);
                    } else {
                        let img;
                        try {
                            img = page.mime.includes('png')
                                ? await doc.embedPng(page.buffer)
                                : await doc.embedJpg(page.buffer);
                        } catch { continue; }
                        const p = doc.addPage([595, 842]); // A4
                        const { width, height } = img;
                        const scale = Math.min((595 * 0.95) / width, (842 * 0.95) / height);
                        const w = width * scale, h = height * scale;
                        p.drawImage(img, { x: (595 - w) / 2, y: (842 - h) / 2, width: w, height: h });
                    }
                }

                const pdfBytes = await doc.save();
                const pdfBuf = Buffer.from(pdfBytes);
                const jid = m.chat || m.from || m.key?.remoteJid;
                await sock.sendMessage(jid, {
                    document: pdfBuf,
                    mimetype: 'application/pdf',
                    fileName: 'my-pdf-' + Date.now() + '.pdf'
                }, { quoted: m });
                global.pdfQueue[chat] = { pages: [] };
                return reply('❏ _*PDF sent!*_ 𝓬𝓻𝔂𝓼𝓷𝓸𝓿𝓪𝔁 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭');
            }

            return reply('❌ Unknown command!\nType *' + prefix + 'pdf* to see usage.');
        } catch (err) {
            console.error('[PDF Error]', err);
            return reply('❌ Error: ' + (err.message || 'Failed to process PDF'));
        }
    }
};

// ── pdfkit helpers (text flows across pages automatically) ────────────────
function pdfkitDoc() {
    const PDFDocument = require('pdfkit');
    return new PDFDocument({ size: 'A4', margin: 48 });
}

// Render plain text to a PDF buffer. pdfkit adds a new page automatically
// whenever the current page fills up.
function textToPdf(text) {
    return new Promise((resolve, reject) => {
        const doc = pdfkitDoc();
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        writeTextLines(doc, text);
        doc.end();
    });
}

// Write text line-by-line so pdfkit auto-paginates long content.
function writeTextLines(doc, text) {
    const lines = String(text || '').split(/\r?\n/);
    let first = true;
    for (const raw of lines) {
        const trimmed = raw.trim();
        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            doc.moveDown(first ? 0 : 0.7);
            doc.font('Helvetica-Bold').fontSize(level === 1 ? 20 : level === 2 ? 16 : 13)
                .fillColor('#111111').text(heading[2]);
            first = false;
            continue;
        }
        if (/^\s*[-*]\s+/.test(trimmed) || /^\s*\d+\.\s+/.test(trimmed)) {
            doc.font('Helvetica').fontSize(10.5).fillColor('#222222')
                .text(trimmed.replace(/^\s*[-*]\s+/, '•  ').replace(/^\s*\d+\.\s+/, (mm) => mm.trim() + '  '), { lineGap: 2 });
            first = false;
            continue;
        }
        if (!trimmed) { doc.moveDown(0.4); first = false; continue; }
        const clean = trimmed
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        doc.font('Helvetica').fontSize(10.5).fillColor('#222222').text(clean, { lineGap: 2 });
        first = false;
    }
}

// Append a text page to an existing pdf-lib document by converting the text
// through pdfkit first, then embedding each pdfkit page into pdf-lib.
async function appendTextPage(doc, text) {
    const PDFDocument = require('pdf-lib').PDFDocument;
    const partial = await textToPdf(text);
    const src = await PDFDocument.load(partial, { ignoreEncryption: true });
    const pages = await doc.copyPages(src, src.getPageIndices());
    for (const p of pages) doc.addPage(p);
}
