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

  // 2. Handle Callback Queries (Inline Buttons)
  if (body.callback_query) {
    if (body.callback_query.message && body.callback_query.message.chat.type !== 'private') {
      return; // Ignore group callbacks
    }
    
    try {
      if (typeof botService.processCallbackQuery === 'function') {
        await botService.processCallbackQuery(server, body.callback_query);
      }
    } catch (err) {
      server.log.error(err, 'Failed to process callback query');
    }
    return;
  }

  // 3. Strict Input Guards for regular messages
  if (!body.message || (!body.message.text && !body.message.web_app_data && !body.message.new_chat_members && !body.message.left_chat_member)) {
    server.log.debug('Update ignored: not a regular message or no text.');
    return;
  }

  // Ignore group messages for privacy, EXCEPT for welcoming new members back to the bot
  if (body.message.chat.type !== 'private') {
    if (body.message.new_chat_members) {
      try {
        await botService.handleNewGroupMember(server, body.message);
      } catch (err) {
        server.log.error(err, 'Failed to handle welcome message in group');
      }
    } else if (body.message.left_chat_member) {
      try {
        await botService.handleLeftGroupMember(server, body.message);
      } catch (err) {
        server.log.error(err, 'Failed to handle left member in group');
      }
    } else {
      server.log.debug('Ignored message from non-private chat.');
    }
    return;
  }

  const message = body.message;

  // 4. Dispatch to Service Layer
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
