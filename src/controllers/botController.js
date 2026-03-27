const telegramService = require('../services/telegramService');

/**
 * Handles incoming Telegram webhook updates.
 * No database — minimal, safe, fail-fast.
 * @param {import('fastify').FastifyInstance} server
 * @param {object} body - The Telegram update payload
 */
async function handleUpdate(server, body) {
  // Guard: must have a message with text
  if (!body || !body.message) {
    server.log.debug('[BOT] Update ignored: no message object');
    return;
  }

  const message = body.message;

  if (!message.text) {
    server.log.debug('[BOT] Update ignored: message has no text');
    return;
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  server.log.info({ msg: '[BOT] Processing message', chat_id: chatId, text });

  // Command routing
  if (text === '/start') {
    await telegramService.sendMessage(server, chatId, 'Bot Keshot aktif 🚀');
    return;
  }

  // Echo everything else back
  await telegramService.sendMessage(server, chatId, `Echo: ${text}`);
}

module.exports = { handleUpdate };
