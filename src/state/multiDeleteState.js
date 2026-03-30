const redis = require('../lib/redis');

// Map<string, Set<string>> (user_id -> Set of transaction UUIDs)
const multiDeleteState = new Map();

// Helper to check if redis is actually usable
function isRedisReady() {
  return redis && redis.status === 'ready';
}

async function getMultiDelete(userId) {
  if (isRedisReady()) {
    try {
      const members = await redis.smembers(`mdel:${userId}`);
      return new Set(members);
    } catch (e) {
      console.warn('[REDIS] Error in getMultiDelete, falling back to memory:', e.message);
    }
  }
  if (!multiDeleteState.has(userId)) multiDeleteState.set(userId, new Set());
  return multiDeleteState.get(userId);
}

async function clearMultiDelete(userId) {
  if (isRedisReady()) {
    try {
      await redis.del(`mdel:${userId}`);
      return;
    } catch (e) {
      console.warn('[REDIS] Error in clearMultiDelete:', e.message);
    }
  }
  multiDeleteState.delete(userId);
}

async function toggleMultiDelete(userId, transactionId) {
  if (isRedisReady()) {
    try {
      const isMember = await redis.sismember(`mdel:${userId}`, transactionId);
      if (isMember) {
        await redis.srem(`mdel:${userId}`, transactionId);
      } else {
        await redis.sadd(`mdel:${userId}`, transactionId);
        await redis.expire(`mdel:${userId}`, 3600); // 1 hour TTL
      }
      return;
    } catch (e) {
      console.warn('[REDIS] Error in toggleMultiDelete, falling back to memory:', e.message);
    }
  }
  const set = await getMultiDelete(userId);
  if (set.has(transactionId)) set.delete(transactionId);
  else set.add(transactionId);
}

module.exports = {
  getMultiDelete,
  clearMultiDelete,
  toggleMultiDelete
};
