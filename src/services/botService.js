const telegramService = require('./telegramService');
const { parseTransaction } = require('../utils/parser');
const supabase = require('../lib/supabase');

let miniappUrl = process.env.WEBHOOK_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'example.com';
if (!miniappUrl.startsWith('http')) {
  miniappUrl = `https://${miniappUrl}`;
}
if (miniappUrl.endsWith('/webhook')) miniappUrl = miniappUrl.slice(0, -8);
if (miniappUrl.endsWith('/')) miniappUrl = miniappUrl.slice(0, -1);
miniappUrl = `${miniappUrl}/app/index.html`;

const MAIN_MENU = [
  [{ text: '📱 Buka Dashboard', web_app: { url: miniappUrl } }],
  [{ text: '➕ Catat', callback_data: 'cmd_add' }],
  [{ text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '🗑 Hapus', callback_data: 'cmd_delete' }],
  [{ text: '📅 Hari Ini', callback_data: 'cmd_today' }, { text: '📜 Histori', callback_data: 'cmd_history' }]
];

// Map<string, Set<string>> (user_id -> Set of transaction UUIDs)
const multiDeleteState = new Map();

// Cache to prevent Telegram Rate Limit which causes loop-holes
const membershipCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function sendDenyMessage(server, chatId) {
  const groupLink = process.env.REQUIRED_GROUP_LINK || "https://t.me/KeshotFeedback"; 
  const text = `⚠️ <b>Akses Ditolak</b>\n\nUntuk menggunakan bot Keshot, Anda wajib bergabung ke grup komunitas dahulu.`;
  const keyboard = [
    [{ text: '👨‍👩‍👧‍👦 Masuk Grup', url: groupLink }],
    [{ text: '🔄 Saya Sudah Join', callback_data: 'cmd_check_join' }]
  ];
  await telegramService.sendMessage(server, chatId, text, { inline_keyboard: keyboard });
  return false;
}

async function checkMustJoin(server, userId, chatId, forceRefresh = false) {
  const REQUIRED_GROUP = process.env.REQUIRED_GROUP_ID;
  if (!REQUIRED_GROUP) return true; // Disable if not configured

  const now = Date.now();
  if (!forceRefresh && membershipCache.has(userId)) {
    const cached = membershipCache.get(userId);
    if (now < cached.expiresAt) {
      if (cached.isMember) return true;
      return sendDenyMessage(server, chatId);
    }
  }

  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${REQUIRED_GROUP}&user_id=${userId}`;
    const res = await fetch(url);
    const data = await res.json();

    let isMember = false;
    if (data.ok) {
      const status = data.result.status;
      if (['creator', 'administrator', 'member', 'restricted'].includes(status)) {
        isMember = true;
      }
    }

    membershipCache.set(userId, { isMember, expiresAt: now + CACHE_TTL });

    if (isMember) return true;
    return sendDenyMessage(server, chatId);

  } catch (e) {
    server.log.error(e, 'Failed to check chat member');
    // Fail closed! Jangan biarkan lolos jika network error (Celah keamanan)
    await telegramService.sendMessage(server, chatId, '⚠️ Gagal memverifikasi status Anda karena masalah jaringan. Coba klik "🔄 Saya Sudah Join" nanti.');
    return false;
  }
}

async function handleNewGroupMember(server, message) {
  const newMembers = message.new_chat_members;
  if (!newMembers) return;

  for (const member of newMembers) {
    if (member.is_bot) continue;
    
    const botUsername = process.env.BOT_USERNAME || 'KeshotBot'; // Fallback username
    const text = `Halo <a href="tg://user?id=${member.id}">${member.first_name}</a>! 👋\nTerima kasih sudah bergabung di grup Keshot Feedback.\n\nSilakan klik tombol di bawah ini untuk kembali ke Bot Keshot dan melanjutkan pencatatan keuangan Anda.`;
    const keyboard = [[{ text: '🤖 Kembali ke Bot Keshot', url: `https://t.me/${botUsername}` }]];

    await telegramService.sendMessage(server, message.chat.id, text, { inline_keyboard: keyboard });
  }
}

async function processTextMessage(server, message) {
  const telegramId = message.from.id.toString();
  const chatId = message.chat.id;
  const name = message.from.first_name || 'User';

  const isMember = await checkMustJoin(server, message.from.id, chatId);
  if (!isMember) return;

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

  // Handle Web App Data
  if (message.web_app_data) {
    try {
      const data = JSON.parse(message.web_app_data.data);
      if (data.action === 'cmd_add_income' || data.action === 'cmd_add_expense' || data.action === 'cmd_add') {
        const addText = `<b>Cara Menambah Transaksi</b>\n\n` +
          `Ketik nominal dan keterangan seperti contoh berikut:\n\n` +
          `🟢 <b>Pemasukan:</b>\n<code>+50000 Gaji</code>\n\n` +
          `🔴 <b>Pengeluaran:</b>\n<code>-20000 Makan siang</code>`;
        return telegramService.sendMessage(server, chatId, addText, {
          force_reply: true,
          input_field_placeholder: '+/- Nominal Keterangan'
        });
      } else if (data.action === 'cmd_history') {
        return handleHistory(server, user.id, chatId);
      }
    } catch (e) {
      server.log.error(e, 'Failed to parse web_app_data');
    }
    return;
  }

  // Ensure text exists before processing commands
  if (!message.text) return;
  const text = message.text.trim();

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
    multiDeleteState.delete(user.id);
    return handleDelete(server, user.id, chatId);
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

async function handleToday(server, userId, chatId, page = 1, messageIdToEdit = null) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const limit = 10;
  const offset = (page - 1) * limit;

  // Calculate totals for today
  const { data: allToday } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString());

  let totalIncome = 0;
  let totalExpense = 0;
  if (allToday) {
    for (const t of allToday) {
      if (t.type === 'income') totalIncome += t.amount;
      if (t.type === 'expense') totalExpense += t.amount;
    }
  }

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString())
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    server.log.error(error, 'handleToday DB error');
    if (messageIdToEdit) return telegramService.editMessageText(server, chatId, messageIdToEdit, '❌ Gagal memuat transaksi hari ini.');
    return telegramService.sendMessage(server, chatId, '❌ Gagal memuat transaksi hari ini.');
  }

  if (!transactions || transactions.length === 0) {
    const msg = page > 1 ? 'Tidak ada data lagi di halaman ini.' : 'Belum ada transaksi hari ini.';
    if (messageIdToEdit) return telegramService.editMessageText(server, chatId, messageIdToEdit, msg, { inline_keyboard: MAIN_MENU });
    return telegramService.sendMessage(server, chatId, msg, { inline_keyboard: MAIN_MENU });
  }

  const hasNextPage = transactions.length > limit;
  const displayTransactions = transactions.slice(0, limit);

  let text = `📅 <b>Transaksi Hari Ini (Hal ${page})</b>\n\n`;
  text += `🟢 <b>Pemasukan:</b> Rp${totalIncome.toLocaleString('id-ID')}\n`;
  text += `🔴 <b>Pengeluaran:</b> Rp${totalExpense.toLocaleString('id-ID')}\n`;
  text += `━━━━━━━━━━━━━━━━━\n\n`;
  displayTransactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '🟢' : '🔴';
    const num = offset + index + 1;
    text += `<b>${num}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `<i>${t.note}</i> (${t.category})` : `<i>${t.category}</i>`;
    text += `     └ 📝 ${label}\n\n`;
  });

  const inlineKeyboard = [];
  const navigationRow = [];

  if (page > 1) navigationRow.push({ text: '⬅️ Sebelumnya', callback_data: `today_${page - 1}` });
  if (hasNextPage) navigationRow.push({ text: 'Berikutnya ➡️', callback_data: `today_${page + 1}` });

  if (navigationRow.length > 0) inlineKeyboard.push(navigationRow);
  inlineKeyboard.push(...MAIN_MENU);

  const replyMarkup = { inline_keyboard: inlineKeyboard };

  if (messageIdToEdit) await telegramService.editMessageText(server, chatId, messageIdToEdit, text, replyMarkup);
  else await telegramService.sendMessage(server, chatId, text, replyMarkup);
}

async function handleDelete(server, userId, chatId, messageIdToEdit = null, page = 1) {
  const limit = 10;
  const offset = (page - 1) * limit;

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error || !transactions || transactions.length === 0) {
    const msg = page > 1 ? 'Tidak ada transaksi lagi di halaman ini.' : 'Belum ada data transaksi yang bisa dihapus.';
    if (messageIdToEdit) return telegramService.editMessageText(server, chatId, messageIdToEdit, msg, { inline_keyboard: MAIN_MENU });
    return telegramService.sendMessage(server, chatId, msg, { inline_keyboard: MAIN_MENU });
  }

  const hasNextPage = transactions.length > limit;
  const displayTransactions = transactions.slice(0, limit);

  if (!multiDeleteState.has(userId)) {
    multiDeleteState.set(userId, new Set());
  }
  const selected = multiDeleteState.get(userId);

  let text = `<b>Pilih transaksi yang ingin dihapus (Hal ${page}):</b>\n<i>(Klik angka di tombol bawah untuk menandai)</i>\n\n`;
  const row1 = [];
  const row2 = [];

  displayTransactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '🟢' : '🔴';
    const num = offset + index + 1;
    text += `<b>${num}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `<i>${t.note}</i> (${t.category})` : `<i>${t.category}</i>`;
    text += `     └ 📝 ${label}\n\n`;

    const isChecked = selected.has(t.id);
    const checkBox = isChecked ? '✅' : '⬜️';
    // Use offset index in the grid button to match the text
    const btn = { text: `${checkBox} ${num}`, callback_data: `addel_${t.id}_pg${page}` };

    if (index < 5) row1.push(btn);
    else row2.push(btn);
  });

  const inlineKeyboard = [];
  if (row1.length > 0) inlineKeyboard.push(row1);
  if (row2.length > 0) inlineKeyboard.push(row2);

  const navigationRow = [];
  if (page > 1) navigationRow.push({ text: '⬅️ Sebelumnnya', callback_data: `delpg_${page - 1}` });
  if (hasNextPage) navigationRow.push({ text: 'Berikutnya ➡️', callback_data: `delpg_${page + 1}` });
  if (navigationRow.length > 0) inlineKeyboard.push(navigationRow);

  const actionRow = [];
  if (selected.size > 0) actionRow.push({ text: `🗑 Hapus (${selected.size})`, callback_data: 'mdel_confirm' });
  actionRow.push({ text: '❌ Batal', callback_data: 'mdel_cancel' });
  inlineKeyboard.push(actionRow);

  if (messageIdToEdit) {
    await telegramService.editMessageText(server, chatId, messageIdToEdit, text, { inline_keyboard: inlineKeyboard });
  } else {
    await telegramService.sendMessage(server, chatId, text, { inline_keyboard: inlineKeyboard });
  }
}

async function processCallbackQuery(server, callbackQuery) {
  const data = callbackQuery.data;
  const telegramId = callbackQuery.from.id.toString();
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  const isCheckJoin = (data === 'cmd_check_join');
  const isMember = await checkMustJoin(server, callbackQuery.from.id, chatId, isCheckJoin);
  if (!isMember) {
    if (data === 'cmd_check_join') {
      return telegramService.answerCallbackQuery(server, callbackQuery.id, 'Anda belum bergabung dengan grup, silakan join terlebih dahulu.', { show_alert: true });
    }
    return telegramService.answerCallbackQuery(server, callbackQuery.id, 'Anda harus join grup terlebih dahulu!', { show_alert: true });
  }

  // Jika sudah join dan mengklik tombol 'Cek Status Join'
  if (data === 'cmd_check_join') {
    await telegramService.answerCallbackQuery(server, callbackQuery.id, '✅ Berhasil memverifikasi! Selamat datang kembali.');
    await telegramService.sendMessage(server, chatId, '✅ Verifikasi berhasil! Bot Keshot kini bisa Anda gunakan.');
    return handleStart(server, chatId, callbackQuery.from.first_name || 'User');
  }

  if (data && data.startsWith('addel_')) {
    const parts = data.split('_');
    const transactionId = parts[1];
    const pageStr = parts[2] ? parts[2].replace('pg', '') : '1';
    const page = parseInt(pageStr, 10) || 1;

    const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
    if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');

    if (!multiDeleteState.has(user.id)) multiDeleteState.set(user.id, new Set());
    const selected = multiDeleteState.get(user.id);

    if (selected.has(transactionId)) selected.delete(transactionId);
    else selected.add(transactionId);

    // Silent ack to fast-update UI
    await telegramService.answerCallbackQuery(server, callbackQuery.id, '');
    await handleDelete(server, user.id, chatId, messageId, page);

  } else if (data === 'mdel_confirm') {
    const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
    if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');

    const selected = multiDeleteState.get(user.id);
    if (!selected || selected.size === 0) {
      return telegramService.answerCallbackQuery(server, callbackQuery.id, 'Pilih minimal 1 transaksi!');
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .in('id', Array.from(selected))
      .eq('user_id', user.id);

    if (error) {
      await telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Gagal menghapus transaksi.');
      await telegramService.editMessageText(server, chatId, messageId, '❌ <i>Gagal menghapus transaksi.</i>', { inline_keyboard: MAIN_MENU });
    } else {
      await telegramService.answerCallbackQuery(server, callbackQuery.id, `✅ ${selected.size} transaksi berhasil dihapus.`);
      await telegramService.editMessageText(server, chatId, messageId, `✅ <i>${selected.size} transaksi berhasil dihapus!</i>`, { inline_keyboard: MAIN_MENU });
    }

    multiDeleteState.delete(user.id);

  } else if (data === 'mdel_cancel') {
    const { data: user } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
    if (user) multiDeleteState.delete(user.id);

    await telegramService.answerCallbackQuery(server, callbackQuery.id, 'Dibatalkan');
    await telegramService.editMessageText(server, chatId, messageId, '<i>Aksi hapus dibatalkan.</i>', { inline_keyboard: MAIN_MENU });

  } else if (data && data.startsWith('delpg_')) {
    const page = parseInt(data.replace('delpg_', ''), 10);
    if (!isNaN(page) && page > 0) {
      const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
      if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');
      await handleDelete(server, user.id, chatId, messageId, page);
      await telegramService.answerCallbackQuery(server, callbackQuery.id, `Halaman ${page}`);
    }

  } else if (data && data.startsWith('hist_')) {
    const page = parseInt(data.replace('hist_', ''), 10);
    if (!isNaN(page) && page > 0) {
      const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
      if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');
      await handleHistory(server, user.id, chatId, page, messageId);
      await telegramService.answerCallbackQuery(server, callbackQuery.id, `Halaman ${page}`);
    }

  } else if (data && data.startsWith('today_')) {
    const page = parseInt(data.replace('today_', ''), 10);
    if (!isNaN(page) && page > 0) {
      const { data: user, error: userError } = await supabase.from('users').select('id').eq('telegram_id', telegramId).single();
      if (userError || !user) return telegramService.answerCallbackQuery(server, callbackQuery.id, '❌ Akses ditolak.');
      await handleToday(server, user.id, chatId, page, messageId);
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
      multiDeleteState.delete(user.id);
      await handleDelete(server, user.id, chatId, messageId);
    } else if (data === 'cmd_add') {
      const addText = `<b>Cara Menambah Transaksi</b>\n\n` +
        `Ketik nominal dan keterangan seperti contoh berikut:\n\n` +
        `🟢 <b>Pemasukan:</b>\n<code>+50000 Gaji</code>\n\n` +
        `🔴 <b>Pengeluaran:</b>\n<code>-20000 Makan siang</code>`;
      await telegramService.sendMessage(server, chatId, addText, {
        force_reply: true,
        input_field_placeholder: '+/- Nominal Keterangan'
      });
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
  processCallbackQuery,
  handleNewGroupMember
};
