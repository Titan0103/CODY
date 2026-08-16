const MENU_IMAGE = 'https://cdn.crysnovax.link/files/1786913837400-12ad05cc-468a-4d71-8de8-1e5a11b48f3b.jpeg';

const card = (title, buttons) => ({
    title,
    image: { url: MENU_IMAGE },
    buttons
});

const testcard = {
    name: 'testcard',
    alias: ['cardtest'],
    desc: 'Send a Meta AI-style rich button grid test card',
    category: 'Owner',
    execute: async (sock, m, { reply }) => {
        if (typeof sock.sendRichButtonGrid !== 'function') {
            return reply('sendRichButtonGrid is unavailable. Install @crysnovax/baileys@2.7.10 and restart CODY.');
        }

        const payload = {
            text: 'MENU · gen4',
            footer: 'Meta AI-style menu',
            cards: [
                card('Menu 1', [
                    { id: 'ping', text: 'Ping' },
                    { id: 'menu2', text: 'Menu2' },
                    { id: 'tsm_cards', text: 'Tsm Cards' },
                    { id: 'refresh', text: 'Refresh' },
                    { id: 'restart', text: 'Restart' },
                    { id: 'safe', text: 'Safe' }
                ]),
                card('Menu 2', [
                    { id: 'tsmll', text: 'tsmll' },
                    { id: 'adinv', text: 'Adinv' },
                    { id: 'adinv2', text: 'Adinv2' },
                    { id: 'hexa', text: 'Hexa' },
                    { id: 'rpic', text: 'Rpic' },
                    { id: 'rpic2', text: 'Rpic2' }
                ])
            ]
        };

        try {
            await sock.sendRichButtonGrid(m.chat, payload);
            return reply('Meta AI-style test card sent. Tap a button to verify the response handler.');
        } catch (error) {
            return reply(`testcard failed: ${error?.message || error}`);
        }
    }
};

module.exports = testcard;
