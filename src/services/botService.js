const telegramService = require('./telegramService');
const { parseTransaction } = require('../utils/parser');

async function processTextMessage(prisma, message) {
  const telegramId = message.from.id.toString();
  const chatId = message.chat.id;
  const text = message.text.trim();
  const name = message.from.first_name || 'User';

  // Find or Create User instance (ensure they exist in our DB)
  const user = await prisma.user.upsert({
    where: { telegram_id: telegramId },
    update: {}, // Do nothing if exists
    create: { 
      telegram_id: telegramId,
      name: name
    }
  });

  // Commands Routing
  if (text === '/start') {
    return handleStart(chatId, name);
  } else if (text === '/summary') {
    return handleSummary(prisma, user.id, chatId);
  } else if (text === '/history') {
    return handleHistory(prisma, user.id, chatId);
  } else if (text === '/today') {
    return handleToday(prisma, user.id, chatId);
  } else if (text.startsWith('/delete')) {
    return handleDelete(prisma, user.id, chatId, text);
  }

  // If not a command, try to parse as transaction
  return handleTransaction(prisma, user.id, chatId, text);
}

// ---------------------------------------------------------
// Command Handlers
// ---------------------------------------------------------

async function handleStart(chatId, name) {
  const text = `Halo, ${name}! 👋\nSaya adalah <b>Keshot</b>, bot pencatat keuangan pribadi Anda.\n\n` +
               `<b>Cara mencatat transaksi:</b>\n` +
               `➕ Pendapatan: <code>+50000 Gaji</code>\n` +
               `➖ Pengeluaran: <code>-20000 Makan siang</code>\n\n` +
               `<b>Perintah:</b>\n` +
               `/summary - Lihat ringkasan saldo\n` +
               `/history - 10 transaksi terakhir\n` +
               `/today - Transaksi hari ini\n` +
               `/delete &lt;id&gt; - Hapus transaksi`;
  await telegramService.sendMessage(chatId, text);
}

async function handleSummary(prisma, userId, chatId) {
  // Use aggregation to accurately calculate SUM
  const aggregations = await prisma.transaction.groupBy({
    by: ['type'],
    where: { user_id: userId },
    _sum: { amount: true }
  });

  let totalIncome = 0;
  let totalExpense = 0;

  for (const group of aggregations) {
    if (group.type === 'income') totalIncome += group._sum.amount || 0;
    if (group.type === 'expense') totalExpense += group._sum.amount || 0;
  }

  const balance = totalIncome - totalExpense;

  const text = `📊 <b>Ringkasan Keuangan</b>\n\n` +
               `Total Pemasukan: Rp${totalIncome.toLocaleString('id-ID')}\n` +
               `Total Pengeluaran: Rp${totalExpense.toLocaleString('id-ID')}\n\n` +
               `<b>Saldo: Rp${balance.toLocaleString('id-ID')}</b>`;
  
  await telegramService.sendMessage(chatId, text);
}

async function handleHistory(prisma, userId, chatId) {
  const transactions = await prisma.transaction.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 10
  });

  if (transactions.length === 0) {
    return telegramService.sendMessage(chatId, 'Belum ada data transaksi.');
  }

  let text = `📜 <b>10 Transaksi Terakhir</b>\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '➕' : '➖';
    text += `${index + 1}. ${symbol} Rp${t.amount.toLocaleString('id-ID')} (${t.category})\n`;
    if (t.note) text += `   📝 ${t.note}\n`;
    text += `   🆔 <code>${t.id}</code>\n\n`; // Used for /delete
  });

  await telegramService.sendMessage(chatId, text);
}

async function handleToday(prisma, userId, chatId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Note: created_at is indexed, this is highly efficient!
  const transactions = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      created_at: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    orderBy: { created_at: 'desc' }
  });

  if (transactions.length === 0) {
    return telegramService.sendMessage(chatId, 'Belum ada transaksi hari ini.');
  }

  let text = `📅 <b>Transaksi Hari Ini</b>\n\n`;
  transactions.forEach(t => {
    const symbol = t.type === 'income' ? '➕' : '➖';
    text += `${symbol} Rp${t.amount.toLocaleString('id-ID')} (${t.category})\n`;
    if (t.note) text += `   📝 ${t.note}\n`;
  });

  await telegramService.sendMessage(chatId, text);
}

async function handleDelete(prisma, userId, chatId, text) {
  const parts = text.split(' ');
  if (parts.length < 2) {
    return telegramService.sendMessage(chatId, '❌ Format salah. Gunakan: <code>/delete &lt;id_transaksi&gt;</code>');
  }

  const transactionId = parts[1].trim();
  
  try {
    // Delete must include user_id to prevent deleting someone else's data
    // Prisma delete uses the primary key (@id or @@unique constraints). 
    // Since our primary key is `id`, we must use `deleteMany` to include `user_id` reliably in the Where clause.
    const result = await prisma.transaction.deleteMany({
      where: {
        id: transactionId,
        user_id: userId
      }
    });

    if (result.count === 0) {
      return telegramService.sendMessage(chatId, '❌ Transaksi tidak ditemukan atau Anda tidak memiliki akses.');
    }

    await telegramService.sendMessage(chatId, '✅ Transaksi berhasil dihapus.');
  } catch (err) {
    throw err;
  }
}

async function handleTransaction(prisma, userId, chatId, text) {
  const parsed = parseTransaction(text);

  if (!parsed) {
    // Return early if format does not make sense. Fail fast!
    const errorMsg = `❌ Format gagal dipahami.\n\nContoh:\n➕ Pemasukan: <code>+50000 dari teman</code>\n➖ Pengeluaran: <code>-20000 kopi</code>`;
    return telegramService.sendMessage(chatId, errorMsg);
  }

  // Insert to Database
  await prisma.transaction.create({
    data: {
      user_id: userId,
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note
    }
  });

  const responseText = `✅ ${parsed.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} tercatat\n\n` +
                       `* Rp${parsed.amount.toLocaleString('id-ID')} (${parsed.category})`;

  // Optimally we'd append balance here, but calculating it adds overhead. 
  // User can use /summary. If we want it, we can fetch it, but let's keep it lean.

  await telegramService.sendMessage(chatId, responseText);
}

module.exports = {
  processTextMessage
};
