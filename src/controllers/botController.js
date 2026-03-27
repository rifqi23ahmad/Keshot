const botService = require('../services/botService');

/**
 * Handles incoming Telegram webhook updates.
 * @param {import('fastify').FastifyInstance} server 
 * @param {object} body - The Telegram update payload
 */
async function handleUpdate(server, body) {
  // Extract Prisma client from Fastify instance
  const prisma = server.prisma;

  // 1. Core IDEMPOTENCY CHECK
  // The update_id serves as a unique identifier for an update from Telegram.
  // It handles the "Duplicate Webhook Request" risk where Telegram retries.
  const updateId = body.update_id;
  if (updateId) {
    try {
      // Create processes it, if it's a duplicate it throws a Prisma constraint violation
      // This is atomic and safe against race conditions!
      await prisma.processedUpdate.create({
        data: { update_id: updateId }
      });
    } catch (err) {
      if (err.code === 'P2002') {
        server.log.info(`Update ${updateId} already processed (idempotency skipped).`);
        return; // Silent return, we already handled it.
      }
      throw err; // Real DB error
    }
  }

  // 2. Strict Input Guards:
  // "Fail fast di input", "Handle semua kemungkinan: VALID TYPES: message.text"
  
  // We explicitly ignore edited_message, photo, sticker, and empty text
  if (!body.message) {
    server.log.debug('Update ignored: not a regular message.');
    return;
  }

  const message = body.message;

  if (!message.text) {
    server.log.debug('Update ignored: message has no text (photo, sticker, etc.).');
    return;
  }

  // 3. Dispatch to Service Layer
  try {
    await botService.processTextMessage(prisma, message);
  } catch (err) {
    server.log.error(err, 'Failed to process message in BotService');
    // Global Error Response as requested: "⚠️ Terjadi kesalahan, coba lagi"
    try {
      const telegramService = require('../services/telegramService');
      await telegramService.sendMessage(message.chat.id, '⚠️ Terjadi kesalahan, coba lagi');
    } catch(telErr) {
      server.log.error(telErr, 'Also failed to send generic error message.');
    }
  }
}

module.exports = {
  handleUpdate
};
