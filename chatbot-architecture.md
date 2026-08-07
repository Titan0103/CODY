# CODY AI V2 — Chatbot / Auto-Reply Architecture (full explanation)

This document explains, end to end, how the auto-reply chatbot in **CODY AI V2**
(a Node.js WhatsApp bot on `@crysnovax/baileys`) works — from the message hook
in `?.js` down to the AI brain in `src/Commands/Core/❚.js`. It is written so
another AI model can rebuild an identical chatbot with the same logic, toggles,
memory, and model routing.

> Note: several command files are JavaScript-obfuscated, but the *Core brain*
> (`❚.js`) and the *hook* (`?.js`) are readable and are the real source of
> truth. Read them directly for exact code.

---

## 1. High-level flow

```
WhatsApp message
   │
   ▼
?.js  (message routing engine, module.exports = setupMessageHandler)
   │  - socks in every incoming message
   │  - builds the "m" object via smsg()
   │  - runs plugins (mute, anti-link, afk, dnd, autospam...)
   │  - runs the command router handleMessage(sock, m, store)
   │  - runs the chatbot brain hook:
   │      const { handleIncomingMessage } = require('./src/Commands/Core/❚.js')
   │      await handleIncomingMessage(sock, m, mek)
   ▼
❚.js  (the brain / controller, src/Commands/Core/❚.js)
   │  - decides IF the chatbot should reply (toggles, mode, global private)
   │  - decides WHAT the user said (text / voice / image)
   │  - builds a prompt (personality + training + history)
   │  - routes to AI models (PREXZY grok-4 → askgpt5 → gpt-5 → deepseek → …)
   │  - stores memory and replies through sock.sendMessage
   ▼
User receives the reply
```

---

## 2. The hook — `?.js`

`?.js` exports `setupMessageHandler(sock, customStore, handleMessage, smsg, io, config)`.
It attaches a `sock.ev.on('messages.upsert', ...)` listener. Every incoming
message goes through:

1. **Normalization** — `ephemeralMessage` is unwrapped, then `smsg()` turns the
   raw Baileys event into the friendly `m` object:
   `m.sender`, `m.chat`, `m.text`, `m.body`, `m.isGroup`, `m.key`,
   `m.mentionedJid`, `m.quoted`, `m.mtype`, `m.msg` (raw message content).

2. **Housekeeping plugins** — save-mode, antidelete cache, auto-read,
   antispam, AFK system, DND (tag handling), sticker/emoji command mapping,
   autoreact, antiword, games (ttt), shazam reply sessions, etc.

3. **Command router** — `await handleMessage(sock, m, customStore)` executes
   prefixed commands (e.g. `.chatbot ...`). Command files live in
   `src/Commands/` grouped by category; they are loaded by
   `src/Plugin/crysLoadCmd.js` into a registry
   (`src/Plugin/crysCmd.js` — `getCommand(name)`, `getAll()`, `addCommand()`).

4. **The chatbot brain hook**:
   ```js
   const { handleIncomingMessage } = require('./src/Commands/Core/❚.js');
   await handleIncomingMessage(sock, m, mek);
   ```

5. **Post-brain plugins** — crysnova auto-reply, anti-gm/group-status/bot/
   forward/link handlers, tag-reaction, etc.

---

## 3. The controller/brain — `src/Commands/Core/❚.js`

This is the heart. It is NOT obfuscated. Everything below is real.

### 3.1 Persistent state (JSON files in `database/`)

| File | Purpose |
|---|---|
| `chatbot_toggle.json` | `{ [chatJid]: true|false }` — is the chatbot ON in this chat |
| `chatbot_mode.json` | `{ [chatJid]: 'all'|'tag' }` — reply to everything, or only when tagged |
| `chatbot_memory.json` | `{ [chatJid]: [{ role, content }] }` — rolling conversation history |
| `chatbot_train.json` | `{ text }` — global training/instructions |
| `chatbot_train_chat.json` | `{ [chatJid]: text }` — per-chat training |
| `chatbot_personality.json` | `{ text }` — global personality/system prompt |
| `chatbot_personality_chat.json` | `{ [chatJid]: text }` — per-chat personality |
| `chatbot_global_priv.json` | `{ enabled: true|false }` — force chatbot ON for all DMs |

Helper pattern used for every one:
```js
function loadJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
```

State API (all exported at the bottom of `❚.js`):
- `isEnabled(chat)` / `setEnabled(chat, bool)`
- `getMode(chat)` / `setMode(chat, 'all'|'tag')`
- `getTraining(chat)` / `setTraining(text, chat?, global?)`
- `getTrainingGlobal()`
- `getPersonality(chat)` / `setPersonality(text, chat?)` / `getDefaultPersonality()`
- `isGlobalPrivateEnabled()` / `setGlobalPrivateEnabled(bool)`
- `getHistory(chat)` / `addToHistory(chat, role, content)` / `clearHistory(chat)`
  (history capped at `MAX_MEMORY = 10` messages, FIFO)

### 3.2 The entry point — `handleIncomingMessage(sock, m, mek)`

Logic (simplified but faithful):

```js
async function handleIncomingMessage(sock, m, mek) {
    const chat = m.chat;
    const isPrivate = !m.isGroup;

    // 1) is it enabled?
    let on = isEnabled(chat);
    if (isPrivate && isGlobalPrivateEnabled()) on = true;   // global DM force
    if (!on) return;

    // 2) mode 'all' vs 'tag'
    const mode = getMode(chat);
    let wasTagged = false;
    if (mode === 'tag') {
        // only react when the bot itself is mentioned
        const botJid = sock.user.id normalized;
        wasTagged = isBotMentioned(m, mek, sock);
        if (!wasTagged) return;
    }

    // 3) audio message → transcribe to text (transcribeAudio via gateway)
    //    image message → download + ask "analyze?" (describeImage)
    //    quoted reply → follow-up to previous context
    //    otherwise plain text

    // 4) skip bot commands (message starts with prefix)
    //    skip the bot's own outbound marker char

    // 5) build prompt & call AI
    await processUserText(sock, m, mek, chat, isPrivate, cleanedText, wasTagged, mentionedNames);
}
```

### 3.3 `processUserText` — the actual reply

```js
async function processUserText(sock, m, mek, chat, isPrivate, text, wasTagged, mentionedNames) {
    if (text.length < 2) return;
    await sock.sendPresenceUpdate('composing', chat);       // typing indicator
    const answer = await askAI(text, chat, wasTagged, mentionedNames);

    // OPTIONAL image generation: if the answer contains [IMAGE: prompt]
    // the bot generates an image and sends it alongside the text.
    const imgMatch = answer.match(/\[IMAGE:\s*([^\]]+)\]/i);
    if (imgMatch) { /* send text (minus marker) + generateImage(prompt) */ }
    else {
        await sock.sendMessage(chat, { text: answer }, { quoted: m });
    }
}
```

### 3.4 `askAI(promptText, chat, wasTagged, mentionedNames)` — the brain

1. **Build the prompt** (`buildPrompt`):
   ```
   <personality (global or per-chat, default CRYSNOVA AI persona)>
   + (if tagged) "You were specifically tagged/mentioned. The user is directly addressing you."
   + (if other users mentioned) "Other users mentioned: @..., @..."
   + (if training) "Additional instructions: <training>"
   + "History:" + past turns (User:/Assistant:) or "(No previous messages)"
   + "User: <text>" + "Assistant:"
   ```

2. **Detect prompt type** (`detectPromptType`) — keyword sniffing:
   - `codegen` — "write code", "create a function", "generate code", "make me a", …
   - `explain` — "explain this code", "what does this do", "describe", …
   - `debug` — "fix bug", "debug this", "error in my code", "fix my code", …
   - `code` — "json", "array", "sql", "regex", …
   - else `general`

3. **Model routing (exact order)** — every step falls through to the next on
   failure. The primary models are the PREXZY ones:
   ```js
   const PREXZY = 'https://prexzyapis.com';
   ```
   1. **grok-4** — `GET https://prexzyapis.com/ai/grok-4?prompt=<encoded>` → `data.response`
   2. **askgpt5** — `GET https://prexzyapis.com/ai/askgpt5?prompt=<encoded>` → `data.response`
   3. If codegen/explain/debug: specialized endpoints
      (`/ai/prompttocode?prompt=&language=`, `/ai/code-advanced`, `/ai/detectbugs?code=`)
   4. **gpt-5** — `GET .../ai/gpt-5?text=<encoded>` → `data.result`
   5. **deepseekchat** — `GET .../ai/deepseekchat?prompt=<encoded>` → `data.result`
   6. **gemini** — gateway `/ai/gemini?text=` → `data.result`
   7. **groq** — `POST https://api.groq.com/openai/v1/chat/completions`
      with model `llama-3.3-70b-versatile` (needs `GROQ_KEY`)
   8. **chatgpt** / **deepseekreasoner** / **bypass** / **AiChatPro** — more fallbacks
   9. If everything fails → returns the "AI service unavailable" message.

   Extraction helper: `tryGet(url)` = `axios.get(url, { timeout: 30000 })` and
   then reads `data.response` / `data.result` / `data.text` depending on step.

4. **Memory write** — on a successful answer:
   ```js
   addToHistory(chat, 'user', promptText);
   addToHistory(chat, 'assistant', answer);
   ```
   History is capped at 10 and persisted to `chatbot_memory.json`.

### 3.5 Supporting AI features in `❚.js`

- `generateImage(prompt)` — PREXZY `/ai/realistic?prompt=` and `/ai/3d?prompt=`
  first, then Pollinations as a final fallback. Returns `{ buffer, url }`.
- `describeImage(buffer, prompt)` — vision via gateway
  `POST <GATEWAY_URL>/vision?token=<token>` with FormData `file` + `prompt`;
  fallback to PREXZY `/ai/charart` (multipart). Returns text.
- `transcribeAudio(buffer)` — gateway `POST <GATEWAY_URL>/transcribe?token=`
  with FormData audio (ogg). Returns text.
- `isBotMentioned(m, mek, sock)` — checks `contextInfo.mentionedJid` on the
  message and quoted message, compares normalized JIDs against `sock.user.id`
  and the bot's LID.
- `extractMentionedNames(text, sock)` — maps `@<number>` tags to contact names.

---

## 4. The control command — `src/Commands/AI/chatbot.js`

`.chatbot` (alias `.cb`) is the user-facing toggle command. It is obfuscated,
but it calls exactly these exported functions of `❚.js`:

| User types | Brain call |
|---|---|
| `.chatbot on all` | `setGlobalPrivateEnabled(true)` |
| `.chatbot off all` | `setGlobalPrivateEnabled(false)` |
| `.chatbot on` | `setEnabled(chat, true)` + `setMode(chat, 'all')` |
| `.chatbot off` | `setEnabled(chat, false)` |
| `.chatbot mode all` | `setMode(chat, 'all')` |
| `.chatbot mode tag` | `setMode(chat, 'tag')` |
| `.chatbot train <text>` | `setTraining(chat, text, true)` (global) |
| `.chatbot train chat <text>` | `setTraining(chat, text, false)` (this chat) |
| `.chatbot personality <text>` | `setPersonality(text)` (global) |
| `.chatbot personality chat <text>` | `setPersonality(text, chat)` |
| `.chatbot clear` | `clearHistory(chat)` |
| `.chatbot img <style> <prompt>` | `generateImage(prompt)` + send image |
| `.chatbot` (no args) | builds a status card from all the getters |

So the command is a *thin shell* over the brain — all real logic lives in `❚.js`.

---

## 5. Key behaviors to replicate exactly

1. **Toggles are per-chat JSON**, loaded/saved synchronously on every use —
   changes apply instantly, no restart.
2. **Global private mode** forces the chatbot ON for every DM regardless of
   per-chat toggle.
3. **Mode "tag"** only replies when the bot JID (or LID) is in
   `contextInfo.mentionedJid` — includes quoted messages.
4. **Skip rules**:
   - messages shorter than 2 chars
   - messages starting with the command prefix (`.` by default)
   - the bot's own outbound text (it appends a zero-width marker `\u200E`
     so it can recognise its own replies)
   - status broadcasts
5. **Typing indicator** (`sendPresenceUpdate('composing')`) before replying.
6. **Memory** — 10-turn rolling history per chat, roles `user`/`assistant`,
   persisted to JSON. `clearHistory` wipes it.
7. **Personality/training** — per-chat overrides fall back to global, global
   falls back to the default persona.
8. **Model rotation** — try PREXZY grok-4 → askgpt5 → specialized code
   endpoints → gpt-5 → deepseekchat → gemini → groq → others. Each failure is
   logged and silently falls through.
9. **Image generation** — triggered by `[IMAGE: prompt]` inside the AI answer,
   or explicitly via `.chatbot img`.
10. **Voice** — incoming audio is transcribed (gateway) and fed as text;
    **images** are offered for analysis (vision gateway / charart).

---

## 6. The PLOGME extension (this repo)

Alongside the classic chatbot, this repo adds **plogme**
(`src/Commands/Core/plogme.js` + `src/Commands/AI/plogme.js`), an internal
processing AI that:

- Works exactly like the old chatbot (same toggle/mode/personality/training/
  memory pattern, own JSON files in `database/plogme_*.json`).
- Uses the same PREXZY primary models (`/ai/grok-4`, `/ai/askgpt5`, `/ai/ch`).
- Keeps **persistent facts** (`plogme_facts.json`) — `plogme remember <fact>`.
- For owner/sudo/dual only, understands control intents in natural chat:
  `plogme run <cmd>`, `plogme toggle <cmd> on|off`, `plogme toggled`,
  `plogme fix <code>`, `plogme test <code|file>`, `plogme add command <name>: <code>`,
  `plogme delete command <name>`, `plogme reload`, `plogme restart`,
  `plogme dev on|off`, `plogme status`, `plogme memory`.
- The `?.js` hook runs plogme *before* the old chatbot brain and
  short-circuits when plogme handles the message; it also blocks toggled-off
  commands before the command router.

---

## 7. Reproduction checklist for a new bot

1. Copy `?.js`'s `messages.upsert` skeleton (unwrapping + `smsg`).
2. Copy `❚.js` verbatim (state helpers, `handleIncomingMessage`,
   `processUserText`, `askAI`, `buildPrompt`, `generateImage`,
   `describeImage`, `transcribeAudio`).
3. Copy `src/Commands/AI/chatbot.js` behaviour (toggle command shell).
4. Add `database/` JSON files (auto-created by the helper functions).
5. Ensure `axios`, `form-data` are in `package.json` and env keys
   (`GROQ_KEY`, `GATEWAY_URL`, `GATEWAY_TOKEN`) are optional fallbacks only —
   the PREXZY endpoints are the primary path and need no key.
