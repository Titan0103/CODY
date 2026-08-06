// togglereact → the real cmdreact command. Toggles CMD_REACT (was AUTO_REACT).
// When on, commands react, and the reaction is removed once the command
// succeeds. When a command fails, the failed reaction stays + the error is
// sent to the owner's DM. @crysnovax—FIX06-08-26
const { setVar, getVar } = require('../../Plugin/configManager');

module.exports = {
    name: 'cmdreact',
    alias: ['togglereact', 'reactionmode', 'creact'],
    desc: 'Toggle command reactions (CMD_REACT) on/off',
    category: 'Owner',
    ownerOnly: true,

    execute: async (sock, m, { args, reply }) => {
        const current = getVar('CMD_REACT', getVar('AUTO_REACT', true));
        const sub = args[0]?.toLowerCase();

        let newVal;
        if (sub === 'on') newVal = true;
        else if (sub === 'off') newVal = false;
        else newVal = !current;

        setVar('CMD_REACT', newVal);

        if (newVal) {
            return reply('_✓ CMD_REACT → ON_ — commands react, and the reaction is removed once the command succeeds.');
        }
        return reply('_✘ CMD_REACT → OFF_ — no more command reactions.');
    }
};
