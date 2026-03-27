const botService = require('../services/botService');
const supabase = require('../lib/supabase');

/**
 * Handles incoming Telegram webhook updates.
 * @param {import('fastify').FastifyInstance} server 
 * @param {object} body - The Telegram update payload
 */
async function handleUpdate(server, body) {
  // 1. Core IDEMPOTENCY CHECK
  const updateId = body.update_id;
  if (updateId) {
    const { error } = await supabase
      .from('processed_updates')
      .insert({ update_id: updateId });
      
    if (error && error.code === '23505') { // Postgres Unique Violation
      server.log.info(`Update ${updateId} already processed (idempotency skipped).`);
      return; 
    } else if (error) {
      server.log.error(error, `DB Error on idempotency check for update ${updateId}`);
      throw error; 
    }
  }

  // 2. Strict Input Guards
  if (!body.message || !body.message.text) {
    server.log.debug('Update ignored: not a regular message or no text.');
    return;
  }

  const message = body.message;

  // 3. Dispatch to Service Layer
  try {
    await botService.processTextMessage(server, message);
  } catch (err) {
    server.log.error(err, 'Failed to process message in BotService');
    try {
      const telegramService = require('../services/telegramService');
      await telegramService.sendMessage(server, message.chat.id, '⚠️ Terjadi kesalahan, coba lagi');
    } catch(telErr) {
      server.log.error(telErr, 'Also failed to send generic error message.');
    }
  }
}

module.exports = {
  handleUpdate
};
