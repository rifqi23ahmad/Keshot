const rotator = require('../lib/geminiKeyRotator');

const REQUEST_TIMEOUT = 20000; // 20 seconds (Vision AI needs more time for long receipts)
const MAX_RETRY = 1;

/**
 * Calls Gemini Vision API to parse the Receipt Image with strict rotation/timeout checks.
 */
async function callGeminiWithRotation(base64Image, mimeType, server) {
  let attempt = 0;

  while (attempt <= MAX_RETRY) {
    let currentKey;
    try {
      currentKey = rotator.getAvailableKey();
    } catch (e) {
      if (e.message === 'NO_AVAILABLE_KEY') {
        server.log.warn('[GEMINI] All keys are on cooldown. Failing fast.');
        throw new Error('SYSTEM_BUSY');
      }
      throw e;
    }

    try {
      const result = await fetchGeminiApi(currentKey, base64Image, mimeType);
      server.log.info({ msg: '[GEMINI] Vision Parsing success', attempt });
      return result;
    } catch (err) {
      // Is it a rate limit / server error / timeout?
      server.log.warn({ msg: '[GEMINI] Error occurred, applying cooldown', keyPreview: currentKey.substring(0, 10), attempt, error: err.message });
      
      // Cooldown the key
      rotator.markCooldown(currentKey);

      attempt++;
      if (attempt > MAX_RETRY) {
        throw new Error('MAX_RETRY_EXCEEDED');
      }
    }
  }
}

async function fetchGeminiApi(apiKey, imageBase64, mimeType = 'image/jpeg') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const systemInstruction = `Anda adalah asisten parsing AI untuk struk belanja atau bukti pembayaran keuangan (termasuk Slip Gaji / Transfer Masuk) berbahasa Indonesia.
Saya akan memberikan gambar dokumen keuangan. Ekstrak data menjadi format JSON murni.
Format harus persis seperti ini:
{
  "type": "expense" | "income",
  "merchant": "indomaret" | "alfamart" | "alfamidi" | "generic",
  "total": 15000,
  "items": [{"name": "Gaji Bulan Ini", "price": 15000}]
}
"type" bernilai "income" HANYA JIKA dokumen adalah bukti terima gaji, transfer uang masuk, dsb. Jika struk belanja pengeluaran, isi "expense".
Abaikan PPN, kembalian, diskon footer, pajak, dll. Nominal total harus berupa Integer tanpa titik.
Pastikan total dan harga item presisi. HANYA OUTPUT JSON murni tanpa markdown tick!`;

  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: "Tolong ekstrak JSON dari gambar struk ini." }
      ]
    }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('REQUEST_TIMEOUT');
    }
    throw err;
  }
  
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`HTTP_ERROR_${response.status}`);
  }

  const data = await response.json();
  try {
    let rawJsonString = data.candidates[0].content.parts[0].text;
    rawJsonString = rawJsonString.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(rawJsonString);
    return parsed;
  } catch (err) {
    throw new Error('INVALID_JSON_RESPONSE');
  }
}

module.exports = {
  callGeminiWithRotation
};
