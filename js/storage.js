// storage.js
// Handles persistence for trades and cached prices

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ---------- Trade Storage ----------

/** Loads saved trades from localStorage. Returns [] if none or corrupted. */
export function loadTrades() {
  try {
    const raw = localStorage.getItem('tradesData');
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('⚠️ Failed to parse tradesData:', err);
    localStorage.removeItem('tradesData');
    return [];
  }
}

/** Saves the given trades array to localStorage. */
export function saveTrades(trades = []) {
  try {
    localStorage.setItem('tradesData', JSON.stringify(trades));
  } catch (err) {
    console.error('❌ Failed to save tradesData:', err);
  }
}

/** Clears all saved trades. */
export function clearTrades() {
  localStorage.removeItem('tradesData');
}

/** Exports trades as JSON string (for file download or backup). */
export function exportTrades() {
  return JSON.stringify(loadTrades(), null, 2);
}

/** Imports trades from JSON text and saves them. */
export function importTrades(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      saveTrades(parsed);
      return true;
    }
  } catch (e) {
    console.error('Invalid import data', e);
  }
  return false;
}

// ---------- Price Cache ----------

/**
 * Reads a cached price if still valid.
 * @param {string} symbol
 * @param {boolean} [allowStale=false]
 * @param {number} [ttlMs=CACHE_TTL]
 * @returns {{price:number,timestamp:number}|null}
 */
export function readCachedPrice(symbol, allowStale = false, ttlMs = CACHE_TTL) {
  const key = `price_${symbol}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const { price, timestamp } = JSON.parse(raw);
    if (!Number.isFinite(price) || price <= 0) return null;

    const age = Date.now() - timestamp;
    if (allowStale || age < ttlMs) return { price, timestamp, age };
    return null;
  } catch {
    localStorage.removeItem(`price_${symbol}`); // remove corrupt entry
    return null;
  }
}

/**
 * Writes a cached price entry with timestamp.
 * @param {string} symbol
 * @param {number} price
 */
export function writeCachedPrice(symbol, price) {
  const key = `price_${symbol}`;
  const value = JSON.stringify({ price, timestamp: Date.now() });
  try {
    localStorage.setItem(key, value);
    autoTrimCache();
  } catch (err) {
    console.warn('⚠️ Storage full, trimming cache.', err);
    autoTrimCache();
  }
}

/** Clears all cached prices. */
export function clearCachedPrices() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('price_'))
    .forEach(k => localStorage.removeItem(k));
}

/** Automatically trims oldest cached prices if over limit. */
function autoTrimCache(maxEntries = 200) {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('price_'));
  if (keys.length <= maxEntries) return;

  const records = keys.map(k => {
    try {
      const { timestamp } = JSON.parse(localStorage.getItem(k));
      return { k, ts: timestamp || 0 };
    } catch {
      return { k, ts: 0 };
    }
  });
  records.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < records.length - maxEntries; i++) {
    localStorage.removeItem(records[i].k);
  }
}

// ---------- Utility ----------

/** Get approximate cache size in bytes (for debugging). */
export function getCacheSize() {
  let total = 0;
  for (const k in localStorage) {
    const v = localStorage.getItem(k);
    total += (k.length + (v ? v.length : 0)) * 2; // UTF-16 bytes
  }
  return total;
}

/** Log cache summary to console. */
export function logCacheSummary() {
  const prices = Object.keys(localStorage).filter(k => k.startsWith('price_'));
  console.log(`💾 Trades: ${loadTrades().length}, Cached prices: ${prices.length}, Size: ${(getCacheSize()/1024).toFixed(1)} KB`);
}
