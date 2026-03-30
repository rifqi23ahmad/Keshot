const redis = require('./redis');

const localCache = new Map();

async function getMembership(userId) {
  const idStr = String(userId);
  if (redis) {
    const data = await redis.get(`auth:${idStr}`);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return null;
  } else {
    const cached = localCache.get(idStr);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }
    return null;
  }
}

async function setMembership(userId, isMember, ttlSeconds) {
  const idStr = String(userId);
  if (redis) {
    await redis.set(`auth:${idStr}`, JSON.stringify({ isMember }), 'EX', ttlSeconds);
  } else {
    localCache.set(idStr, { isMember, expiresAt: Date.now() + (ttlSeconds * 1000) });
  }
}

async function deleteMembership(userId) {
  const idStr = String(userId);
  if (redis) {
    await redis.del(`auth:${idStr}`);
  } else {
    localCache.delete(idStr);
  }
}

module.exports = {
  getMembership,
  setMembership,
  deleteMembership
};
