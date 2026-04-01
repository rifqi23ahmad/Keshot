let miniappUrl = process.env.WEBHOOK_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'example.com';
if (!miniappUrl.startsWith('http')) {
  miniappUrl = `https://${miniappUrl}`;
}
if (miniappUrl.endsWith('/webhook')) miniappUrl = miniappUrl.slice(0, -8);
if (miniappUrl.endsWith('/')) miniappUrl = miniappUrl.slice(0, -1);
miniappUrl = `${miniappUrl}/app/index.html`;

const PERSISTENT_KEYBOARD = {
  keyboard: [
    [{ text: 'Hari Ini' }, { text: 'Reminder' }]
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
  const text = `Halo, ${name}!\nSaya adalah <b>Keshot</b>, bot pencatat keuangan pribadi Anda.\n\n` +
    `<b>Cara mencatat transaksi:</b>\n` +
    `Pendapatan: <code>+50000 Gaji</code>\n` +
    `Pengeluaran: <code>-20000 Makan siang</code>`;
  return { text, replyMarkup: PERSISTENT_KEYBOARD };
}

function formatDashboardMessage() {
  const text = `Klik tombol di bawah ini untuk membuka fitur lengkap aplikasi Keshot:`;
  return { text, replyMarkup: { inline_keyboard: [INLINE_DASHBOARD] } };
}

function formatHistory(transactions, page, hasNextPage, offset) {
  let text = `<b>Histori Transaksi (Hal ${page})</b>\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '+' : '-';
    const num = offset + index + 1;
    text += `<b>${num}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `${t.note} (${t.category})` : `${t.category}`;
    text += `<i>${label}</i>\n\n`;
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
  let text = `<b>Transaksi Hari Ini (Hal ${page})</b>\n\n`;
  text += `<b>Pemasukan:</b> Rp${totalIncome.toLocaleString('id-ID')}\n`;
  text += `<b>Pengeluaran:</b> Rp${totalExpense.toLocaleString('id-ID')}\n`;
  text += `-----------------\n\n`;
  transactions.forEach((t, index) => {
    const symbol = t.type === 'income' ? '+' : '-';
    const num = offset + index + 1;
    text += `<b>${num}.</b> ${symbol} Rp${t.amount.toLocaleString('id-ID')}\n`;
    const label = t.note ? `${t.note} (${t.category})` : `${t.category}`;
    text += `<i>${label}</i>\n\n`;
  });

  const inlineKeyboard = [];
  const navigationRow = [];

  if (page > 1) navigationRow.push({ text: '<< Sebelumnya', callback_data: `today_${page - 1}` });
  if (hasNextPage) navigationRow.push({ text: 'Berikutnya >>', callback_data: `today_${page + 1}` });

  if (navigationRow.length > 0) inlineKeyboard.push(navigationRow);
  inlineKeyboard.push(INLINE_DASHBOARD);

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

function formatReminder(isEnabled, currentHour) {
  let statusText;
  if (isEnabled && currentHour !== null && currentHour !== undefined) {
    statusText = `Reminder aktif setiap jam <b>${String(currentHour).padStart(2, '0')}:00 WIB</b>`;
  } else {
    statusText = `Reminder <b>tidak aktif</b>`;
  }

  const text = `<b>Pengaturan Reminder Harian</b>\n\n${statusText}\n\nPilih jam untuk mendapatkan pengingat mencatat transaksi setiap hari:`;

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
  
  let text = `<b>Hasil Scan Dokumen / Struk</b>\n\n`;
  text += `Tipe: <b>${typeLabel}</b>\n`;
  text += `Merchant: <b>${merchantName}</b>\n`;
  text += `Total: <b>Rp${result.total.toLocaleString('id-ID')}</b>\n`;
  text += `Item: ${result.items.length}\n\n`;
  
  const previewItems = result.items.slice(0, 5);
  previewItems.forEach(item => {
    text += ` - ${item.name} (Rp${item.price.toLocaleString('id-ID')})\n`;
  });
  if (result.items.length > 5) {
    text += ` - <i>...dan ${result.items.length - 5} item lainnya</i>\n`;
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
  formatDashboardMessage,
  formatHistory,
  formatToday,
  formatReminder,
  formatTransactionAdded,
  formatScanResult
};
