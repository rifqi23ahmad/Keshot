// src/services/parserService.js

/**
 * Regex patterns
 * [1-9] at start prevents it from matching NPWP like 01.336.238
 */
const PRICE_REGEX = /\b[1-9]\d{0,2}(?:[.,]\d{3})+\b/g;
const CLEAN_PRICE_REGEX = /[^\d]/g;

function parsePrice(str) {
  return parseInt(str.replace(CLEAN_PRICE_REGEX, ''), 10);
}

function detectMerchant(text) {
  const upper = text.toUpperCase();
  if (upper.includes('INDOMARET')) return 'indomaret';
  if (upper.includes('ALFAMART') || upper.includes('ALFARIA')) return 'alfamart';
  if (upper.includes('ALFAMIDI')) return 'alfamidi';
  return 'generic';
}

function parseIndomaret(lines) {
  let items = [];
  let total = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();
    
    if (upper.includes('TOTAL') || upper.includes('SUBTOTAL')) {
      const match = line.match(PRICE_REGEX);
      if (match) {
        total = Math.max(total, parsePrice(match[match.length - 1]));
      }
      break; 
    }

    const matches = line.match(PRICE_REGEX);
    if (matches && matches.length > 0) {
      const price = parsePrice(matches[matches.length - 1]);
      const name = line.replace(matches[matches.length - 1], '').replace(PRICE_REGEX, '').trim();
      if (price > 0 && name.length > 2) {
        items.push({ name, price });
      }
    }
  }
  
  return { items, total };
}

function parseAlfamart(lines) {
  let items = [];
  let total = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();
    
    if (upper.includes('TOTAL') || upper.includes('TUNAI') || upper.includes('CASH')) {
      const match = line.match(PRICE_REGEX);
      if (match) {
        total = Math.max(total, parsePrice(match[match.length - 1]));
      }
      break; 
    }

    const matches = line.match(PRICE_REGEX);
    if (matches && matches.length > 0) {
      const price = parsePrice(matches[matches.length - 1]);
      let name = line.replace(matches[matches.length - 1], '').replace(PRICE_REGEX, '').trim();
      
      if (upper.includes(' X ')) {
        const parts = upper.split(' X ');
        if (parts.length > 1) {
          name = lines[i-1] ? lines[i-1].trim() : name;
        }
      }

      if (price > 0 && name.length > 2) {
        items.push({ name, price });
      }
    }
  }
  return { items, total };
}

function parseGeneric(lines) {
  let items = [];
  let total = 0;
  let allPrices = [];
  
  for (const line of lines) {
    const upper = line.toUpperCase();
    const matches = line.match(PRICE_REGEX);
    
    if (matches) {
      const price = parsePrice(matches[matches.length - 1]);
      allPrices.push(price);
      
      const name = line.replace(matches[matches.length - 1], '').replace(PRICE_REGEX, '').trim();
      if (price > 0 && name.length > 2 && !upper.includes('KEMBALI') && !upper.includes('TUNAI')) {
        items.push({ name, price });
      }

      if (upper.includes('TOTAL') || upper.includes('JUMLAH')) {
        total = Math.max(total, price);
      }
    }
  }

  if (total === 0 && allPrices.length > 0) {
    total = Math.max(...allPrices);
  }

  items = items.filter(i => i.price !== total);

  return { items, total };
}

function parseReceipt(text) {
  if (!text || text.trim() === '') return { merchant: 'unknown', items: [], total: 0, raw: '' };

  const merchant = detectMerchant(text);
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let result;
  if (merchant === 'indomaret') result = parseIndomaret(lines);
  else if (merchant === 'alfamart' || merchant === 'alfamidi') result = parseAlfamart(lines);
  else result = parseGeneric(lines);

  if (result.total === 0 && result.items.length > 0) {
    result.total = result.items.reduce((sum, item) => sum + item.price, 0);
  }

  return {
    merchant,
    items: result.items || [],
    total: result.total || 0,
    raw: text
  };
}

module.exports = {
  parseReceipt,
  detectMerchant
};
