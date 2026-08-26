// Local replacement for wa-sticker-formatter.
// The search command already produces WebP; keep conversion and metadata pure-JS.
const { addExif } = require('../../../library/exif');

class Sticker {
    constructor(buffer, options = {}) {
        this.buffer = buffer;
        this.options = options;
    }

    async toBuffer() {
        const pack = this.options.pack || this.options.packname || 'CRYSNOVA';
        const author = this.options.author || 'CODY';
        return addExif(this.buffer, pack, author, ['🔥']);
    }
}

module.exports = { Sticker };
