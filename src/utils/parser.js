const MAX_AMOUNT = 1e9; // 1,000,000,000

/**
 * Parses a transaction input string.
 * @param {string} text - User message text (e.g., "+50000 makan", "-20000 kopi")
 * @returns {object|null} - Parsed transaction object or null if invalid
 */
function parseTransaction(text) {
  if (!text) return null;

  // Trim and lowercase
  const raw = text.trim().toLowerCase();

  // Normalize number (remove dots and commas)
  // We want to match exactly one sign at the beginning, followed by digits, then a space, then the note.
  // Using regex: ^([+-])\s*([\d.,]+)\s*(.*)$
  const match = raw.match(/^([+-])\s*([\d.,]+)\s*(.*)$/);
  if (!match) return null;

  const signStr = match[1]; // "+" or "-"
  let amountStr = match[2];
  let noteStr = match[3];

  // Remove dots and commas (e.g., 50.000 -> 50000)
  amountStr = amountStr.replace(/[.,]/g, '');

  // Must contain only digits after replacement
  if (!/^\d+$/.test(amountStr)) return null;

  const amount = parseInt(amountStr, 10);

  // Validate amount
  if (isNaN(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return null;
  }

  const type = signStr === '+' ? 'income' : 'expense';
  
  // Categorization
  let category = 'lainnya';
  if (noteStr) {
    if (noteStr.includes('makan') || noteStr.includes('kopi') || noteStr.includes('food')) {
      category = 'food';
    } else if (noteStr.includes('bensin') || noteStr.includes('transport')) {
      category = 'transport';
    } else if (noteStr.includes('gaji') || noteStr.includes('income')) {
      category = 'income';
    }
  }

  return {
    type,
    amount,
    category,
    note: noteStr || null
  };
}

module.exports = {
  parseTransaction,
  MAX_AMOUNT
};
