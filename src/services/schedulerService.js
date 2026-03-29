'use strict';

const cron = require('node-cron');
const supabase = require('../lib/supabase');

// Target timezone: WIB (UTC+7)
const TIMEZONE = 'Asia/Jakarta';

/**
 * Kirim reminder ke satu user via Telegram Bot API.
 * @param {string} telegramId
 * @param {object} server - Fastify instance (untuk log)
 */
async function sendReminder(telegramId, server) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = telegramId;

  const text =
    `🔔 *Reminder Keshot*\n\n` +
    `Halo\\! Sudah catat transaksi hari ini belum? 💸\n\n` +
    `Jangan sampai ada yang kelewat ya\\. Yuk catat sekarang biar keuangan tetap terpantau\\! 💪\n\n` +
    `Ketik *\\+nominal keterangan* atau *\\-nominal keterangan* untuk mencatat\\, atau buka Dashboard\\. `;

  const inlineKeyboard = {
    inline_keyboard: [
      [{ text: '📱 Buka Dashboard', callback_data: 'cmd_open_dashboard' }],
      [{ text: '🔕 Matikan Reminder', callback_data: 'remind_off' }],
    ],
  };

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        reply_markup: inlineKeyboard,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      server.log.warn({ msg: 'Failed to send reminder', telegramId, error: data.description });
    } else {
      server.log.info({ msg: 'Reminder sent', telegramId });
    }
  } catch (err) {
    server.log.error({ msg: 'Error sending reminder', telegramId, err: err.message });
  }
}

/**
 * Mulai scheduler.
 * Berjalan setiap menit, mengecek siapa yang perlu diingatkan pada jam WIB saat ini.
 * @param {object} server - Fastify instance
 */
function start(server) {
  // Cron setiap awal jam (menit 0) — efisien, hanya 24x sehari per user
  cron.schedule(
    '0 * * * *',
    async () => {
      // Dapatkan jam saat ini dalam WIB
      const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
      const currentHour = nowWIB.getHours();

      server.log.info({ msg: `[Scheduler] Checking reminders for hour: ${currentHour} WIB` });

      try {
        const { data: users, error } = await supabase
          .from('users')
          .select('telegram_id')
          .eq('reminder_enabled', true)
          .eq('reminder_hour', currentHour);

        if (error) {
          server.log.error({ msg: '[Scheduler] DB error', error });
          return;
        }

        if (!users || users.length === 0) {
          server.log.info({ msg: '[Scheduler] No reminders to send this hour' });
          return;
        }

        server.log.info({ msg: `[Scheduler] Sending ${users.length} reminder(s)` });

        // Kirim ke semua user secara paralel (dengan batas konkurensi implisit via Promise.allSettled)
        await Promise.allSettled(
          users.map((u) => sendReminder(u.telegram_id, server))
        );
      } catch (err) {
        server.log.error({ msg: '[Scheduler] Unexpected error', err: err.message });
      }
    },
    { timezone: TIMEZONE }
  );

  server.log.info('[Scheduler] Daily reminder scheduler started (runs every hour at :00)');
}

module.exports = { start };
