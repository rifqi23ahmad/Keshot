// public/js/state.js
export const state = {
    currentView: 'dashboard',
    historyDate: new Date(),
    historyMode: 'month', // 'month' | 'week'
    weekOffset: 0,
    currentEditId: null,
    tg: window.Telegram?.WebApp || null,
    currentHistoryFetchId: 0
};

// Setter helpers if needed, though they can be mutated directly for simplicity
export function setState(key, value) {
    state[key] = value;
}
