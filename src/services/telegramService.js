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

async function answerCallbackQuery(server, callbackQueryId, text, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  if (options.show_alert) payload.show_alert = true;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
async function editMessageText(server, chatId, messageId, text, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch(err) {
    server.log.error(err, 'editMessageText failed');
  }
}

async function getFile(server, fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`getFile HTTP error ${response.status}`);
    const data = await response.json();
    if (data.ok) return data.result;
    return null;
  } catch (err) {
    server.log.error(err, 'getFile failed');
    return null;
  }
}

async function downloadFileBuffer(server, filePath) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`downloadFile HTTP error ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    server.log.error(err, 'downloadFileBuffer failed');
    return null;
  }
}

async function deleteMessage(server, chatId, messageId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/deleteMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    if (!response.ok) {
      const body = await response.text();
      server.log.error({ msg: '[TELEGRAM] deleteMessage API error', status: response.status, body });
    }
  } catch(err) {
    server.log.error(err, 'deleteMessage failed');
  }
}

async function setBotCommands(server) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/setMyCommands`;
  
  // Perintah yang hanya muncul di Private Chat (DM)
  const payload = {
    commands: [
      { command: 'start', description: 'Mulai' },
      { command: 'today', description: 'Transaksi Hari Ini' }
    ],
    scope: { type: 'all_private_chats' }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (data.ok) {
      server.log.info('[TELEGRAM] Bot commands restricted to Private Chats only');
    } else {
      server.log.error({ msg: '[TELEGRAM] setMyCommands failed', data });
    }
  } catch (err) {
    server.log.error(err, 'setBotCommands failed');
  }
}

module.exports = { 
  sendMessage, 
  answerCallbackQuery, 
  editMessageReplyMarkup, 
  editMessageText,
  getFile,
  downloadFileBuffer,
  deleteMessage,
  setBotCommands
};
