const MENU_IMAGE = 'https://cdn.crysnovax.link/files/1786913837400-12ad05cc-468a-4d71-8de8-1e5a11b48f3b.jpeg';
const PANEL_URL = 'https://sl.crysnovax.link/PANEL2';
const PAIR_URL = 'https://pair.crysnovax.link';
const TUTORIAL5_URL = 'https://sl.crysnovax.link/tutorial5';
const TUTORIAL3_URL = 'https://sl.crysnovax.link/tutorial3';
const DISCORD_URL = 'https://discord.com';

const quoteOptions = message => ({ quoted: message });

const sendRich = async (sock, message, payload) => {
    if (typeof sock.richMenu !== 'function') {
        throw new Error('sock.richMenu is unavailable. Install @crysnovax/baileys 2.7.11 or newer and restart CODY.');
    }
    return sock.richMenu(message.chat, payload, quoteOptions(message));
};

const button = (id, text) => ({ id: `.deploy ${id}`, text });

const menuPayload = {
    header: {
        title: 'CODY AI Deployment Guide',
        image: { url: MENU_IMAGE, mime_type: 'image/jpeg' }
    },
    body: {
        row: true,
        cards: [
            {
                title: 'Deployment Steps',
                buttons: [
                    button('step1', 'Step 1 · Discord'),
                    button('step2', 'Step 2 · Panel'),
                    button('step3', 'Step 3 · Pair')
                ]
            },
            {
                title: 'Finish & Help',
                buttons: [
                    button('step4', 'Step 4 · Upload'),
                    button('help', 'Help'),
                    button('tutorials', 'Tutorials')
                ]
            }
        ]
    },
    footer: {
        text: 'Open a step for the current instructions',
        url: TUTORIAL5_URL
    }
};

const stepPayload = (title, text, buttons) => ({
    header: { title: `CODY AI · ${title}` },
    body: {
        row: true,
        cards: [{ title, buttons }]
    },
    footer: { text: 'Back to deployment menu', url: 'https://sl.crysnovax.link/PANEL2' },
    disclaimer: text
});

const STEPS = {
    step1: {
        title: 'Step 1 · Discord account',
        text: `Create an account at ${DISCORD_URL} if you do not already have one. Verify the email address, then keep the verified Discord account ready for panel verification.`,
        buttons: [button('step2', 'Next · Panel'), button('menu', 'Back to menu')]
    },
    step2: {
        title: 'Step 2 · Speciefy panel',
        text: `Visit ${PANEL_URL}, create an account, and verify it with Discord and your email address. After verification, create a Node.js server for CODY AI.`,
        buttons: [button('step3', 'Next · Pair'), button('step1', 'Back · Discord'), button('menu', 'Menu')]
    },
    step3: {
        title: 'Step 3 · Pair and generate',
        text: `Open ${PAIR_URL}. Fill in the required details and obtain your session ID. The owner number must begin with the country code and contain digits only: no plus sign, spaces, or formatting. Click Generate index.js, then download the generated file.`,
        buttons: [button('step4', 'Next · Upload'), button('step2', 'Back · Panel'), button('menu', 'Menu')]
    },
    step4: {
        title: 'Step 4 · Upload and start',
        text: `Upload the downloaded index.js to the panel server, place it in the server root, and start the server. Watch the console until the bot connects. If the panel asks for a startup command, use node index.js.`,
        buttons: [button('help', 'Help'), button('tutorials', 'Tutorials'), button('menu', 'Menu')]
    },
    help: {
        title: 'Deployment help',
        text: `If pairing fails, confirm that the number uses country code digits only and generate a fresh script. Confirm that Discord and panel email verification are complete, that index.js is in the server root, and that the server has started with node index.js.`,
        buttons: [button('step1', 'Step 1'), button('step3', 'Pair'), button('menu', 'Menu')]
    },
    tutorials: {
        title: 'Current tutorials',
        text: `Current guide: ${TUTORIAL5_URL}\nAdditional valid guide: ${TUTORIAL3_URL}\nPairing site: ${PAIR_URL}\nPanel: ${PANEL_URL}`,
        buttons: [button('step1', 'Start guide'), button('step3', 'Pair'), button('menu', 'Menu')]
    }
};

const deployCommand = {
    name: 'deploy',
    alias: ['pair'],
    desc: 'Open the interactive Gen4 CODY deployment guide',
    category: 'System',
    reactions: { start: '📚', success: '✅', error: '❌' },
    execute: async (sock, message, { args, reply }) => {
        const action = String(args?.[0] || 'menu').toLowerCase();

        try {
            if (action === 'menu' || action === 'start') {
                await sendRich(sock, message, menuPayload);
                return reply('Choose a deployment step from the Gen4 menu. Each button opens one quoted instruction.');
            }

            if (action === 'script') {
                return reply(`Generate the current index.js from ${PAIR_URL}; CODY does not send an embedded stale script. Use Step 3, then download the generated file.`);
            }

            const step = STEPS[action];
            if (!step) return reply('Use .deploy or .pair to open the Gen4 guide. Available actions: step1, step2, step3, step4, help, tutorials.');

            await sendRich(sock, message, stepPayload(step.title, step.text, step.buttons));
            return reply(step.text);
        } catch (error) {
            return reply(`Deployment guide failed: ${error?.message || error}`);
        }
    }
};

module.exports = deployCommand;
module.exports._internals = { menuPayload, STEPS, stepPayload };
