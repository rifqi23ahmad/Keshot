'use strict';

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
    `Ketik *\\+nominal keterangan* atau *\\-nominal keterangan* untuk mencatat\\.`;

  const inlineKeyboard = {
    inline_keyboard: [
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
/**
 * Cek dan kirim reminder yang tertunggak.
 * Dipanggil saat startup DAN setiap cron tick.
 * Dengan cara ini, jika bot restart setelah jam reminder, reminder tetap terkirim.
 */
let isChecking = false;

async function checkAndSend(server) {
  if (isChecking) {
    server.log.info({ msg: '[Scheduler] Trigger diabaikan karena pengecekan sedang berjalan.' });
    return;
  }
  isChecking = true;

  try {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    const currentHour = nowWIB.getHours();
    const todayWIB = getTodayWIB();

    server.log.info({ msg: `[Scheduler] Checking — jam ${currentHour} WIB, tanggal ${todayWIB}` });

    const { data: users, error } = await supabase
      .from('users')
      .select('id, telegram_id, reminder_hour, reminder_last_sent')
      .eq('reminder_enabled', true)
      .lte('reminder_hour', currentHour); // catch-up: ambil semua yang jam-nya sudah lewat

    if (error) {
      server.log.error({ msg: '[Scheduler] DB error', error });
      return;
    }

    if (!users || users.length === 0) {
      server.log.info({ msg: '[Scheduler] Tidak ada user dengan reminder aktif' });
      return;
    }

    // Filter: hanya yang belum terkirim HARI INI (WIB)
    const pending = users.filter(u => {
      if (!u.reminder_last_sent) return true; // belum pernah terkirim
      const lastSentWIB = new Date(
        new Date(u.reminder_last_sent).toLocaleString('en-US', { timeZone: TIMEZONE })
      );
      const lastSentDate = [
        lastSentWIB.getFullYear(),
        String(lastSentWIB.getMonth() + 1).padStart(2, '0'),
        String(lastSentWIB.getDate()).padStart(2, '0')
      ].join('-');
      return lastSentDate < todayWIB; // hari sebelumnya → belum dikirim hari ini
    });

    if (pending.length === 0) {
      server.log.info({ msg: '[Scheduler] Semua user sudah menerima reminder hari ini' });
      return;
    }

    server.log.info({ msg: `[Scheduler] Mengirim ${pending.length} reminder...` });

    await Promise.allSettled(
      pending.map(async (u) => {
        const success = await sendReminder(u.telegram_id, server);
        if (success) {
          await supabase
            .from('users')
            .update({ reminder_last_sent: new Date().toISOString() })
            .eq('id', u.id);
        }
      })
    );
  } catch (err) {
    server.log.error({ msg: '[Scheduler] Unexpected error', err: err.message });
  } finally {
    isChecking = false;
  }
}

function start(server) {
  // Jalankan sekali saat startup untuk catch-up reminder yang terlewat
  // Pengecekan rutin selanjutnya akan ditrigger via HTTP Endpoint oleh External Cron
  setImmediate(() => checkAndSend(server));

  server.log.info('[Scheduler] Initial startup reminder check executed. Waiting for external cron triggers.');
}

module.exports = { start, checkAndSend };
