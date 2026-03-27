const telegramService = require('./telegramService');
const { parseTransaction } = require('../utils/parser');
const supabase = require('../lib/supabase');

const MAIN_MENU = [
  [ { text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '🗑 Hapus', callback_data: 'cmd_delete' } ],
  [ { text: '📅 Hari Ini', callback_data: 'cmd_today' }, { text: '📜 Histori', callback_data: 'cmd_history' } ]
];

async function processTextMessage(server, message) {
  const telegramId = message.from.id.toString();
  const chatId = message.chat.id;
  const text = message.text.trim();
  const name = message.from.first_name || 'User';

  // Find or Create User instance
  const { data: user, error: upsertError } = await supabase
    .from('users')
    .upsert(
      { telegram_id: telegramId, name: name },
      { onConflict: 'telegram_id' }
    )
    .select('id')
    .single();

  if (upsertError) {
    server.log.error(upsertError, `Failed to upsert user for telegram_id: ${telegramId}`);
    return;
  }

  // Commands Routing
  if (text === '/start') {
    return handleStart(server, chatId, name);
  } else if (text === '/summary') {
    return handleSummary(server, user.id, chatId);
  } else if (text === '/history') {
    return handleHistory(server, user.id, chatId);
  } else if (text === '/today') {
    return handleToday(server, user.id, chatId);
  } else if (text.startsWith('/delete')) {
    return handleDelete(server, user.id, chatId, text);
  }

  // If not a command, try to parse as transaction
  return handleTransaction(server, user.id, chatId, text);
}

// ---------------------------------------------------------
// Command Handlers
// ---------------------------------------------------------

async function handleStart(server, chatId, name) {
  const text = `Halo, ${name}! 👋\nSaya adalah <b>Keshot</b>, bot pencatat keuangan pribadi Anda.\n\n` +
               `<b>Cara mencatat transaksi:</b>\n` +
               `➕ Pendapatan: <code>+50000 Gaji</code>\n` +
               `➖ Pengeluaran: <code>-20000 Makan siang</code>\n\n` +
               `Anda juga bisa menggunakan menu di bawah ini:`;
  await telegramService.sendMessage(server, chatId, text, { inline_keyboard: MAIN_MENU });
}

async function handleSummary(server, userId, chatId) { 
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId);

  if (error) {
    server.log.error(error, 'handleSummary DB error');
    return telegramService.sendMessage(server, chatId, '❌ Gagal memuat ringkasan.');
  }

  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of data) {
    if (t.type === 'income') totalIncome += t.amount;
    if (t.type === 'expense') totalExpense += t.amount;
  }

  const balance = totalIncome - totalExpense;

  const text = `📊 <b>Ringkasan Keuangan</b>\n\n` +
               `Total Pemasukan: Rp${totalIncome.toLocaleString('id-ID')}\n` +
               `Total Pengeluaran: Rp${totalExpense.toLocaleString('id-ID')}\n\n` +
               `<b>Saldo: Rp${balance.toLocaleString('id-ID')}</b>`;
  
  await telegramService.sendMessage(server, chatId, text, { inline_keyboard: MAIN_MENU });
}

async function handleHistory(server, userId, chatId, page = 1, messageIdToEdit = null) {
  const limit = 10;
  const offset = (page - 1) * limit;

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit); // request 11 items to check if there is a next page

  if (error) {
    server.log.error(error, 'handleHistory DB error');
    if (messageIdToEdit) return telegramService.editMessageText(server, chatId, messageIdToEdit, '❌ Gagal memuat histori.');
    return telegramService.sendMessage(server, chatId, '❌ Gagal memuat histori.');
  }

  if (!transactions || transactions.length === 0) {
    const msg = page > 1 ? 'Tidak ada data lagi di halaman ini.' : 'Belum ada data transaksi.';
    if (messageIdToEdit) return telegramService.editMessageText(server, chatId, messageIdToEdit, msg);
    return telegramService.sendMessage(server, chatId, msg);
  }

  const hasNextPage = transactions.length > limit;
  const displayTransactions = transactions.slice(0, limit);

  let text = `📜 <b>Histori Transaksi (Hal ${page})</b>\n\n`;
  displayTransactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '🟢' : '🔴';
    const num = offset + index + 1;
    text += `<b>${num}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `<i>${t.note}</i> (${t.category})` : `<i>${t.category}</i>`;
    text += `     └ 📝 ${label}\n\n`;
  });

  const inlineKeyboard = [];
  const navigationRow = [];
  
  if (page > 1) {
    navigationRow.push({ text: '⬅️ Sebelumnya', callback_data: `hist_${page - 1}` });
  }
  if (hasNextPage) {
    navigationRow.push({ text: 'Berikutnya ➡️', callback_data: `hist_${page + 1}` });
  }

  if (navigationRow.length > 0) {
    inlineKeyboard.push(navigationRow);
  }
  inlineKeyboard.push(...MAIN_MENU);

  const replyMarkup = { inline_keyboard: inlineKeyboard };

  if (messageIdToEdit) {
    await telegramService.editMessageText(server, chatId, messageIdToEdit, text, replyMarkup);
  } else {
    await telegramService.sendMessage(server, chatId, text, replyMarkup);
  }
}

async function handleToday(server, userId, chatId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    server.log.error(error, 'handleToday DB error');
    return telegramService.sendMessage(server, chatId, '❌ Gagal memuat transaksi hari ini.');
  }

  if (!transactions || transactions.length === 0) {
    return telegramService.sendMessage(server, chatId, 'Belum ada transaksi hari ini.');
  }

  let text = `📅 <b>Transaksi Hari Ini</b>\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '🟢' : '🔴';
    text += `<b>${index + 1}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `<i>${t.note}</i> (${t.category})` : `<i>${t.category}</i>`;
    text += `     └ 📝 ${label}\n\n`;
  });

  await telegramService.sendMessage(server, chatId, text, { inline_keyboard: MAIN_MENU });
}

async function handleDelete(server, userId, chatId, text) {
  // Always show interactive keyboard for the last 10 transactions
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !transactions || transactions.length === 0) {
    return telegramService.sendMessage(server, chatId, 'Belum ada data transaksi yang bisa dihapus.');
  }

  const inlineKeyboard = transactions.map(t => {
    const symbol = t.type === 'income' ? '➕' : '➖';
    const noteText = t.note ? t.note : t.category;
    const label = `${symbol} Rp${t.amount.toLocaleString('id-ID')} | ${noteText}`;
    return [{ text: label, callback_data: `del_${t.id}` }];
  });
  inlineKeyboard.push(...MAIN_MENU);

  await telegramService.sendMessage(server, chatId, 'Pilih transaksi yang ingin dihapus:', {
    inline_keyboard: inlineKeyboard
  });
}

async function processCallbackQuery(server, callbackQuery) {
  const data = callbackQuery.data;
  const telegramId = callbackQuery.from.id.toString();
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (data && data.startsWith('del_')) {
    const transactionId = data.substring(4);
    
    // Auth validation
    const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
    if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');

    const { data: delData, error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .select();

    if (error || !delData || delData.length === 0) {
      await telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Transaksi tidak ditemukan / sudah dihapus.');
      await telegramService.editMessageText(server, chatId, messageId, '❌ <i>Transaksi tidak ditemukan atau sudah dihapus.</i>');
    } else {
      await telegramService.answerCallbackQuery(server, callbackQuery.id, '✅ Transaksi berhasil dihapus.');
      await telegramService.editMessageText(server, chatId, messageId, '✅ <i>Transaksi berhasil dihapus.</i>');
    }
  } else if (data && data.startsWith('hist_')) {
    const page = parseInt(data.replace('hist_', ''), 10);
    if (!isNaN(page) && page > 0) {
      // Auth validation
      const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
      if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');
      
      await handleHistory(server, user.id, chatId, page, messageId);
      await telegramService.answerCallbackQuery(server, callbackQuery.id, `Halaman ${page}`);
    }
  } else if (data && data.startsWith('cmd_')) {
    // Auth validation
    const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
    if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');
    
    await telegramService.answerCallbackQuery(server, callbackQuery.id);
    
    // Switch command dynamically and edit current message if possible, or send new
    if (data === 'cmd_summary') {
      await handleSummary(server, user.id, chatId);
    } else if (data === 'cmd_today') {
      await handleToday(server, user.id, chatId);
    } else if (data === 'cmd_history') {
      await handleHistory(server, user.id, chatId, 1, messageId); // Replace menu with history!
    } else if (data === 'cmd_delete') {
      // Just replacing the current menu message to save space
      await telegramService.editMessageText(server, chatId, messageId, '<i>Daftar transaksi tertutup.</i>');
      await handleDelete(server, user.id, chatId, '/delete');
    }
  }
}


async function handleTransaction(server, userId, chatId, text) {
  const parsed = parseTransaction(text);

  if (!parsed) {
    const errorMsg = `❌ Format gagal dipahami.\n\nContoh:\n➕ Pemasukan: <code>+50000 dari teman</code>\n➖ Pengeluaran: <code>-20000 kopi</code>`;
    return telegramService.sendMessage(server, chatId, errorMsg);
  }

  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note
    });

  if (error) {
    server.log.error(error, 'handleTransaction DB error');
    return telegramService.sendMessage(server, chatId, '❌ Gagal mencatat transaksi.');
  }

  const responseText = `✅ ${parsed.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} tercatat\n\n` +
                       `* Rp${parsed.amount.toLocaleString('id-ID')} (${parsed.category})`;

  await telegramService.sendMessage(server, chatId, responseText, { inline_keyboard: MAIN_MENU });
}

module.exports = {
  processTextMessage,
  processCallbackQuery
};
