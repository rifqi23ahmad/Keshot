/**
 * Sends a message via Telegram Bot API using native fetch.
 * @param {import('fastify').FastifyInstance} server - For logging
 * @param {string|number} chatId
 * @param {string} text
 */
async function sendMessage(server, chatId, text, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    server.log.error('[TELEGRAM] TELEGRAM_BOT_TOKEN is not set');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      server.log.error({ msg: '[TELEGRAM] API error', status: response.status, body });
      return;
    }

    server.log.info({ msg: '[TELEGRAM] Message sent OK', chat_id: chatId });
  } catch (err) {
    server.log.error(err, '[TELEGRAM] fetch failed');
  }
}

async function answerCallbackQuery(server, callbackQueryId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (err) {
    server.log.error(err, 'answerCallbackQuery failed');
  }
}

async function editMessageReplyMarkup(server, chatId, messageId, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/editMessageReplyMarkup`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup || '' })
    });
  } catch(err) {
    server.log.error(err, 'editMessageReplyMarkup failed');
  }
}

module.exports = { sendMessage, answerCallbackQuery, editMessageReplyMarkup };
