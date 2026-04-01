let miniappUrl = process.env.WEBHOOK_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'example.com';
if (!miniappUrl.startsWith('http')) {
  miniappUrl = `https://${miniappUrl}`;
}
if (miniappUrl.endsWith('/webhook')) miniappUrl = miniappUrl.slice(0, -8);
if (miniappUrl.endsWith('/')) miniappUrl = miniappUrl.slice(0, -1);
miniappUrl = `${miniappUrl}/app/index.html`;

const PERSISTENT_KEYBOARD = {
  keyboard: [
    [{ text: 'Hapus' }, { text: 'Reminder' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

const INLINE_DASHBOARD = [{ text: 'Buka Dashboard', web_app: { url: miniappUrl } }];

function getMainMenu() {
  return PERSISTENT_KEYBOARD.keyboard;
}

function formatDenyMessage() {
  const groupLink = process.env.REQUIRED_GROUP_LINK || "https://t.me/KeshotFeedback";
  const text = `Akses Ditolak\n\nUntuk menggunakan bot Keshot, Anda wajib bergabung ke grup komunitas dahulu.`;
  const keyboard = [
    [{ text: 'Masuk Grup', url: groupLink }],
    [{ text: 'Saya Sudah Join', callback_data: 'cmd_check_join' }]
  ];
  return { text, replyMarkup: { inline_keyboard: keyboard } };
}

function formatStartMessage(name) {
  const text = `Halo, ${name}!\nSaya adalah *Keshot*, bot pencatat keuangan pribadi Anda.\n\n` +
    `*Cara mencatat transaksi:*\n` +
    `Pendapatan: \`+50000 Gaji\`\n` +
    `Pengeluaran: \`-20000 Makan siang\`\n\n` +
    `Anda juga bisa membuka dashboard melalui tombol di bawah ini:`;
  return { text, replyMarkup: { inline_keyboard: [INLINE_DASHBOARD] } };
  // Note: We might need to send PERSISTENT_KEYBOARD initially. But we can't send both in one message!
  // We'll let textHandler send the PERSISTENT_KEYBOARD as a separate welcome message or attached to the text.
}

function formatSummary(totalIncome, totalExpense, balance) {
  const text = `*Ringkasan Keuangan*\n\n` +
    `Total Pemasukan: Rp${totalIncome.toLocaleString('id-ID')}\n` +
    `Total Pengeluaran: Rp${totalExpense.toLocaleString('id-ID')}\n\n` +
    `*Saldo: Rp${balance.toLocaleString('id-ID')}*`;
  return { text, replyMarkup: { inline_keyboard: [INLINE_DASHBOARD] } };
}

function formatHistory(transactions, page, hasNextPage, offset) {
  let text = `*Histori Transaksi (Hal ${page})*\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '(+)' : '(-)';
    const num = offset + index + 1;
    text += `*${num}.* ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `_${t.note}_ (${t.category})` : `_${t.category}_`;
    text += `     └ ${label}\n\n`;
  });

  const inlineKeyboard = [];
  const navigationRow = [];

  if (page > 1) navigationRow.push({ text: '<< Sebelumnya', callback_data: `hist_${page - 1}` });
  if (hasNextPage) navigationRow.push({ text: 'Berikutnya >>', callback_data: `hist_${page + 1}` });

  if (navigationRow.length > 0) inlineKeyboard.push(navigationRow);
  inlineKeyboard.push(INLINE_DASHBOARD);

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

function formatToday(totalIncome, totalExpense, transactions, page, hasNextPage, offset) {
  let text = `*Transaksi Hari Ini (Hal ${page})*\n\n`;
  text += `*Pemasukan:* Rp${totalIncome.toLocaleString('id-ID')}\n`;
  text += `*Pengeluaran:* Rp${totalExpense.toLocaleString('id-ID')}\n`;
  text += `-----------------\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '(+)' : '(-)';
    const num = offset + index + 1;
    text += `*${num}.* ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `_${t.note}_ (${t.category})` : `_${t.category}_`;
    text += `     └ ${label}\n\n`;
  });

  const inlineKeyboard = [];
  const navigationRow = [];

  if (page > 1) navigationRow.push({ text: '<< Sebelumnya', callback_data: `today_${page - 1}` });
  if (hasNextPage) navigationRow.push({ text: 'Berikutnya >>', callback_data: `today_${page + 1}` });

  if (navigationRow.length > 0) inlineKeyboard.push(navigationRow);
  inlineKeyboard.push(INLINE_DASHBOARD);

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

function formatDeleteSelection(transactions, selectedIds, page, hasNextPage, offset) {
  let text = `*Pilih transaksi yang ingin dihapus (Hal ${page}):*\n_(Klik angka di tombol bawah untuk menandai)_\n\n`;
  const row1 = [];
  const row2 = [];

  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '(+)' : '(-)';
    const num = offset + index + 1;
    text += `*${num}.* ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `_${t.note}_ (${t.category})` : `_${t.category}_`;
    text += `     └ ${label}\n\n`;

    const isChecked = selectedIds.has(t.id);
    const checkBox = isChecked ? '[x]' : '[ ]';
    const btn = { text: `${checkBox} ${num}`, callback_data: `addel_${t.id}_pg${page}` };

    if (index < 5) row1.push(btn);
    else row2.push(btn);
  });

  const inlineKeyboard = [];
  if (row1.length > 0) inlineKeyboard.push(row1);
  if (row2.length > 0) inlineKeyboard.push(row2);

  const navigationRow = [];
  if (page > 1) navigationRow.push({ text: '<< Sebelumnya', callback_data: `delpg_${page - 1}` });
  if (hasNextPage) navigationRow.push({ text: 'Berikutnya >>', callback_data: `delpg_${page + 1}` });
  if (navigationRow.length > 0) inlineKeyboard.push(navigationRow);

  const actionRow = [];
  if (selectedIds.size > 0) actionRow.push({ text: `Hapus (${selectedIds.size})`, callback_data: 'mdel_confirm' });
  actionRow.push({ text: 'Batal', callback_data: 'mdel_cancel' });
  inlineKeyboard.push(actionRow);

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

function formatReminder(isEnabled, currentHour) {
  let statusText;
  if (isEnabled && currentHour !== null && currentHour !== undefined) {
    statusText = `Reminder aktif setiap jam *${String(currentHour).padStart(2, '0')}:00 WIB*`;
  } else {
    statusText = `Reminder *tidak aktif*`;
  }

  const text = `*Pengaturan Reminder Harian*\n\n${statusText}\n\nPilih jam untuk mendapatkan pengingat mencatat transaksi setiap hari:`;

  const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const hourButtons = [];
  for (let i = 0; i < hours.length; i += 4) {
    hourButtons.push(
      hours.slice(i, i + 4).map(h => ({
        text: `${isEnabled && currentHour === h ? '[x] ' : ''}${String(h).padStart(2, '0')}:00`,
        callback_data: `remind_set_${h}`
      }))
    );
  }

  const keyboard = [
    ...hourButtons,
    ...(isEnabled ? [[{ text: 'Nonaktifkan Reminder', callback_data: 'remind_off' }]] : []),
    [{ text: 'Tutup', callback_data: 'cmd_close_inline' }]
  ];

  return { text, replyMarkup: { inline_keyboard: keyboard } };
}

function formatTransactionAdded(parsedText) {
  const typeLabel = parsedText.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  const text = `Sukses! ${typeLabel} tercatat:\n\n* Rp${parsedText.amount.toLocaleString('id-ID')} (${parsedText.category})`;
  return { text, replyMarkup: { inline_keyboard: [INLINE_DASHBOARD] } };
}

function formatScanResult(result) {
  const merchantName = result.merchant === 'generic' ? 'Umum' : result.merchant.charAt(0).toUpperCase() + result.merchant.slice(1);
  const typeLabel = result.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  
  let text = `*Hasil Scan Dokumen / Struk*\n\n`;
  text += `Tipe: *${typeLabel}*\n`;
  text += `Merchant: *${merchantName}*\n`;
  text += `Total: *Rp${result.total.toLocaleString('id-ID')}*\n`;
  text += `Item: ${result.items.length}\n\n`;
  
  const previewItems = result.items.slice(0, 5);
  previewItems.forEach(item => {
    text += ` - ${item.name} (Rp${item.price.toLocaleString('id-ID')})\n`;
  });
  if (result.items.length > 5) {
    text += ` - _...dan ${result.items.length - 5} item lainnya_\n`;
  }
  
  text += `\nSimpan transaksi ini?`;

  const inlineKeyboard = [
    [
      { text: 'Simpan', callback_data: 'ocr_confirm' },
      { text: 'Edit', callback_data: 'ocr_edit' }
    ],
    [
      { text: 'Batal', callback_data: 'ocr_cancel' }
    ]
  ];

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

module.exports = {
  miniappUrl,
  PERSISTENT_KEYBOARD,
  INLINE_DASHBOARD,
  getMainMenu,
  formatDenyMessage,
  formatStartMessage,
  formatSummary,
  formatHistory,
  formatToday,
  formatDeleteSelection,
  formatReminder,
  formatTransactionAdded,
  formatScanResult
};
