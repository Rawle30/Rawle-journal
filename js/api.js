// api.js
import { writeCachedPrice, readCachedPrice } from './storage.js';

const API_KEY = 'I3AR7KSM7UR0RYLA';

// ---- Tunables ----
const TTL_MS = 60_000;              // cache TTL for readCachedPrice
const FETCH_TIMEOUT_MS = 8000;      // per request timeout
const MAX_RETRIES = 2;              // retries after initial attempt
const BACKOFF_MS = 500;             // initial backoff
const AV_SPACING_MS = 15_000;       // Alpha Vantage spacing (free tier friendly)

// ---- Helpers ----
const memoInFlight = new Map(); // de-duplicate concurrent symbol fetches

export function isCrypto(symbol) {
  return /^[A-Z]+-[A-Z]{3,4}$/.test(String(symbol).toUpperCase()); // BTC-USD, ETH-USDT
}

function norm(sym) {
  return String(sym || '').trim().toUpperCase();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, { timeout = FETCH_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

async function withRetries(fn) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await delay(BACKOFF_MS * 2 ** attempt + Math.random() * 200);
      attempt++;
    }
  }
}

// ---- Alpha Vantage soft queue ----
const AV_QUEUE = [];
let AV_BUSY = false;

function enqueueAV(task) {
  return new Promise((resolve, reject) => {
    AV_QUEUE.push({ task, resolve, reject });
    runAV();
  });
}
async function runAV() {
  if (AV_BUSY) return;
  AV_BUSY = true;
  while (AV_QUEUE.length) {
    const { task, resolve, reject } = AV_QUEUE.shift();
    try { resolve(await task()); }
    catch (e) { reject(e); }
    await delay(AV_SPACING_MS);
  }
  AV_BUSY = false;
}

// ---- Public fetchers (compatible with your original names) ----
export async function fetchFromCoinbase(symbol) {
  const sym = norm(symbol);
  const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(sym)}/spot`;
  const j = await withRetries(() => fetchJSON(url));
  const amt = parseFloat(j?.data?.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Coinbase invalid price');
  writeCachedPrice(sym, amt);
  return amt;
}

export async function fetchFromAlphaVantage(symbol) {
  const sym = norm(symbol);
  return enqueueAV(async () => {
    // GLOBAL_QUOTE
    const gqUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${API_KEY}`;
    const gq = await withRetries(() => fetchJSON(gqUrl));
    if (gq?.Note || gq?.Information) throw new Error('AlphaVantage rate-limited');

    const px = parseFloat(gq?.['Global Quote']?.['05. price']);
    if (Number.isFinite(px) && px > 0) {
      writeCachedPrice(sym, px);
      return px;
    }

    // Fallback DAILY
    const dUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(sym)}&outputsize=compact&apikey=${API_KEY}`;
    const daily = await withRetries(() => fetchJSON(dUrl));
    if (daily?.Note || daily?.Information) throw new Error('AlphaVantage rate-limited');

    const ts = daily?.['Time Series (Daily)'];
    const mostRecent = ts ? Object.keys(ts).sort().pop() : null;
    const close = mostRecent ? parseFloat(ts[mostRecent]?.['4. close']) : NaN;
    if (Number.isFinite(close) && close > 0) {
      writeCachedPrice(sym, close);
      return close;
    }

    throw new Error('AlphaVantage unavailable');
  });
}

export async function fetchFromYahoo(symbol) {
  const sym = norm(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  const j = await withRetries(() => fetchJSON(url));
  const close = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (Number.isFinite(close) && close > 0) {
    writeCachedPrice(sym, close);
    return close;
  }
  throw new Error('Yahoo Finance unavailable');
}

// ---- Unified API with cache-first + fallbacks ----
export async function getPrice(symbol) {
  const sym = norm(symbol);
  if (!sym) throw new Error('Symbol required');

  // De-dup concurrent requests for same symbol
  if (memoInFlight.has(sym)) return memoInFlight.get(sym);

  const task = (async () => {
    // 1) Fresh cache
    const cached = readCachedPrice(sym, false, TTL_MS);
    if (cached?.price && Number.isFinite(cached.price)) return cached.price;

    // 2) Try primary source by asset class, then fallbacks
    const chain = isCrypto(sym)
      ? [() => fetchFromCoinbase(sym), () => fetchFromYahoo(sym)]
      : [() => fetchFromAlphaVantage(sym), () => fetchFromYahoo(sym)];

    let lastErr;
    for (const step of chain) {
      try { return await step(); }
      catch (e) { lastErr = e; }
    }

    // 3) Stale cache fallback if available
    const stale = readCachedPrice(sym, true, TTL_MS);
    if (stale?.price && Number.isFinite(stale.price)) return stale.price;

    throw lastErr || new Error('All sources unavailable');
  })();

  memoInFlight.set(sym, task);
  try { return await task; }
  finally { memoInFlight.delete(sym); }
}

