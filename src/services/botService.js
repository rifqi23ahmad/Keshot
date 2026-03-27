const telegramService = require('./telegramService');
const { parseTransaction } = require('../utils/parser');
const supabase = require('../lib/supabase');

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
               `<b>Perintah:</b>\n` +
               `/summary - Lihat ringkasan saldo\n` +
               `/history - 10 transaksi terakhir\n` +
               `/today - Transaksi hari ini\n` +
               `/delete &lt;id&gt; - Hapus transaksi`;
  await telegramService.sendMessage(server, chatId, text);
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
  
  await telegramService.sendMessage(server, chatId, text);
}

async function handleHistory(server, userId, chatId) {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    server.log.error(error, 'handleHistory DB error');
    return telegramService.sendMessage(server, chatId, '❌ Gagal memuat histori.');
  }

  if (!transactions || transactions.length === 0) {
    return telegramService.sendMessage(server, chatId, 'Belum ada data transaksi.');
  }

  let text = `📜 <b>10 Transaksi Terakhir</b>\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '➕' : '➖';
    text += `<b>${index + 1}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')} (${t.category})\n`;
    if (t.note) text += `   📝 <i>${t.note}</i>\n\n`;
    else text += `\n`;
  });

  await telegramService.sendMessage(server, chatId, text);
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
    const symbol = t.type === 'income' ? '➕' : '➖';
    text += `<b>${index + 1}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')} (${t.category})\n`;
    if (t.note) text += `   📝 <i>${t.note}</i>\n\n`;
    else text += `\n`;
  });

  await telegramService.sendMessage(server, chatId, text);
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
    // callback_data strict length limit is 64 bytes. UUID is 36 chars, so "del_" + 36 = 40.
    return [{ text: label, callback_data: `del_${t.id}` }];
  });

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

  await telegramService.sendMessage(server, chatId, responseText);
}

module.exports = {
  processTextMessage,
  processCallbackQuery
};
