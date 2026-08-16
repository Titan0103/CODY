const poststory = require('./poststory.js');

module.exports = {
    ...poststory,
    name: 'poststatus',
    alias: ['personalstatus', 'statuspost'],
    desc: 'Post a personal WhatsApp Status',
};
