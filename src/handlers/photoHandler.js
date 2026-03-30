const telegramService = require('../services/telegramService');
const geminiService = require('../services/geminiService');
const ocrService = require('../services/ocrService');
const parserService = require('../services/parserService');
const ocrStateStore = require('../lib/ocrStateStore');
const formatters = require('../utils/formatters');

async function handlePhoto(ctx, message) {
  const photos = message.photo;
  if (!photos || photos.length === 0) return;

  const largestPhoto = photos[photos.length - 1];
  
  if (largestPhoto.file_size && largestPhoto.file_size > 5 * 1024 * 1024) {
    return telegramService.sendMessage(ctx.server, ctx.chatId, '⚠️ Ukuran foto terlalu besar. Maksimal 5MB.');
  }

  try {
    const fileData = await telegramService.getFile(ctx.server, largestPhoto.file_id);
    if (!fileData || !fileData.file_path) throw new Error('File path not found');

    const imageBuffer = await telegramService.downloadFileBuffer(ctx.server, fileData.file_path);
    if (!imageBuffer) throw new Error('Failed to download buffer');

    let result;
    try {
      try {
        await telegramService.sendMessage(ctx.server, ctx.chatId, '🧠 Membaca struk dengan **Gemini 2.5 AI**...');
      } catch(e) {}

      const base64Image = imageBuffer.toString('base64');
      result = await geminiService.callGeminiWithRotation(base64Image, 'image/jpeg', ctx.server);
      if (typeof result.total !== 'number' || !Array.isArray(result.items)) {
         throw new Error('Gemini hallucinated strict JSON structure');
      }
      result.raw = "(Parsed by Gemini AI Vision)";
    } catch (err) {
      ctx.server.log.warn({ msg: 'Gemini AI Failed, falling back to Tesseract OCR', error: err.message });
      try {
        await telegramService.sendMessage(ctx.server, ctx.chatId, '⚠️ Gemini AI Sibuk. Mengaktifkan *Tesseract OCR* sebagai cadangan...');
      } catch(e) {}
      
      const rawText = await ocrService.extractText(imageBuffer);
      if (!rawText || rawText.trim().length === 0) {
        return telegramService.sendMessage(ctx.server, ctx.chatId, '❌ Struk tidak terbaca sama sekali. Coba foto lebih jelas dengan pencahayaan terang.');
      }
      result = parserService.parseReceipt(rawText);
    }

    if (result.items.length === 0 && result.total === 0) {
       return telegramService.sendMessage(ctx.server, ctx.chatId, '❌ Gagal mengenali harga dan item pada struk ini. Pastikan foto tegak dan jelas (Bukan struk pudar / blur).');
    }

    await ocrStateStore.saveOcrState(ctx.telegramId, result);

    const { text, replyMarkup } = formatters.formatScanResult(result);
    await telegramService.sendMessage(ctx.server, ctx.chatId, text, replyMarkup);

  } catch (err) {
    ctx.server.log.error(err, 'Failed in processPhotoMessage');
    await telegramService.sendMessage(ctx.server, ctx.chatId, '❌ Gagal memproses struk. Resolusi terlalu kecil atau proses Time Out.');
  }
}

module.exports = {
  handlePhoto
};
