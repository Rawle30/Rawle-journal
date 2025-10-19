// trade-utils.js (drop-in replacement)

// --- Date helpers: strict YYYY-MM-DD without TZ drift ---
function toISODate(dateLike) {
  const s = String(dateLike || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const Y = +m[1], M = +m[2], D = +m[3];
  const dt = new Date(Date.UTC(Y, M, D, 0, 0, 0));
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M || dt.getUTCDate() !== D) return null;
  return `${String(Y).padStart(4,'0')}-${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')}`;
}

export function isValidDate(d) {
  return toISODate(d) !== null;
}

// --- Sanitizers ---
const SYMBOL_RE = /^[A-Z0-9.\-_/]+$/; // AAPL, BRK.B, BTC-USD, EUR/USD, OCC symbols, etc.
const cleanText = (s, max = 500) => String(s || '').replace(/[\u0000-\u001F\u007F<>"'\\]/g, '').slice(0, max).trim();
const cleanTags = (tags) =>
  Array.isArray(tags)
    ? tags.map(t => cleanText(t, 40)).filter(Boolean)
    : String(tags || '').split(',').map(t => cleanText(t, 40)).filter(Boolean);

const n = (v, def = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};

// --- Normalize (same API) ---
export function normalizeTrade(trade = {}) {
  const nowISO = new Date().toISOString().slice(0, 10);

  return {
    id:
      trade.id ||
      (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
    broker: String(trade.broker || 'unknown').toLowerCase(),
    symbol: String(trade.symbol || '').toUpperCase().trim().replace(/\s+/g, ''),
    type: String(trade.type || 'stock').toLowerCase(),
    date: toISODate(trade.date) || nowISO,
    exitDate: toISODate(trade.exitDate),
    qty: n(trade.qty, 0),
    entry: n(trade.entry, 0),
    stopLoss: trade.stopLoss != null ? n(trade.stopLoss, null) : null,
    exit: trade.exit != null ? n(trade.exit, null) : null,
    fees: n(trade.fees, 0),
    multiplier: n(trade.multiplier, 1),
    notes: cleanText(trade.notes || ''),
    tags: cleanTags(trade.tags)
  };
}

// --- Validate (boolean, same API) ---
export function validateTrade(trade) {
  const t = normalizeTrade(trade);
  const validBrokers = ['etrade', 'schwab', 'fidelity', 'webull', 'robinhood'];
  const validTypes = ['stock', 'option', 'crypto', 'etf'];

  if (!validBrokers.includes(t.broker)) return false;
  if (!validTypes.includes(t.type)) return false;

  if (!t.symbol || !SYMBOL_RE.test(t.symbol)) return false;

  if (!(t.qty > 0)) return false;
  if (!(t.entry > 0)) return false;
  if (!(t.multiplier >= 1)) return false;

  if (t.exit != null && !(t.exit >= 0)) return false;
  if (t.stopLoss != null && !(t.stopLoss >= 0)) return false;
  if (!(t.fees >= 0)) return false;

  if (!isValidDate(t.date)) return false;
  if (t.exitDate && !isValidDate(t.exitDate)) return false;
  if (t.exitDate && new Date(t.exitDate) < new Date(t.date)) return false;

  return true;
}

