// src/lib/ocrStateStore.js
// State management for OCR results awaiting confirmation
const ocrStateMap = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

function saveOcrState(userId, stateData) {
  const expiresAt = Date.now() + TTL;
  ocrStateMap.set(String(userId), { ...stateData, expiresAt });
}

function getOcrState(userId) {
  const state = ocrStateMap.get(String(userId));
  if (state && Date.now() < state.expiresAt) {
    return state;
  }
  return null;
}

function clearOcrState(userId) {
  ocrStateMap.delete(String(userId));
}

module.exports = {
  saveOcrState,
  getOcrState,
  clearOcrState
};
