const supabase = require('../lib/supabase');
const membershipCache = require('../lib/authCache');

const CACHE_TTL_SECONDS = 5 * 60; // 5 mins

async function getOrCreateUser(telegramId, name, server) {
  const { data: user, error } = await supabase
    .from('users')
    .upsert(
      { telegram_id: telegramId, name: name },
      { onConflict: 'telegram_id' }
    )
    .select('id, reminder_enabled, reminder_hour, reminder_last_sent')
    .single();

  if (error) {
    if (server) server.log.error(error, `Failed to upsert user for telegram_id: ${telegramId}`);
    return null;
  }
  return user;
}

async function getUserByTelegramId(telegramId, server) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, reminder_enabled, reminder_hour, reminder_last_sent')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error || !user) {
    if (server) server.log.error(error, `User not found for telegram_id: ${telegramId}`);
    return null;
  }
  return user;
}

async function checkMustJoin(server, userId, forceRefresh = false) {
  const REQUIRED_GROUP = process.env.REQUIRED_GROUP_ID;
  if (!REQUIRED_GROUP) return true;

  if (!forceRefresh) {
    const cached = await membershipCache.getMembership(userId);
    if (cached) {
      if (cached.isMember) return true;
      return false;
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

    await membershipCache.setMembership(userId, isMember, CACHE_TTL_SECONDS);
    return isMember;

  } catch (e) {
    if (server) server.log.error(e, 'Failed to check chat member - Network Error Celah Keamanan');
    return false; // Fail closed
  }
}

async function setReminder(userId, hour) {
  const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const currentHourWIB = nowWIB.getHours();

  let newLastSent = null;
  if (hour <= currentHourWIB) {
    newLastSent = new Date().toISOString();
  }

  const { error } = await supabase
    .from('users')
    .update({ reminder_enabled: true, reminder_hour: hour, reminder_last_sent: newLastSent })
    .eq('id', userId);

  if (error) throw error;
}

async function disableReminder(userId) {
  const { error } = await supabase
    .from('users')
    .update({ reminder_enabled: false, reminder_hour: null })
    .eq('id', userId);

  if (error) throw error;
}

async function clearAuthCache(userId) {
  await membershipCache.deleteMembership(userId);
}

module.exports = {
  getOrCreateUser,
  getUserByTelegramId,
  checkMustJoin,
  setReminder,
  disableReminder,
  clearAuthCache
};
