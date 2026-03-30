const Redis = require('ioredis');

// Check if REDIS_URL exists (either full string or rediss//...)
const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

let redis = null;

if (redisUrl) {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 50, 2000);
    }
  });

  redis.on('error', (err) => {
    console.warn('[REDIS] Connection error:', err.message);
  });
} else {
  console.warn('[REDIS] REDIS_URL not found! Using memory fallback for development only.');
}

module.exports = redis;
