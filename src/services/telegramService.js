/**
 * Sends a message via Telegram Bot API using native fetch.
 * @param {import('fastify').FastifyInstance} server - For logging
 * @param {string|number} chatId
 * @param {string} text
 */
async function sendMessage(server, chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    server.log.error('[TELEGRAM] TELEGRAM_BOT_TOKEN is not set');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
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

module.exports = { sendMessage };
