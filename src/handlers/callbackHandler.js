const telegramService = require('../services/telegramService');
const transactionService = require('../services/transactionService');
const userService = require('../services/userService');
const formatters = require('../utils/formatters');
const multiDeleteState = require('../state/multiDeleteState');
const ocrStateStore = require('../lib/ocrStateStore');

// Need access to textHandler functions for routing
const textHandler = require('./textHandler');

async function handleCallback(ctx, callbackQuery) {
  const data = callbackQuery.data;

  // 1. Auth check
  const isCheckJoin = (data === 'cmd_check_join');
  const isMember = await userService.checkMustJoin(ctx.server, ctx.telegramId, isCheckJoin);
  
  if (!isMember) {
    if (isCheckJoin) {
      return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, 'Anda belum bergabung dengan grup, silakan join terlebih dahulu.', { show_alert: true });
    }
    return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, 'Anda harus join grup terlebih dahulu!', { show_alert: true });
  }

  if (isCheckJoin) {
    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '✅ Berhasil memverifikasi! Selamat datang kembali.');
    await telegramService.sendMessage(ctx.server, ctx.chatId, '✅ Verifikasi berhasil! Bot Keshot kini bisa Anda gunakan.');
    return textHandler.handleStart(ctx, callbackQuery.from.first_name || 'User');
  }

  // 2. Requires User Instance Check
  // The context might already have user populated by the router. 
  // Wait, the router must have populated `ctx.user` and `ctx.userId` before handing over here!
  if (!ctx.userId) {
    return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '❌ Akses ditolak.');
  }

  // ==== MULTI DEL DOMAIN ====
  if (data && data.startsWith('addel_')) {
    const parts = data.split('_');
    const transactionId = parts[1];
    const pageStr = parts[2] ? parts[2].replace('pg', '') : '1';
    const page = parseInt(pageStr, 10) || 1;

    await multiDeleteState.toggleMultiDelete(ctx.userId, transactionId);

    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '');
    return textHandler.handleDelete(ctx, page);

  } else if (data === 'mdel_confirm') {
    const selected = await multiDeleteState.getMultiDelete(ctx.userId);
    if (!selected || selected.size === 0) {
      return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, 'Pilih minimal 1 transaksi!');
    }

    try {
      const { deletedCount } = await transactionService.deleteTransactions(ctx.userId, selected);
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, `✅ ${deletedCount} transaksi berhasil dihapus.`);
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, `✅ <i>${deletedCount} transaksi berhasil dihapus!</i>`, { inline_keyboard: formatters.getMainMenu() });
    } catch (e) {
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '❌ Gagal menghapus transaksi.');
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, '❌ <i>Gagal menghapus transaksi.</i>', { inline_keyboard: formatters.getMainMenu() });
    }
    await multiDeleteState.clearMultiDelete(ctx.userId);

  } else if (data === 'mdel_cancel') {
    await multiDeleteState.clearMultiDelete(ctx.userId);
    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, 'Dibatalkan');
    await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, '<i>Aksi hapus dibatalkan.</i>', { inline_keyboard: formatters.getMainMenu() });

  // ==== OCR DOMAIN ====
  } else if (data === 'ocr_cancel') {
    await ocrStateStore.clearOcrState(ctx.telegramId);
    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, 'Dibatalkan');
    await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, '<i>Scan struk dibatalkan.</i>', { inline_keyboard: formatters.getMainMenu() });

  } else if (data === 'ocr_confirm') {
    const state = await ocrStateStore.getOcrState(ctx.telegramId);
    if (!state) {
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '❌ Data kadaluarsa (lebih dari 5 menit). Silakan scan ulang.', { show_alert: true });
      return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, '<i>Struk kadaluarsa.</i>', { inline_keyboard: formatters.getMainMenu() });
    }

    let insertData = [];
    if (state.items && state.items.length > 0) {
      insertData = state.items.map(item => ({
        user_id: ctx.userId,
        type: state.type || 'expense',
        amount: item.price,
        category: 'scan',
        note: item.name
      }));
    } else {
      insertData = [{
        user_id: ctx.userId,
        type: state.type || 'expense',
        amount: state.total,
        category: 'scan',
        note: `[${state.merchant}] dokumen scan`
      }];
    }

    try {
      await transactionService.addTransaction(insertData);
      await ocrStateStore.clearOcrState(ctx.telegramId);
      const countSaved = insertData.length;
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, `✅ ${countSaved} item berhasil disimpan!`);
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, `✅ <b>${countSaved} Item Struk Terekam!</b>\nTotal: Rp${state.total.toLocaleString('id-ID')}`, { inline_keyboard: formatters.getMainMenu() });
    } catch (e) {
      return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '❌ Gagal menyimpan.');
    }

  } else if (data === 'ocr_edit') {
    const state = await ocrStateStore.getOcrState(ctx.telegramId);
    if (!state) {
       return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '❌ Data kadaluarsa.', { show_alert: true });
    }
    
    const merchantStr = state.merchant === 'generic' ? '' : ` ${state.merchant}`;
    const opSign = state.type === 'income' ? '+' : '-';
    // User edits as text based format e.g. -50000 Merchant dokumen scan
    const editText = `${opSign}${state.total}${merchantStr} dokumen scan`;
    
    await ocrStateStore.clearOcrState(ctx.telegramId);
    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id);
    await telegramService.sendMessage(ctx.server, ctx.chatId, `Silakan ubah teks di bawah ini dan kirimkan kembali:\n\n<code>${editText}</code>`);
    await telegramService.editMessageReplyMarkup(ctx.server, ctx.chatId, ctx.messageId, null);

  // ==== PAGINATION DOMAIN ====
  } else if (data && data.startsWith('delpg_')) {
    const page = parseInt(data.replace('delpg_', ''), 10);
    if (!isNaN(page) && page > 0) {
      await textHandler.handleDelete(ctx, page);
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, `Halaman ${page}`);
    }

  } else if (data && data.startsWith('hist_')) {
    const page = parseInt(data.replace('hist_', ''), 10);
    if (!isNaN(page) && page > 0) {
      await textHandler.handleHistory(ctx, page);
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, `Halaman ${page}`);
    }

  } else if (data && data.startsWith('today_')) {
    const page = parseInt(data.replace('today_', ''), 10);
    if (!isNaN(page) && page > 0) {
      await textHandler.handleToday(ctx, page);
      await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, `Halaman ${page}`);
    }

  // ==== REMINDER DOMAIN ====
  } else if (data && data.startsWith('remind_set_')) {
    const hour = parseInt(data.replace('remind_set_', ''), 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      return telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '❌ Jam tidak valid.');
    }

    await userService.setReminder(ctx.userId, hour);
    await telegramService.answerCallbackQuery(
      ctx.server, callbackQuery.id,
      `✅ Reminder diaktifkan jam ${String(hour).padStart(2, '0')}:00 WIB!`
    );
    await telegramService.deleteMessage(ctx.server, ctx.chatId, ctx.messageId);

  } else if (data === 'remind_off') {
    await userService.disableReminder(ctx.userId);
    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id, '🔕 Reminder dinonaktifkan.');
    await telegramService.deleteMessage(ctx.server, ctx.chatId, ctx.messageId);

  // ==== CMD / MENU DOMAIN ====
  } else if (data && data.startsWith('cmd_')) {
    await telegramService.answerCallbackQuery(ctx.server, callbackQuery.id);

    if (data === 'cmd_summary') {
      await textHandler.handleSummary(ctx);
    } else if (data === 'cmd_today') {
      await textHandler.handleToday(ctx, 1);
    } else if (data === 'cmd_history') {
      await textHandler.handleHistory(ctx, 1);
    } else if (data === 'cmd_delete') {
      await multiDeleteState.clearMultiDelete(ctx.userId);
      await textHandler.handleDelete(ctx, 1);
    } else if (data === 'cmd_reminder') {
      const { text, replyMarkup } = formatters.formatReminder(ctx.user.reminder_enabled, ctx.user.reminder_hour);
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageId, text, replyMarkup);
    } else if (data === 'cmd_back_menu') {
      await textHandler.handleStart(ctx, callbackQuery.from.first_name || 'User');
    } else if (data === 'cmd_add') {
      const addText = `<b>Cara Menambah Transaksi</b>\n\n` +
        `Ketik nominal dan keterangan seperti contoh berikut:\n\n` +
        `🟢 <b>Pemasukan:</b>\n<code>+50000 Gaji</code>\n\n` +
        `🔴 <b>Pengeluaran:</b>\n<code>-20000 Makan siang</code>`;
      await telegramService.sendMessage(ctx.server, ctx.chatId, addText, {
        force_reply: true,
        input_field_placeholder: '+/- Nominal Keterangan'
      });
    } else if (data === 'cmd_show_menu') {
      await telegramService.deleteMessage(ctx.server, ctx.chatId, ctx.messageId);
      await telegramService.sendMessage(ctx.server, ctx.chatId, '🎛 Keyboard bawah dimunculkan.', { replyMarkup: formatters.PERSISTENT_KEYBOARD });
    } else if (data === 'cmd_hide_menu') {
      await telegramService.deleteMessage(ctx.server, ctx.chatId, ctx.messageId);
      await telegramService.sendMessage(ctx.server, ctx.chatId, '🔕 Keyboard disembunyikan.\n\nKirim /menu untuk memunculkannya kembali sewaktu-waktu.', { replyMarkup: { remove_keyboard: true } });
    }
  }
}

module.exports = {
  handleCallback
};
