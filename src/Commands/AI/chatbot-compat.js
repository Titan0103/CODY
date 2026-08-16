/**
 * Compatibility bridge for CODY's legacy chatbot.
 *
 * PLOGME is the primary auto-reply brain. The legacy Core chatbot remains
 * reachable for existing `.chatbot on` users until they migrate to PLOGME.
 * This bridge deliberately skips the legacy brain whenever PLOGME is enabled
 * for the chat, preventing duplicate replies.
 */
async function handleChatbotCompatibility(sock, message, store, { legacy, active } = {}) {
    const chat = message?.chat;
    if (!chat || !legacy || typeof legacy.isEnabled !== 'function') return false;
    if (active?.isEnabled?.(chat)) return false;
    if (typeof legacy.handleIncomingMessage !== 'function') return false;

    try {
        const result = await legacy.handleIncomingMessage(sock, message, store);
        return result === undefined ? true : Boolean(result);
    } catch (error) {
        console.error('[LEGACY CHATBOT ERROR]', error?.message || error);
        return false;
    }
}

module.exports = { handleChatbotCompatibility };
