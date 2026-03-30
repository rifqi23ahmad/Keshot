const Redis = require('ioredis');

// Check if REDIS_URL exists (either full string or rediss//...)
const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

let redis = null;

if (redisUrl) {
  redis = new Redis(redisUrl, {
    // Increase command retries
    maxRetriesPerRequest: 10,
    // Connect timeout
    connectTimeout: 10000,
    retryStrategy(times) {
      // Exponential backoff with a cap, retry for a long time (up to 20 times)
      // This gives more room for Upstash to stabilize
      if (times > 20) {
        console.error('[REDIS] Max retries reached. Stopping reconnection.');
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    reconnectOnError(err) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // Only reconnect when the error contains "READONLY"
        return true;
      }
      return false;
    }
  });

  redis.on('error', (err) => {
    console.error('[REDIS] Connection error:', err);
  });

  redis.on('connect', () => {
    console.log('[REDIS] Successfully connected to Redis.');
  });
} else {
  console.warn('[REDIS] REDIS_URL not found! Using memory fallback.');
}

module.exports = redis;
