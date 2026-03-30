// src/lib/ocrStateStore.js
// State management for OCR results awaiting confirmation
const redis = require('./redis');

const ocrStateMap = new Map();
const TTL_SECONDS = 5 * 60; // 5 minutes in Redis
const TTL_MS = TTL_SECONDS * 1000;

async function saveOcrState(userId, stateData) {
  const idStr = String(userId);
  if (redis) {
    await redis.set(`ocr:${idStr}`, JSON.stringify(stateData), 'EX', TTL_SECONDS);
  } else {
    // Fallback Local Memory
    const expiresAt = Date.now() + TTL_MS;
    ocrStateMap.set(idStr, { ...stateData, expiresAt });
  }
}

async function getOcrState(userId) {
  const idStr = String(userId);
  if (redis) {
    const data = await redis.get(`ocr:${idStr}`);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return null;
  } else {
    const state = ocrStateMap.get(idStr);
    if (state && Date.now() < state.expiresAt) {
      return state;
    }
    return null;
  }
}

async function clearOcrState(userId) {
  const idStr = String(userId);
  if (redis) {
    await redis.del(`ocr:${idStr}`);
  } else {
    ocrStateMap.delete(idStr);
  }
}

module.exports = {
  saveOcrState,
  getOcrState,
  clearOcrState
};
