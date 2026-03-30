const redis = require('./redis');

const localCache = new Map();

function isRedisReady() {
  return redis && redis.status === 'ready';
}

async function getMembership(userId) {
  const idStr = String(userId);
  if (isRedisReady()) {
    try {
      const data = await redis.get(`auth:${idStr}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('[REDIS] authCache.getMembership error:', e.message);
    }
  }
  
  const cached = localCache.get(idStr);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }
  return null;
}

async function setMembership(userId, isMember, ttlSeconds) {
  const idStr = String(userId);
  const expiresAt = Date.now() + (ttlSeconds * 1000);
  
  // Always update local cache as immediate fallback
  localCache.set(idStr, { isMember, expiresAt });

  if (isRedisReady()) {
    try {
      await redis.set(`auth:${idStr}`, JSON.stringify({ isMember }), 'EX', ttlSeconds);
    } catch (e) {
      console.warn('[REDIS] authCache.setMembership error:', e.message);
    }
  }
}

async function deleteMembership(userId) {
  const idStr = String(userId);
  localCache.delete(idStr);

  if (isRedisReady()) {
    try {
      await redis.del(`auth:${idStr}`);
    } catch (e) {
      console.warn('[REDIS] authCache.deleteMembership error:', e.message);
    }
  }
}

module.exports = {
  getMembership,
  setMembership,
  deleteMembership
};
