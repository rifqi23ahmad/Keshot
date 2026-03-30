// src/lib/ocrStateStore.js
// State management for OCR results awaiting confirmation
const redis = require('./redis');

const ocrStateMap = new Map();
const TTL_SECONDS = 5 * 60; // 5 minutes in Redis
const TTL_MS = TTL_SECONDS * 1000;

function isRedisReady() {
  return redis && redis.status === 'ready';
}

async function saveOcrState(userId, stateData) {
  const idStr = String(userId);
  const expiresAt = Date.now() + TTL_MS;
  
  // Always update local memory as immediate fallback
  ocrStateMap.set(idStr, { ...stateData, expiresAt });

  if (isRedisReady()) {
    try {
      await redis.set(`ocr:${idStr}`, JSON.stringify(stateData), 'EX', TTL_SECONDS);
    } catch (e) {
      console.warn('[REDIS] ocrStateStore.saveOcrState error:', e.message);
    }
  }
}

async function getOcrState(userId) {
  const idStr = String(userId);
  
  if (isRedisReady()) {
    try {
      const data = await redis.get(`ocr:${idStr}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('[REDIS] ocrStateStore.getOcrState error:', e.message);
    }
  }

  const state = ocrStateMap.get(idStr);
  if (state && Date.now() < state.expiresAt) {
    return state;
  }
  return null;
}

async function clearOcrState(userId) {
  const idStr = String(userId);
  ocrStateMap.delete(idStr);

  if (isRedisReady()) {
    try {
      await redis.del(`ocr:${idStr}`);
    } catch (e) {
      console.warn('[REDIS] ocrStateStore.clearOcrState error:', e.message);
    }
  }
}

module.exports = {
  saveOcrState,
  getOcrState,
  clearOcrState
};
