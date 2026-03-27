const MAX_RETRIES = 3;

/**
 * Sends a message via Telegram API with built-in retry logic (resilient pattern).
 * @param {string|number} chatId 
 * @param {string} text 
 */
async function sendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML' // Optional: making it look nice
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram API responded with ${response.status}: ${await response.text()}`);
      }

      return await response.json(); // Success
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to send message after ${MAX_RETRIES} attempts: ${err.message}`);
      }
      // Small exponential delay (e.g., 500ms, 1000ms)
      const delayMs = attempt * 500;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

module.exports = {
  sendMessage
};
