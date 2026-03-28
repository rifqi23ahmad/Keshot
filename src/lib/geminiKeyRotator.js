const supabase = require('./supabase');

let keyState = [];
let currentIndex = 0;

const COOLDOWN_DURATION = 60 * 1000; // 60 seconds

async function initKeys() {
  // Try fetching from database first
  const { data, error } = await supabase.from('gemini_keys').select('api_key').eq('is_active', true);
  
  let validKeys = [];
  
  if (!error && data && data.length > 0) {
    validKeys = data.map(r => r.api_key);
  } else if (process.env.GEMINI_KEYS) {
    // Fallback to environment variables
    validKeys = process.env.GEMINI_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }

  keyState = validKeys.map(key => ({
    key,
    cooldownUntil: 0,
    lastUsedAt: 0
  }));

  // Randomize starting index to prevent starting at 0 every reboot
  if (keyState.length > 0) {
    currentIndex = Math.floor(Math.random() * keyState.length);
  }
}

function getAvailableKey() {
  if (keyState.length === 0) {
    throw new Error('NO_AVAILABLE_KEY');
  }

  const now = Date.now();
  let attempts = 0;
  const totalKeys = keyState.length;

  while (attempts < totalKeys) {
    const currentState = keyState[currentIndex];
    
    // Move pointer for next time (Round Robin atomic increment)
    currentIndex = (currentIndex + 1) % totalKeys;

    if (now >= currentState.cooldownUntil) {
      currentState.lastUsedAt = now;
      return currentState.key;
    }

    attempts++;
  }

  throw new Error('NO_AVAILABLE_KEY');
}

function markCooldown(key, durationMs = COOLDOWN_DURATION) {
  const stateObj = keyState.find(k => k.key === key);
  if (stateObj) {
    // Apply jitter to avoid thundering herd problem when multiple keys come off cooldown
    const jitter = Math.floor(Math.random() * 5000); 
    stateObj.cooldownUntil = Date.now() + durationMs + jitter;
  }
}

module.exports = {
  initKeys,
  getAvailableKey,
  markCooldown
};
