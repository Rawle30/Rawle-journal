import { writeCachedPrice } from './storage.js';

const API_KEY = 'I3AR7KSM7UR0RYLA';

export function isCrypto(symbol) {
  return /^[A-Z]+-[A-Z]{3}$/.test(symbol);
}

export async function fetchFromCoinbase(symbol) {
  const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}/spot`;
  const r = await fetch(url);
  const j = await r.json();
  const amt = parseFloat(j?.data?.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Coinbase invalid price');
  writeCachedPrice(symbol, amt);
  return amt;
}

export async function fetchFromAlphaVantage(symbol) {
  const gqUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
  const gq = await (await fetch(gqUrl)).json();
  const px = parseFloat(gq?.['Global Quote']?.['05. price']);
  if (Number.isFinite(px) && px > 0) {
    writeCachedPrice(symbol, px);
    return px;
  }

  const dailyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${API_KEY}`;
  const daily = await (await fetch(dailyUrl)).json();
  const ts = daily?.['Time Series (Daily)'];
  const mostRecent = ts ? Object.keys(ts)[0] : null;
  const close = mostRecent ? parseFloat(ts[mostRecent]['4. close']) : NaN;
  if (Number.isFinite(close) && close > 0) {
    writeCachedPrice(symbol, close);
    return close;
  }

  throw new Error('AlphaVantage unavailable');
}

export async function fetchFromYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  const close = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (Number.isFinite(close) && close > 0) {
    writeCachedPrice(symbol, close);
    return close;
  }
  throw new Error('Yahoo Finance unavailable');
}
