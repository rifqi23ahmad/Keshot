'use strict';

const cron = require('node-cron');
const supabase = require('../lib/supabase');

// Target timezone: WIB (UTC+7)
const TIMEZONE = 'Asia/Jakarta';

/**
 * Ambil tanggal hari ini dalam WIB sebagai string YYYY-MM-DD.
 * Digunakan untuk membandingkan apakah reminder sudah terkirim hari ini.
 */
function getTodayWIB() {
  const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
  const y = nowWIB.getFullYear();
  const m = String(nowWIB.getMonth() + 1).padStart(2, '0');
  const d = String(nowWIB.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // e.g. "2026-03-29"
}

/**
 * Kirim reminder ke satu user via Telegram Bot API.
 * Mengembalikan true jika berhasil, false jika gagal.
 * @param {string} telegramId
 * @param {object} server
 */
async function sendReminder(telegramId, server) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const text =
    `🔔 *Reminder Keshot*\n\n` +
    `Halo\\! Sudah catat transaksi hari ini belum? 💸\n\n` +
    `Jangan sampai ada yang kelewat ya\\. Yuk catat sekarang biar keuangan tetap terpantau\\! 💪\n\n` +
    `Ketik *\\+nominal keterangan* atau *\\-nominal keterangan* untuk mencatat\\, atau buka Dashboard\\.`;

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
        chat_id: telegramId,
        text,
        parse_mode: 'MarkdownV2',
        reply_markup: inlineKeyboard,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      server.log.warn({ msg: '[Scheduler] Failed to send reminder', telegramId, error: data.description });
      return false;
    }

    server.log.info({ msg: '[Scheduler] Reminder sent', telegramId });
    return true;
  } catch (err) {
    server.log.error({ msg: '[Scheduler] Error sending reminder', telegramId, err: err.message });
    return false;
  }
}

/**
 * Mulai scheduler.
 * 
 * Berjalan setiap awal jam WIB (00:00, 01:00, ... 23:00).
 * 
 * Logika pengiriman:
 *  1. Cari user dengan reminder_enabled = TRUE
 *  2. reminder_hour <= jam WIB sekarang  ← catch-up jika server sempat down
 *  3. reminder_last_sent IS NULL atau tanggal reminder_last_sent < hari ini WIB
 *     ← ini juga yang mereset otomatis setiap ganti hari tanpa cron tambahan
 * 
 * Setelah berhasil kirim → update reminder_last_sent = NOW()
 * 
 * @param {object} server - Fastify instance
 */
function start(server) {
  cron.schedule(
    '0 * * * *',
    async () => {
      const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
      const currentHour = nowWIB.getHours();
      const todayWIB = getTodayWIB(); // e.g. "2026-03-29"

      server.log.info({ msg: `[Scheduler] Tick — jam ${currentHour}:00 WIB, tanggal ${todayWIB}` });

      try {
        // Ambil semua calon penerima reminder:
        //  - reminder aktif
        //  - jam reminder <= jam sekarang (catch-up jika terlewat)
        //  - belum pernah terkirim HARI INI (reminder_last_sent < today atau null)
        const { data: users, error } = await supabase
          .from('users')
          .select('id, telegram_id, reminder_hour, reminder_last_sent')
          .eq('reminder_enabled', true)
          .lte('reminder_hour', currentHour);

        if (error) {
          server.log.error({ msg: '[Scheduler] DB error saat fetch users', error });
          return;
        }

        if (!users || users.length === 0) {
          server.log.info({ msg: '[Scheduler] Tidak ada user dengan reminder aktif jam ini' });
          return;
        }

        // Filter client-side: hanya yang belum terkirim hari ini WIB
        // (Supabase tidak bisa native compare date-only dari timestamptz dengan mudah)
        const pending = users.filter(u => {
          if (!u.reminder_last_sent) return true; // belum pernah terkirim sama sekali
          // Ambil tanggal WIB dari timestamp reminder_last_sent
          const lastSentWIB = new Date(
            new Date(u.reminder_last_sent).toLocaleString('en-US', { timeZone: TIMEZONE })
          );
          const lastSentDate = `${lastSentWIB.getFullYear()}-${String(lastSentWIB.getMonth() + 1).padStart(2, '0')}-${String(lastSentWIB.getDate()).padStart(2, '0')}`;
          return lastSentDate < todayWIB; // terkirim di hari sebelumnya → perlu kirim lagi
        });

        if (pending.length === 0) {
          server.log.info({ msg: '[Scheduler] Semua user sudah menerima reminder hari ini' });
          return;
        }

        server.log.info({ msg: `[Scheduler] Mengirim ${pending.length} reminder...` });

        // Kirim paralel, lalu update reminder_last_sent jika sukses
        await Promise.allSettled(
          pending.map(async (u) => {
            const success = await sendReminder(u.telegram_id, server);
            if (success) {
              // Update sent_status: simpan timestamp pengiriman
              // Otomatis "reset" besok karena filter di atas membandingkan tanggal
              await supabase
                .from('users')
                .update({ reminder_last_sent: new Date().toISOString() })
                .eq('id', u.id);
            }
          })
        );

      } catch (err) {
        server.log.error({ msg: '[Scheduler] Unexpected error', err: err.message });
      }
    },
    { timezone: TIMEZONE }
  );

  server.log.info('[Scheduler] Daily reminder scheduler started (setiap awal jam WIB)');
}

module.exports = { start };
