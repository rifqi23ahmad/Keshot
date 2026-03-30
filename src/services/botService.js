const formatters = require('../utils/formatters');
const telegramService = require('./telegramService');
const userService = require('./userService');
const textHandler = require('../handlers/textHandler');
const photoHandler = require('../handlers/photoHandler');
const callbackHandler = require('../handlers/callbackHandler');
const groupHandler = require('../handlers/groupHandler');

async function processPhotoMessage(server, message) {
  const telegramId = message.from.id.toString();
  const chatId = message.chat.id;
  const name = message.from.first_name || 'User';

  const isMember = await userService.checkMustJoin(server, message.from.id);
  if (!isMember) {
    const denyMsg = formatters.formatDenyMessage();
    return telegramService.sendMessage(server, chatId, denyMsg.text, denyMsg.replyMarkup);
  }

  const user = await userService.getOrCreateUser(telegramId, name, server);
  if (!user) return telegramService.sendMessage(server, chatId, '⚠️ Gagal memuat profil pengguna.');

  const ctx = {
    server,
    chatId,
    telegramId,
    messageId: message.message_id,
    userId: user.id,
    user
  };

  return photoHandler.handlePhoto(ctx, message);
}

async function processTextMessage(server, message) {
  const telegramId = message.from.id.toString();
  const chatId = message.chat.id;
  const name = message.from.first_name || 'User';

  const isMember = await userService.checkMustJoin(server, message.from.id);
  if (!isMember) {
    const denyMsg = formatters.formatDenyMessage();
    return telegramService.sendMessage(server, chatId, denyMsg.text, denyMsg.replyMarkup);
  }

  const user = await userService.getOrCreateUser(telegramId, name, server);
  if (!user) return telegramService.sendMessage(server, chatId, '⚠️ Gagal memuat profil pengguna.');

  const ctx = {
    server,
    chatId,
    telegramId,
    messageId: message.message_id,
    userId: user.id,
    user,
    messageIdToEdit: null
  };

  return textHandler.handleText(ctx, message);
}

async function processCallbackQuery(server, callbackQuery) {
  const telegramId = callbackQuery.from.id.toString();
  const chatId = callbackQuery.message.chat.id;
  
  // Notice we only get user. Upsert should only happen on text or photo message, to avoid creating ghosts here.
  // Actually, we can fetch the user by telegram_id. If missing, it will return null.
  const user = await userService.getUserByTelegramId(telegramId, server);

  const ctx = {
    server,
    chatId,
    telegramId,
    messageId: callbackQuery.message.message_id,
    userId: user ? user.id : null,
    user,
    messageIdToEdit: callbackQuery.message.message_id
  };

  return callbackHandler.handleCallback(ctx, callbackQuery);
}

async function handleNewGroupMember(server, message) {
  const ctx = { server };
  return groupHandler.handleNewGroupMember(ctx, message);
}

async function handleLeftGroupMember(server, message) {
  const ctx = { server };
  return groupHandler.handleLeftGroupMember(ctx, message);
}

module.exports = {
  processTextMessage,
  processPhotoMessage,
  processCallbackQuery,
  handleNewGroupMember,
  handleLeftGroupMember
};
