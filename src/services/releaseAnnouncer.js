const fs = require('fs');
const path = require('path');
const redis = require('../lib/redis');
const telegramService = require('./telegramService');

async function isRedisReady() {
  // Tunggu sebentar agar redis connect jika baru start
  for (let i = 0; i < 5; i++) {
    if (redis && redis.status === 'ready') return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function checkAndAnnounceRelease(server) {
  const groupId = process.env.REQUIRED_GROUP_ID;
  if (!groupId) {
    server.log.warn('REQUIRED_GROUP_ID tidak diset. Fitur release update dinonaktifkan.');
    return;
  }

  const releaseFilePath = path.join(__dirname, '../../release.json');
  if (!fs.existsSync(releaseFilePath)) {
    server.log.warn('release.json tidak ditemukan.');
    return;
  }

  try {
    const rawData = fs.readFileSync(releaseFilePath, 'utf8');
    const releaseData = JSON.parse(rawData);

    if (!releaseData.version || !releaseData.name) {
      server.log.warn('Format release.json tidak valid.');
      return;
    }

    const ready = await isRedisReady();
    if (!ready) {
      server.log.error('Redis tidak siap, tidak dapat memverifikasi release version.');
      return;
    }

    const lastAnnouncedVersion = await redis.get('system:last_announced_version');

    // Jika versi ini berbeda dari yang terakhir diumumkan, kirim!
    if (lastAnnouncedVersion !== releaseData.version) {
      
      let message = `📢 <b>${releaseData.name} (v${releaseData.version})</b>\n\n`;
      message += `Telah tersedia pembaruan sistem Keshot terbaru! Berikut apa yang baru:\n\n`;
      
      if (releaseData.enhancements && releaseData.enhancements.length > 0) {
        message += `✨ <b>Peningkatan Fitur:</b>\n`;
        releaseData.enhancements.forEach(item => {
          message += `• ${item}\n`;
        });
        message += `\n`;
      }
      
      if (releaseData.fixes && releaseData.fixes.length > 0) {
        message += `🔧 <b>Perbaikan:</b>\n`;
        releaseData.fixes.forEach(item => {
          message += `• ${item}\n`;
        });
        message += `\n`;
      }
      
      message += `<i>Update ini bersifat otomatis dan sudah langsung aktif di bot kamu. Selamat mencatat!</i>`;

      // Kirim pesan ke Grup
      await telegramService.sendMessage(server, groupId, message);
      
      // Simpan di Redis agar tidak dikirim ulang jika server restart
      await redis.set('system:last_announced_version', releaseData.version);
      
      server.log.info(`Release update v${releaseData.version} berhasil dikirim ke grup ${groupId}`);
    } else {
      server.log.info(`Release update v${releaseData.version} sudah pernah diumumkan.`);
    }

  } catch (err) {
    server.log.error(err, 'Terjadi kesalahan saat memproses release announcement');
  }
}

module.exports = {
  checkAndAnnounceRelease
};
