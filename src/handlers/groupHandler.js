const telegramService = require('../services/telegramService');
const userService = require('../services/userService');

async function handleNewGroupMember(ctx, message) {
  const newMembers = message.new_chat_members;
  if (!newMembers) return;

  for (const member of newMembers) {
    if (member.is_bot) continue;
    
    // Member just joined, update cache so they form the habit natively
    await userService.checkMustJoin(ctx.server, member.id, true);

    const botUsername = process.env.BOT_USERNAME || 'KeshotBot';
    const text = `Halo <a href="tg://user?id=${member.id}">${member.first_name}</a>! 👋\nTerima kasih sudah bergabung di grup Keshot Feedback.\n\nSilakan klik tombol di bawah ini untuk kembali ke Bot Keshot dan melanjutkan pencatatan keuangan Anda.`;
    const keyboard = [[{ text: '🤖 Kembali ke Bot Keshot', url: `https://t.me/${botUsername}` }]];

    await telegramService.sendMessage(ctx.server, message.chat.id, text, { inline_keyboard: keyboard });
  }
}

async function handleLeftGroupMember(ctx, message) {
  const leftMember = message.left_chat_member;
  if (!leftMember || leftMember.is_bot) return;

  await userService.clearAuthCache(leftMember.id);
  ctx.server.log.info({ msg: 'User left group, cleared auth cache instantly', userId: leftMember.id });
}

module.exports = {
  handleNewGroupMember,
  handleLeftGroupMember
};
