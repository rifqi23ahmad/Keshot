const telegramService = require('../services/telegramService');
const transactionService = require('../services/transactionService');
const multiDeleteState = require('../state/multiDeleteState');
const formatters = require('../utils/formatters');
const { parseTransaction } = require('../utils/parser');

async function handleText(ctx, message) {
  // Handle Web App Data (which comes with text messages sometimes in Telegram)
  if (message.web_app_data) {
    try {
      const data = JSON.parse(message.web_app_data.data);
      if (data.action === 'cmd_add_income' || data.action === 'cmd_add_expense' || data.action === 'cmd_add') {
        const addText = `<b>Cara Menambah Transaksi</b>\n\n` +
          `Ketik nominal dan keterangan seperti contoh berikut:\n\n` +
          `🟢 <b>Pemasukan:</b>\n<code>+50000 Gaji</code>\n\n` +
          `🔴 <b>Pengeluaran:</b>\n<code>-20000 Makan siang</code>`;
        return telegramService.sendMessage(ctx.server, ctx.chatId, addText, {
          force_reply: true,
          input_field_placeholder: '+/- Nominal Keterangan'
        });
      } else if (data.action === 'cmd_history') {
        return handleHistory(ctx, 1);
      }
    } catch (e) {
      ctx.server.log.error(e, 'Failed to parse web_app_data');
    }
    return;
  }

  if (!message.text) return;
  const text = message.text.trim();

  // Commands Routing
  if (text === '/start') {
    return handleStart(ctx, message.from.first_name || 'User');
  } else if (text === '/summary') {
    return handleSummary(ctx);
  } else if (text === '/history') {
    return handleHistory(ctx, 1);
  } else if (text === '/today' || text === 'Hari Ini') {
    return handleToday(ctx, 1);
  } else if (text.startsWith('/delete') || text === 'Hapus') {
    await multiDeleteState.clearMultiDelete(ctx.userId);
    return handleDelete(ctx, 1);
  } else if (text === 'Reminder') {
    return handleReminderMenu(ctx);
  }

  // If not a command, try to parse as transaction
  return handleTransaction(ctx, text);
}

// ---------------------------------------------------------
// Command Handlers
// ---------------------------------------------------------

async function handleReminderMenu(ctx) {
  const isEnabled = ctx.user ? ctx.user.reminder_enabled : false;
  const currentHour = ctx.user ? ctx.user.reminder_hour : null;
  const { text, replyMarkup } = formatters.formatReminder(isEnabled, currentHour);
  return telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);
}

async function handleStart(ctx, name) {
  // Send the persistent keyboard first with a silent/quick message
  await telegramService.sendMessage(ctx.server, ctx.chatId, 'Menyiapkan ruang kerja Keshot...', { replyMarkup: formatters.PERSISTENT_KEYBOARD });
  
  const { text, replyMarkup } = formatters.formatStartMessage(name);
  await telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);
}

async function handleSummary(ctx) {
  try {
    const { totalIncome, totalExpense, balance } = await transactionService.getSummary(ctx.userId);
    const { text, replyMarkup } = formatters.formatSummary(totalIncome, totalExpense, balance);
    await telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);
  } catch (error) {
    ctx.server.log.error(error, 'handleSummary DB error');
    await telegramService.sendMessage(ctx.server, ctx.chatId, '❌ Gagal memuat ringkasan.');
  }
}

async function handleHistory(ctx, page = 1) {
  try {
    const { transactions, hasNextPage, offset } = await transactionService.getHistory(ctx.userId, page);

    if (!transactions || transactions.length === 0) {
      const msg = page > 1 ? 'Tidak ada data lagi di halaman ini.' : 'Belum ada data transaksi.';
      if (ctx.messageIdToEdit) return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, msg);
      return telegramService.sendMessage(ctx.server, ctx.chatId, msg);
    }

    const { text, replyMarkup } = formatters.formatHistory(transactions, page, hasNextPage, offset);

    if (ctx.messageIdToEdit) {
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, text, replyMarkup);
    } else {
      await telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);
    }
  } catch (error) {
    ctx.server.log.error(error, 'handleHistory DB error');
    const msg = '❌ Gagal memuat histori.';
    if (ctx.messageIdToEdit) return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, msg);
    return telegramService.sendMessage(ctx.server, ctx.chatId, msg);
  }
}

async function handleToday(ctx, page = 1) {
  try {
    // We need overall totals for today (all pages)
    const { totalIncome, totalExpense } = await transactionService.getTodaySummary(ctx.userId);
    const { transactions, hasNextPage, offset } = await transactionService.getTodayHistory(ctx.userId, page);

    if (!transactions || transactions.length === 0) {
      const msg = page > 1 ? 'Tidak ada data lagi di halaman ini.' : 'Belum ada transaksi hari ini.';
      if (ctx.messageIdToEdit) return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, msg);
      return telegramService.sendMessage(ctx.server, ctx.chatId, msg);
    }

    const { text, replyMarkup } = formatters.formatToday(totalIncome, totalExpense, transactions, page, hasNextPage, offset);

    if (ctx.messageIdToEdit) {
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, text, replyMarkup);
    } else {
      await telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);
    }
  } catch (error) {
    ctx.server.log.error(error, 'handleToday DB error');
    const msg = '❌ Gagal memuat transaksi hari ini.';
    if (ctx.messageIdToEdit) return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, msg);
    return telegramService.sendMessage(ctx.server, ctx.chatId, msg);
  }
}

async function handleDelete(ctx, page = 1) {
  try {
    const { transactions, hasNextPage, offset } = await transactionService.getHistory(ctx.userId, page);

    if (!transactions || transactions.length === 0) {
      const msg = page > 1 ? 'Tidak ada transaksi lagi di halaman ini.' : 'Belum ada data transaksi yang bisa dihapus.';
      if (ctx.messageIdToEdit) return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, msg);
      return telegramService.sendMessage(ctx.server, ctx.chatId, msg);
    }

    const selectedIds = await multiDeleteState.getMultiDelete(ctx.userId);
    const { text, replyMarkup } = formatters.formatDeleteSelection(transactions, selectedIds, page, hasNextPage, offset);

    if (ctx.messageIdToEdit) {
      await telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, text, replyMarkup);
    } else {
      await telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);
    }
  } catch (error) {
    ctx.server.log.error(error, 'handleDelete DB error');
    const msg = '❌ Gagal memuat transaksi.';
    if (ctx.messageIdToEdit) return telegramService.editMessageText(ctx.server, ctx.chatId, ctx.messageIdToEdit, msg);
    return telegramService.sendMessage(ctx.server, ctx.chatId, msg);
  }
}

async function handleTransaction(ctx, text) {
  const parsed = parseTransaction(text);

  if (!parsed) {
    const errorMsg = `❌ Format gagal dipahami.\n\nContoh:\n➕ Pemasukan: <code>+50000 dari teman</code>\n➖ Pengeluaran: <code>-20000 kopi</code>`;
    return telegramService.sendMessage(ctx.server, ctx.chatId, errorMsg);
  }

  try {
    await transactionService.addTransaction({
      user_id: ctx.userId,
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note
    });

    const { text: responseText, replyMarkup } = formatters.formatTransactionAdded(parsed);
    await telegramService.sendMessage(ctx.server, ctx.chatId, responseText, replyMarkup);
  } catch (error) {
    ctx.server.log.error(error, 'handleTransaction DB error');
    return telegramService.sendMessage(ctx.server, ctx.chatId, '❌ Gagal mencatat transaksi.');
  }
}

module.exports = {
  handleText,
  handleStart,
  handleSummary,
  handleHistory,
  handleToday,
  handleDelete,
  handleTransaction
};
