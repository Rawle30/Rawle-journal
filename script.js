'use strict';
/**
 * Trading Journal — robust market pricing & dividends
 * - Guards against writing zero/negative prices
 * - Sanitizes legacy caches with 0.00 values
 * - Fallback chain: Finnhub → AlphaVantage → Yahoo (JSON → DOM)
 * - Renders without $0.00 ticker artifacts
 */
document.addEventListener('DOMContentLoaded', async () => {
  // ========= Config / Keys =========
  let API_KEY = (localStorage.getItem('apiKey') || 'FTDRTP0955507PPC').trim(); // Alpha Vantage (may rate limit)
  let POLYGON_KEY = (localStorage.getItem('polygonKey') |NwqcDCmG_VpyNGIpeiubgB3f26ztrPLB| '').trim();
  const FINNHUB_TOKEN = 'd3f79jpr01qolknc02sgd3f79jpr01qolknc02t0'; // Demo-ish token string
  const CORS_PROXY = 'https://allorigins.win/get?url='; // Updated CORS proxy
  const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  // ========= Local state / caches =========
  let marketPrices = safeJson(localStorage.getItem('marketPrices'), {});
  let dividendInfo = safeJson(localStorage.getItem('dividendInfo'), {});
  let manualSymbols = new Set(safeJson(localStorage.getItem('manualSymbols'), []));
  let lastPriceFetchTime = localStorage.getItem('lastPriceFetchTime') ? new Date(localStorage.getItem('lastPriceFetchTime')) : null;
  let priceUpdateInterval = null;
  let rateLimitHit = false;
  // ========= Trades seed =========
  let trades = localStorage.getItem('trades')
    ? safeJson(localStorage.getItem('trades'), [])
    : [
        { symbol: 'AAPL', qty: 10, entry: 150, entryDate: '2025-10-12', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Etrade', tags: ['swing'], notes: '' },
        { symbol: 'GOOG', qty: 5, entry: 2800, entryDate: '2025-10-11', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Schwab', tags: ['long'], notes: '' },
        { symbol: 'MSFT', qty: 12, entry: 300, entryDate: '2025-10-10', exit: 310, exitDate: '2025-10-15', multiplier: 1, type: 'stock', broker: 'Fidelity', tags: ['day'], notes: '' },
        { symbol: 'TSLA', qty: 10, entry: 1000, entryDate: '2025-10-14', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Robinhood', tags: ['swing'], notes: '' },
        { symbol: 'BABA', qty: 5, entry: 100, entryDate: '2025-10-13', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Schwab', tags: ['long'], notes: '' }
      ];
  // ========= Utilities =========
  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => document.querySelectorAll(sel);
  function safeJson(txt, def) {
    try { return JSON.parse(txt ?? ''); } catch { return def; }
  }
  // Allow A–Z, numbers, dots & hyphens (to support BRK.B, BF-B, RY.TO, etc.)
  const isValidSymbol = (symbol) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(String(symbol || '').toUpperCase());
  const asNumber = (val, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };
  const isValidPrice = (n) => Number.isFinite(n) && n > 0;
  // Prefer newPrice if valid; else keep oldPrice if valid; else fallback (entry)
  const pickPrice = (newPrice, oldPrice, fallback) => {
    if (isValidPrice(newPrice)) return newPrice;
    if (isValidPrice(oldPrice)) return oldPrice;
    return isValidPrice(fallback) ? fallback : null;
  };
  const fmtUSD = (val) => `$${asNumber(val).toFixed(2)}`;
  const fmtPercent = (val) => `${(asNumber(val) * 100).toFixed(2)}%`;
  const formatPL = (value) => {
    const n = asNumber(value);
    const color = n >= 0 ? 'green' : 'red';
    return `<span class="${color}">${fmtUSD(n)}</span>`;
  };
  // ========= Theme / Compact =========
  // Applied in head script
  $('#darkToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });
  const compactToggle = $('#compactToggle');
  if (compactToggle) {
    if (localStorage.getItem('compact') === 'true') {
      compactToggle.checked = true;
      document.body.classList.add('compact');
    }
    compactToggle.addEventListener('change', () => {
      document.body.classList.toggle('compact', compactToggle.checked);
      localStorage.setItem('compact', compactToggle.checked ? 'true' : 'false');
    });
  }
  // ========= API Key control =========
  const apiKeyInput = $('#apiKeyInput');
  const saveApiKeyBtn = $('#saveApiKey');
  const apiKeyStatus = $('#apiKeyStatus');
  if (apiKeyInput && saveApiKeyBtn && apiKeyStatus) {
    apiKeyInput.value = API_KEY;
    saveApiKeyBtn.addEventListener('click', async () => {
      API_KEY = (apiKeyInput.value || '').trim();
      localStorage.setItem('apiKey', API_KEY);
      rateLimitHit = false;
      apiKeyStatus.textContent = API_KEY ? 'API key saved. Fetching prices...' : 'No API key provided (using Yahoo fallback).';
      await fetchMarketPrices(trades.map(t => t.symbol), true);
      precomputePL();
      renderAll();
      restartPriceUpdates();
    });
  }
  const polygonKeyInput = $('#polygonKeyInput');
  const savePolygonKeyBtn = $('#savePolygonKey');
  if (polygonKeyInput && savePolygonKeyBtn) {
    polygonKeyInput.value = POLYGON_KEY;
    savePolygonKeyBtn.addEventListener('click', async () => {
      POLYGON_KEY = (polygonKeyInput.value || '').trim();
      localStorage.setItem('polygonKey', POLYGON_KEY);
      apiKeyStatus.textContent = POLYGON_KEY ? 'Polygon key saved. Fetching dividends...' : 'No Polygon key provided.';
      await fetchMarketPrices(trades.map(t => t.symbol), true);
      renderAll();
    });
  }
  // ========= Sanitize legacy caches (remove 0 or negative) =========
  const hadInvalidCache = sanitizePriceCache();
  function sanitizePriceCache() {
    let invalidFound = false;
    for (const [sym, price] of Object.entries(marketPrices)) {
      if (!isValidPrice(price)) {
        delete marketPrices[sym];
        invalidFound = true;
      }
    }
    if (invalidFound) {
      localStorage.setItem('marketPrices', JSON.stringify(marketPrices));
    }
    return invalidFound;
  }
  // ========= Data fetchers =========
  async function fetchFinnhubData(symbol) {
    try {
      const quoteUrl = CORS_PROXY + encodeURIComponent(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
      const qRes = await fetch(quoteUrl);
      if (!qRes.ok) throw new Error(`Finnhub quote HTTP ${qRes.status}`);
      const proxyQ = await qRes.json();
      const q = safeJson(proxyQ.contents, {});
      const price = asNumber(q?.c, 0);
      // Dividends
      const from = new Date(); from.setFullYear(from.getFullYear() - 1);
      const fromStr = from.toISOString().split('T')[0];
      const toStr = new Date().toISOString().split('T')[0];
      const divUrl = CORS_PROXY + encodeURIComponent(`https://finnhub.io/api/v1/stock/dividend2?symbol=${symbol}&from=${fromStr}&to=${toStr}&token=${FINNHUB_TOKEN}`);
      const dRes = await fetch(divUrl);
      if (!dRes.ok) throw new Error(`Finnhub dividend HTTP ${dRes.status}`);
      const proxyD = await dRes.json();
      const rawDiv = safeJson(proxyD.contents, {});
      const arr = Array.isArray(rawDiv.data) ? rawDiv.data : [];
      let dividendRate = 0;
      for (const d of arr) dividendRate += asNumber(d?.amount, 0);
      const dividendYield = isValidPrice(price) ? dividendRate / price : 0;
      const lastDiv = arr.slice().sort((a, b) =>
        new Date(b?.exDate ?? b?.payDate ?? 0) - new Date(a?.exDate ?? a?.payDate ?? 0)
      )[0] || {};
      return {
        price,
        dividendRate,
        dividendYield,
        exDividendDate: lastDiv?.exDate || null,
        dividendDate: lastDiv?.payDate || null
      };
    } catch (e) {
      console.warn(`[Finnhub] ${symbol}: ${e.message}`);
      return null;
    }
  }
  async function fetchAlphaVantageData(symbol) {
    if (!API_KEY) return null;
    if (!isValidSymbol(symbol)) return null;
    try {
      // Overview for dividends
      const ovUrl = CORS_PROXY + encodeURIComponent(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEY}`);
      const ovRes = await fetch(ovUrl);
      if (!ovRes.ok) throw new Error(`Alpha Overview HTTP ${ovRes.status}`);
      const proxyOv = await ovRes.json();
      const ov = safeJson(proxyOv.contents, {});
      const dividendYield = asNumber(ov?.DividendYield, 0);
      const dividendPerShare = asNumber(ov?.DividendPerShare, 0);
      const exDividendDate = ov?.ExDividendDate || null;
      const dividendDate = ov?.DividendDate || null;
      // Quote
      const qUrl = CORS_PROXY + encodeURIComponent(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`);
      const qRes = await fetch(qUrl);
      if (!qRes.ok) throw new Error(`Alpha Quote HTTP ${qRes.status}`);
      const proxyQ = await qRes.json();
      const q = safeJson(proxyQ.contents, {});
      const rawPrice = q?.['Global Quote']?.['05. price'];
      if (!rawPrice) throw new Error('Alpha Vantage empty or rate-limited');
      const price = asNumber(rawPrice, 0);
      if (!isValidPrice(price)) throw new Error('Alpha Vantage returned non-positive price');
      return { price, dividendRate: dividendPerShare, dividendYield, exDividendDate, dividendDate };
    } catch (e) {
      if (String(e.message).toLowerCase().includes('limit')) rateLimitHit = true;
      console.warn(`[Alpha] ${symbol}: ${e.message}`);
      return null;
    }
  }
  // Yahoo: try embedded JSON first (most reliable), then DOM fallback
  async function fetchYahooData(symbol) {
    if (!isValidSymbol(symbol)) return null;
    try {
      const pageUrl = CORS_PROXY + encodeURIComponent(`https://finance.yahoo.com/quote/${symbol}`);
      const res = await fetch(pageUrl);
      if (!res.ok) throw new Error(`Yahoo quote HTTP ${res.status}`);
      const proxyData = await res.json();
      const html = proxyData.contents;
      // Try to extract price from embedded JSON (root.App.main)
      const jsonMatch = html.match(/root\.App\.main\s*=\s*(\{.*?\});\s*<\/script>/s);
      if (jsonMatch) {
        try {
          const root = JSON.parse(jsonMatch[1]);
          // The path tends to be: quotes > price > regularMarketPrice.raw
          const priceRaw =
            root?.context?.dispatcher?.stores?.QuoteSummaryStore?.price?.regularMarketPrice?.raw ??
            root?.context?.dispatcher?.stores?.StreamDataStore?.quoteData?.[symbol]?.regularMarketPrice?.raw ??
            null;
          const price = asNumber(priceRaw, 0);
          // Dividend fields are spread; we may skip precise dividend on Yahoo for reliability
          if (isValidPrice(price)) {
            return { price, dividendRate: 0, dividendYield: 0, exDividendDate: null, dividendDate: null };
          }
        } catch {
          // fall through to DOM parsing
        }
      }
      // DOM fallback (less reliable if Yahoo changes markup)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      let price = 0;
      // common selectors
      const streamer = doc.querySelector('fin-streamer[data-field="regularMarketPrice"]') ||
                       doc.querySelector('fin-streamer[data-test="qsp-price"]');
      if (streamer) {
        price = asNumber((streamer.textContent || '').trim(), 0);
      }
      if (!isValidPrice(price)) {
        // last resort: regex raw price
        const rawMatch = html.match(/ "regularMarketPrice":\s*\{"raw":\s*([\d.]+)/);
        price = asNumber(rawMatch?.[1], 0);
      }
      if (!isValidPrice(price)) throw new Error('Yahoo price not found or invalid');
      return { price, dividendRate: 0, dividendYield: 0, exDividendDate: null, dividendDate: null };
    } catch (e) {
      console.warn(`[Yahoo] ${symbol}: ${e.message}`);
      return null;
    }
  }
  async function fetchPolygonData(symbol) {
    if (!POLYGON_KEY) return null;
    if (!isValidSymbol(symbol)) return null;
    try {
      const from = new Date(); from.setFullYear(from.getFullYear() - 1);
      const fromStr = from.toISOString().split('T')[0];
      const toStr = new Date().toISOString().split('T')[0];
      const divUrl = `https://api.polygon.io/v3/reference/dividends?ticker=${symbol}&ex_dividend_date.gte=${fromStr}&ex_dividend_date.lte=${toStr}&apiKey=${POLYGON_KEY}`;
      const dRes = await fetch(divUrl);
      if (!dRes.ok) throw new Error(`Polygon HTTP ${dRes.status}`);
      const rawDiv = await dRes.json();
      const arr = Array.isArray(rawDiv.results) ? rawDiv.results : [];
      let dividendRate = 0;
      for (const d of arr) dividendRate += asNumber(d.cash_amount, 0);
      const qUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apiKey=${POLYGON_KEY}`;
      const qRes = await fetch(qUrl);
      if (!qRes.ok) throw new Error(`Polygon quote HTTP ${qRes.status}`);
      const rawQ = await qRes.json();
      const price = asNumber(rawQ.results?.[0]?.c, 0);
      const dividendYield = isValidPrice(price) ? dividendRate / price : 0;
      const lastDiv = arr.slice().sort((a, b) =>
        new Date(b.ex_dividend_date ?? b.pay_date ?? 0) - new Date(a.ex_dividend_date ?? a.pay_date ?? 0)
      )[0] || {};
      return {
        price,
        dividendRate,
        dividendYield,
        exDividendDate: lastDiv.ex_dividend_date || null,
        dividendDate: lastDiv.pay_date || null
      };
    } catch (e) {
      console.warn(`[Polygon] ${symbol}: ${e.message}`);
      return null;
    }
  }
  // ========= Price & Dividend orchestration =========
  async function fetchMarketPrices(symbols, force = false) {
    // Decide whether to use cache
    const now = new Date();
    const cacheFresh = lastPriceFetchTime && (now - lastPriceFetchTime) < PRICE_CACHE_TTL_MS && Object.keys(marketPrices).length > 0;
    // If cache is fresh AND contains only valid prices AND not forcing → use cache
    if (!force && cacheFresh && !containsInvalidPrices(symbols)) {
      console.log(`[cache] Using cached prices from ${lastPriceFetchTime?.toISOString?.()}`);
      $('#ticker-scroll') && ($('#ticker-scroll').textContent = 'Using cached market data');
      apiKeyStatus && (apiKeyStatus.textContent = 'Using cached prices (recent).');
      return true;
    }
    // Otherwise, fetch in small batches
    const uniqueSymbols = [...new Set(symbols.map(s => s.toUpperCase()))];
    let success = true;
    let invalidSymbols = [];
    const batchSize = 5;
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        if (!isValidSymbol(symbol)) {
          invalidSymbols.push(symbol);
          const entry = getEntryFor(symbol);
          const prev = marketPrices[symbol];
          const picked = pickPrice(null, prev, entry);
          if (picked != null) marketPrices[symbol] = picked;
          success = false;
          return;
        }
        // Polygon (if key) → Finnhub → Alpha → Yahoo
        let data = POLYGON_KEY ? await fetchPolygonData(symbol) : null;
        if (data === null) data = await fetchFinnhubData(symbol);
        if (data === null) data = await fetchAlphaVantageData(symbol);
        if (data === null) data = await fetchYahooData(symbol);
        if (data === null) {
          // Keep previous or entry if possible — but never write 0
          console.warn(`[prices] No source data for ${symbol}`);
          const entry = getEntryFor(symbol);
          const prev = marketPrices[symbol];
          const picked = pickPrice(null, prev, entry);
          if (picked == null) success = false;
          else marketPrices[symbol] = picked;
          return;
        }
        const entry = getEntryFor(symbol);
        const prev = marketPrices[symbol];
        const picked = pickPrice(asNumber(data.price, 0), prev, entry);
        if (picked == null) {
          console.warn(`[prices] ${symbol} resolved invalid; keeping previous/entry if any`);
          success = false;
        } else {
          marketPrices[symbol] = picked; // always positive here
        }
        // Dividends (store even if 0, but skip if manual override)
        if (!manualSymbols.has(symbol)) {
          dividendInfo[symbol] = {
            dividendRate: asNumber(data.dividendRate, 0),
            dividendYield: asNumber(data.dividendYield, 0),
            exDividendDate: data.exDividendDate ?? null,
            dividendDate: data.dividendDate ?? null
          };
        }
      }));
      // Basic pacing for Alpha Vantage
      if (i + batchSize < uniqueSymbols.length && API_KEY && !rateLimitHit) {
        await sleep(1200);
      }
    }
    // Persist only valid prices
    sanitizePriceCache();
    localStorage.setItem('marketPrices', JSON.stringify(marketPrices));
    localStorage.setItem('dividendInfo', JSON.stringify(dividendInfo));
    localStorage.setItem('lastPriceFetchTime', new Date().toISOString());
    lastPriceFetchTime = new Date();
    // Status line
    if (success) {
      apiKeyStatus && (apiKeyStatus.textContent = 'Prices and dividends updated successfully.');
    } else {
      let msg = rateLimitHit
        ? 'Alpha Vantage rate limit exceeded. Used Yahoo/cached prices.'
        : 'Some prices failed. Used previous or entry values.';
      if (invalidSymbols.length) msg = `Invalid symbols: ${invalidSymbols.join(', ')}. ${msg}`;
      $('#ticker-scroll') && ($('#ticker-scroll').textContent = msg);
      apiKeyStatus && (apiKeyStatus.textContent = msg);
    }
    return success;
  }
  function containsInvalidPrices(symbols) {
    for (const s of symbols) {
      const sym = String(s).toUpperCase();
      const val = marketPrices[sym];
      if (!isValidPrice(val)) return true;
    }
    return false;
  }
  function getEntryFor(symbol) {
    const t = trades.find(x => x.symbol === symbol);
    return asNumber(t?.entry, null);
  }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // ========= P/L =========
  function getPL(trade) {
    const entry = asNumber(trade.entry, 0);
    // Use exit if closed; else last valid market; fallback entry (never 0)
    const mkt = isValidPrice(marketPrices[trade.symbol]) ? marketPrices[trade.symbol] : entry;
    const price = asNumber(trade.exit ?? mkt, entry);
    const qty = asNumber(trade.qty, 0);
    const multiplier = trade.type === 'option' ? asNumber(trade.multiplier, 100) : 1;
    return (price - entry) * qty * multiplier;
  }
  function precomputePL() { trades.forEach(t => t.pl = getPL(t)); }
  // ========= Rendering =========
  function renderTrades(filtered = trades) {
    const tbody = $('#tradeRows');
    const tradeCount = $('#tradeCount');
    if (!tbody || !tradeCount) return;
    tbody.innerHTML = '';
    filtered.forEach((trade, index) => {
      const hasKey = Object.prototype.hasOwnProperty.call(marketPrices, trade.symbol);
      const valid = isValidPrice(marketPrices[trade.symbol]);
      const lastShown = valid ? marketPrices[trade.symbol] : asNumber(trade.exit ?? trade.entry, trade.entry);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${trade.symbol ?? ''}</td>
        <td>${asNumber(trade.qty, 0)}</td>
        <td>${fmtUSD(asNumber(trade.entry, 0))}</td>
        <td>${trade.entryDate ?? ''}</td>
        <td>${trade.exit == null ? '-' : fmtUSD(asNumber(trade.exit, 0))}</td>
        <td>${trade.exitDate ?? '-'}</td>
        <td>${trade.multiplier ?? (trade.type === 'option' ? 100 : 1)}</td>
        <td>${trade.type ?? 'stock'}</td>
        <td data-broker="${trade.broker ?? ''}">${trade.broker ?? ''}</td>
        <td class="current-price">${valid ? fmtUSD(lastShown) : '-'}</td>
        <td class="pl">${formatPL(trade.pl ?? getPL(trade))}</td>
        <td>${trade.notes ?? '-'}</td>
        <td>
          <button type="button" class="edit-btn">Edit</button>
          <button type="button" class="delete-btn">Delete</button>
        </td>
      `;
      row.querySelector('.edit-btn')?.addEventListener('click', () => enableEditMode(row, index));
      row.querySelector('.delete-btn')?.addEventListener('click', () => deleteTrade(index));
      tbody.appendChild(row);
    });
    tradeCount.textContent = `Total Trades: ${filtered.length}`;
  }
  function renderTicker() {
    const el = $('#ticker-scroll');
    if (!el) return;
    const keys = Object.keys(marketPrices).filter(sym => isValidPrice(marketPrices[sym]));
    if (keys.length === 0) {
      el.textContent = 'Market data unavailable';
      return;
    }
    el.textContent = keys.map(sym => `${sym}: ${fmtUSD(marketPrices[sym])}`).join(' | ');
  }
  function renderPL() {
    const tbody = $('#plRows');
    const combined = $('#combinedPL');
    if (!tbody || !combined) return;
    const brokers = {};
    trades.forEach(trade => {
      const pl = trade.pl ?? getPL(trade);
      const b = trade.broker || 'Unknown';
      if (!brokers[b]) brokers[b] = { realized: 0, unrealized: 0 };
      if (trade.exit != null) brokers[b].realized += pl; else brokers[b].unrealized += pl;
    });
    tbody.innerHTML = '';
    let totalR = 0, totalU = 0;
    Object.entries(brokers).forEach(([b, v]) => {
      totalR += v.realized; totalU += v.unrealized;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b}</td>
        <td>${formatPL(v.realized)}</td>
        <td>${formatPL(v.unrealized)}</td>
      `;
      tbody.appendChild(tr);
    });
    combined.innerHTML = formatPL(totalR + totalU);
  }
  function renderPortfolio() {
    const container = $('#portfolio-summary');
    if (!container) return;
    const open = trades.filter(t => t.exit == null);
    const symbols = {};
    let invested = 0, currentValue = 0;
    open.forEach(t => {
      const sym = t.symbol;
      const qty = asNumber(t.qty, 0);
      const entry = asNumber(t.entry, 0);
      const last = isValidPrice(marketPrices[sym]) ? marketPrices[sym] : entry;
      invested += entry * qty;
      currentValue += last * qty;
      if (!symbols[sym]) symbols[sym] = { qty: 0, value: 0 };
      symbols[sym].qty += qty;
      symbols[sym].value += last * qty;
    });
    const netPL = currentValue - invested;
    const holdings = Object.entries(symbols)
      .map(([sym, data]) => `<li>${sym}: ${asNumber(data.qty, 0)} shares (${fmtUSD(asNumber(data.value, 0))})</li>`)
      .join('');
    container.innerHTML = `
      <p><strong>Total Positions:</strong> ${trades.length}</p>
      <p><strong>Total Invested (Open):</strong> ${fmtUSD(invested)}</p>
      <p><strong>Current Value (Open):</strong> ${fmtUSD(currentValue)}</p>
      <p><strong>Unrealized P/L:</strong> ${formatPL(netPL)}</p>
      <h3>Holdings by Symbol (Open):</h3>
      <ul>${holdings || '<li>No open positions</li>'}</ul>
    `;
  }
  function renderEtfDividendSummary() {
    const tbody = $('#etfDividendRows');
    const totalGainEl = $('#totalEtfDividendGain');
    const averageYieldEl = $('#averageEtfDividendYield');
    const nextExDivEl = $('#nextExDivDate');
    const nextPayEl = $('#nextPayDate');
    if (!tbody || !totalGainEl || !averageYieldEl || !nextExDivEl || !nextPayEl) return;
    const etfTrades = trades.filter(t => t.type === 'etf' && t.exit == null);
    const grouped = {};
    etfTrades.forEach(t => {
      grouped[t.symbol] = grouped[t.symbol] || { qty: 0 };
      grouped[t.symbol].qty += asNumber(t.qty, 0);
    });
    let totalGain = 0, totalYield = 0, count = 0;
    let nextExDiv = null, nextPay = null;
    tbody.innerHTML = '';
    Object.entries(grouped).forEach(([sym, { qty }]) => {
      const info = dividendInfo[sym] || {};
      const rate = asNumber(info.dividendRate, 0);
      const yieldPct = asNumber(info.dividendYield, 0);
      const exDate = info.exDividendDate || '-';
      const payDate = info.dividendDate || '-';
      const gain = rate * qty;
      totalGain += gain;
      totalYield += yieldPct;
      count++;
      if (exDate !== '-' && (!nextExDiv || new Date(exDate) < new Date(nextExDiv))) nextExDiv = exDate;
      if (payDate !== '-' && (!nextPay || new Date(payDate) < new Date(nextPay))) nextPay = payDate;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${sym}</td>
        <td>${fmtUSD(rate)}</td>
        <td>${formatPL(gain)}</td>
        <td>${fmtPercent(yieldPct)}</td>
        <td>${exDate}</td>
        <td>${payDate}</td>
        <td>
          <button class="edit-btn">Edit</button>
          ${manualSymbols.has(sym) ? '<button class="delete-btn">Delete</button>' : ''}
        </td>
      `;
      tr.querySelector('.edit-btn').addEventListener('click', () => enableDivEditMode(tr, sym, qty, rate, yieldPct, exDate, payDate));
      tr.querySelector('.delete-btn')?.addEventListener('click', () => deleteDividend(sym));
      tbody.appendChild(tr);
    });
    totalGainEl.innerHTML = formatPL(totalGain);
    averageYieldEl.innerHTML = count ? fmtPercent(totalYield / count) : '0%';
    nextExDivEl.innerHTML = nextExDiv || 'N/A';
    nextPayEl.innerHTML = nextPay || 'N/A';
    // sort handlers
    $all('#etfDividendTable th.sortable').forEach(h => {
      h.addEventListener('click', () => {
        const sortKey = h.dataset.sort;
        const isAsc = h.classList.contains('sorted-asc');
        $all('#etfDividendTable th.sortable').forEach(x => x.classList.remove('sorted-asc', 'sorted-desc'));
        h.classList.add(isAsc ? 'sorted-desc' : 'sorted-asc');
        sortTable('#etfDividendTable', sortKey, !isAsc);
      });
    });
  }
  function enableDivEditMode(row, sym, qty, rate, yieldPct, exDate, payDate) {
    const cells = row.querySelectorAll('td');
    cells[1].innerHTML = `<input type="number" step="0.01" value="${rate}">`;
    cells[2].innerHTML = '-'; // gain will be recalculated
    cells[3].innerHTML = `<input type="number" step="0.01" value="${yieldPct}">`;
    cells[4].innerHTML = `<input type="date" value="${exDate === '-' ? '' : exDate}">`;
    cells[5].innerHTML = `<input type="date" value="${payDate === '-' ? '' : payDate}">`;
    const actions = cells[6];
    actions.innerHTML = `<button class="save-btn">Save</button><button class="cancel-btn">Cancel</button>`;
    actions.querySelector('.save-btn').addEventListener('click', () => saveDivEdit(row, sym, qty));
    actions.querySelector('.cancel-btn').addEventListener('click', () => renderEtfDividendSummary());
  }
  async function saveDivEdit(row, sym, qty) {
    const cells = row.querySelectorAll('td');
    const newRate = asNumber(cells[1].querySelector('input').value, 0);
    const newYield = asNumber(cells[3].querySelector('input').value, 0);
    const newExDate = cells[4].querySelector('input').value || null;
    const newPayDate = cells[5].querySelector('input').value || null;
    dividendInfo[sym] = {
      dividendRate: newRate,
      dividendYield: newYield,
      exDividendDate: newExDate,
      dividendDate: newPayDate
    };
    manualSymbols.add(sym);
    localStorage.setItem('dividendInfo', JSON.stringify(dividendInfo));
    localStorage.setItem('manualSymbols', JSON.stringify([...manualSymbols]));
    renderEtfDividendSummary();
  }
  async function deleteDividend(sym) {
    if (confirm(`Delete manual dividend data for ${sym} and revert to API-fetched data?`)) {
      delete dividendInfo[sym];
      manualSymbols.delete(sym);
      localStorage.setItem('dividendInfo', JSON.stringify(dividendInfo));
      localStorage.setItem('manualSymbols', JSON.stringify([...manualSymbols]));
      await fetchMarketPrices([sym], true);
      renderEtfDividendSummary();
    }
  }
  function sortTable(tableId, key, asc = true) {
    const table = document.querySelector(tableId);
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const col = getEtfColumnIndex(key);
      let aVal = a.querySelector(`td:nth-child(${col})`)?.textContent.trim() || '';
      let bVal = b.querySelector(`td:nth-child(${col})`)?.textContent.trim() || '';
      if (key === 'gain' || key === 'dividendRate') {
        aVal = parseFloat(aVal.replace('$', '')) || 0;
        bVal = parseFloat(bVal.replace('$', '')) || 0;
      } else if (key === 'dividendYield') {
        aVal = parseFloat(aVal.replace('%', '')) || 0;
        bVal = parseFloat(bVal.replace('%', '')) || 0;
      } else if (key === 'exDividendDate' || key === 'dividendDate') {
        aVal = aVal === '-' ? 0 : new Date(aVal).getTime();
        bVal = bVal === '-' ? 0 : new Date(bVal).getTime();
      }
      return asc ? aVal - bVal : bVal - aVal;
    });
    rows.forEach(r => tbody.appendChild(r));
  }
  function getEtfColumnIndex(key) {
    const map = { symbol: 1, dividendRate: 2, gain: 3, dividendYield: 4, exDividendDate: 5, dividendDate: 6 };
    return map[key];
  }
  // ========= Edit / Save / Delete =========
  function enableEditMode(row, index) {
    const t = trades[index];
    const cells = row.querySelectorAll('td');
    const fields = ['symbol', 'qty', 'entry', 'entryDate', 'exit', 'exitDate', 'multiplier', 'type', 'broker'];
    fields.forEach((field, i) => {
      const value = t[field] ?? (field === 'exit' || field === 'exitDate' ? '' :
                     field === 'multiplier' && t.type === 'option' ? 100 : '');
      if (field === 'type') {
        cells[i].innerHTML = `
          <select>
            <option value="stock" ${value === 'stock' ? 'selected' : ''}>Stock</option>
            <option value="option" ${value === 'option' ? 'selected' : ''}>Option</option>
            <option value="crypto" ${value === 'crypto' ? 'selected' : ''}>Crypto</option>
            <option value="etf" ${value === 'etf' ? 'selected' : ''}>ETF</option>
          </select>`;
      } else if (field === 'broker') {
        cells[i].innerHTML = `
          <select>
            <option value="Etrade" ${value === 'Etrade' ? 'selected' : ''}>Etrade</option>
            <option value="Schwab" ${value === 'Schwab' ? 'selected' : ''}>Schwab</option>
            <option value="Fidelity" ${value === 'Fidelity' ? 'selected' : ''}>Fidelity</option>
            <option value="Webull" ${value === 'Webull' ? 'selected' : ''}>Webull</option>
            <option value="Robinhood" ${value === 'Robinhood' ? 'selected' : ''}>Robinhood</option>
          </select>`;
      } else {
        const type = (field === 'entryDate' || field === 'exitDate') ? 'date'
                  : (field === 'qty' || field === 'multiplier' || field === 'entry' || field === 'exit') ? 'number'
                  : 'text';
        const extra = field === 'entry' || field === 'exit'
          ? 'step="0.01"'
          : field === 'symbol'
            ? 'pattern="[A-Z][A-Z0-9.\\-]{0,9}" title="Enter a valid symbol (A–Z, digits, dot, hyphen)"'
            : '';
        cells[i].innerHTML = `<input type="${type}" value="${value ?? ''}" ${extra}>`;
      }
    });
    // Notes
    cells[11].innerHTML = `<input type="text" value="${t.notes ?? ''}">`;
    const actions = cells[cells.length - 1];
    actions.innerHTML = `<button type="button" class="save-btn">Save</button><button type="button" class="cancel-btn">Cancel</button>`;
    actions.querySelector('.save-btn')?.addEventListener('click', () => saveEditedTrade(row, index));
    actions.querySelector('.cancel-btn')?.addEventListener('click', () => renderTrades(filterTrades()));
  }
  async function saveEditedTrade(row, index) {
    const cells = row.querySelectorAll('td');
    const symbol = String(cells[0].querySelector('input')?.value || '').toUpperCase();
    if (!isValidSymbol(symbol)) {
      alert(`Invalid symbol: ${symbol}. Use capital letters, digits, dot, or hyphen.`);
      return;
    }
    const updated = {
      symbol,
      qty: asNumber(cells[1].querySelector('input')?.value, 0),
      entry: asNumber(cells[2].querySelector('input')?.value, 0),
      entryDate: cells[3].querySelector('input')?.value || '',
      exit: cells[4].querySelector('input')?.value ? asNumber(cells[4].querySelector('input').value, null) : null,
      exitDate: cells[5].querySelector('input')?.value || null,
      multiplier: asNumber(cells[6].querySelector('input')?.value, 1),
      type: cells[7].querySelector('select')?.value || 'stock',
      broker: cells[8].querySelector('select')?.value || '',
      notes: cells[11].querySelector('input')?.value || '',
      tags: trades[index].tags || []
    };
    trades[index] = updated;
    localStorage.setItem('trades', JSON.stringify(trades));
    await fetchMarketPrices([updated.symbol], true);
    precomputePL();
    renderAll();
    restartPriceUpdates();
  }
  function deleteTrade(index) {
    if (!confirm('Are you sure you want to delete this trade?')) return;
    trades.splice(index, 1);
    localStorage.setItem('trades', JSON.stringify(trades));
    precomputePL();
    renderAll();
    restartPriceUpdates();
  }
  // ========= Filters / Exports / Imports =========
  function filterTrades() {
    const broker = $('#brokerFilter')?.value || 'all';
    const sym_search = ($('#symbolSearch')?.value || '').toUpperCase().trim();
    const tag = ($('#tagFilter')?.value || '').toLowerCase().trim();
    const start = $('#startDate')?.value || '';
    const end = $('#endDate')?.value || '';
    return trades.filter(t => {
      const matchesBroker = broker === 'all' || t.broker === broker;
      const matchesSym = !sym_search || t.symbol.toUpperCase().includes(sym_search);
      const matchesTag = !tag || t.tags?.some(x => x.toLowerCase().includes(tag));
      const matchesStart = !start || (t.entryDate >= start);
      const matchesEnd = !end || (t.entryDate <= end);
      return matchesBroker && matchesSym && matchesTag && matchesStart && matchesEnd;
    });
  }
  ['brokerFilter','symbolSearch','tagFilter','startDate','endDate'].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener('input', () => renderTrades(filterTrades()));
  });
  $('#exportCSV')?.addEventListener('click', () => {
    let csv = 'Symbol,Qty,Entry,Entry Date,Exit,Exit Date,Multiplier,Type,Broker,Notes,Tags\n';
    trades.forEach(t => {
      csv += [
        t.symbol ?? '',
        asNumber(t.qty, 0),
        asNumber(t.entry, 0),
        t.entryDate ?? '',
        t.exit == null ? '' : asNumber(t.exit, 0),
        t.exitDate ?? '',
        t.multiplier ?? (t.type === 'option' ? 100 : 1),
        t.type ?? 'stock',
        t.broker ?? '',
        t.notes ?? '',
        t.tags?.join(';') ?? ''
      ].join(',') + '\n';
    });
    downloadCSV(csv, 'trades.csv');
  });
  $('#exportFiltered')?.addEventListener('click', () => {
    const filtered = filterTrades();
    let csv = 'Symbol,Qty,Entry,Entry Date,Exit,Exit Date,Multiplier,Type,Broker,Notes,Tags\n';
    filtered.forEach(t => {
      csv += [
        t.symbol ?? '',
        asNumber(t.qty, 0),
        asNumber(t.entry, 0),
        t.entryDate ?? '',
        t.exit == null ? '' : asNumber(t.exit, 0),
        t.exitDate ?? '',
        t.multiplier ?? (t.type === 'option' ? 100 : 1),
        t.type ?? 'stock',
        t.broker ?? '',
        t.notes ?? '',
        t.tags?.join(';') ?? ''
      ].join(',') + '\n';
    });
    downloadCSV(csv, 'filtered_trades.csv');
  });
  $('#importCSV')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleCSVFile(file);
  });
  const dropZone = $('#dropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      const f = e.dataTransfer.files?.[0];
      if (f && f.type === 'text/csv') handleCSVFile(f);
    });
  }
  async function handleCSVFile(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const lines = text.split('\n').slice(1).filter(Boolean);
      const toAdd = lines.map(line => {
        const [symbol, qty, entry, entryDate, exit, exitDate, multiplier, type, broker, notes, tags] = line.split(',');
        const sym = String(symbol || '').toUpperCase();
        if (!isValidSymbol(sym)) return null;
        return {
          symbol: sym,
          qty: asNumber(qty, 0),
          entry: asNumber(entry, 0),
          entryDate: entryDate || '',
          exit: exit ? asNumber(exit, null) : null,
          exitDate: exitDate || null,
          multiplier: asNumber(multiplier, type === 'option' ? 100 : 1),
          type: type || 'stock',
          broker: broker || '',
          notes: notes || '',
          tags: tags ? tags.split(';').map(t => t.trim()) : []
        };
      }).filter(Boolean);
      trades.push(...toAdd);
      localStorage.setItem('trades', JSON.stringify(trades));
      await fetchMarketPrices(toAdd.map(t => t.symbol), true);
      precomputePL();
      renderAll();
      restartPriceUpdates();
    };
    reader.readAsText(file);
  }
  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // ========= Charts =========
  function destroyChartIfAny(canvas) {
    if (canvas?._chartInstance?.destroy) { canvas._chartInstance.destroy(); canvas._chartInstance = null; }
  }
  function renderCharts() {
    if (typeof Chart === 'undefined') return;
    const chartType = $('#chartType')?.value || 'line';
    // Equity
    const equityCanvas = $('#equityChart');
    if (equityCanvas) {
      destroyChartIfAny(equityCanvas);
      const sorted = [...trades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
      const dates = [...new Set(sorted.map(t => t.entryDate))];
      const equityData = dates.map(d => {
        const pts = sorted.filter(t => t.entryDate <= d);
        return pts.reduce((sum, t) => sum + (t.pl ?? getPL(t)), 0);
      });
      const chart = new Chart(equityCanvas, {
        type: chartType,
        data: { labels: dates, datasets: [{ label: 'Equity', data: equityData, borderColor: '#7DDA58', backgroundColor: chartType === 'bar' ? '#7DDA58' : 'transparent', borderWidth: 2, pointRadius: chartType === 'line' ? 2 : 0, fill: chartType === 'bar', tension: chartType === 'line' ? 0.25 : 0 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top' }, tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => ` ${fmtUSD(ctx.parsed.y)}` } } },
          interaction: { mode: 'nearest', intersect: false },
          scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => fmtUSD(v) } } }
        }
      });
      equityCanvas._chartInstance = chart;
    }
    // Symbol pie
    const symbolCanvas = $('#symbolChart');
    if (symbolCanvas) {
      destroyChartIfAny(symbolCanvas);
      const agg = {};
      trades.forEach(t => {
        const v = t.pl ?? getPL(t);
        agg[t.symbol] = (agg[t.symbol] || 0) + v;
      });
      const chart = new Chart(symbolCanvas, {
        type: 'pie',
        data: { labels: Object.keys(agg), datasets: [{ data: Object.values(agg), backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900'] }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1.5, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } } } }
      });
      symbolCanvas._chartInstance = chart;
    }
    // Broker pie
    const brokerCanvas = $('#brokerChart');
    if (brokerCanvas) {
      destroyChartIfAny(brokerCanvas);
      const agg = {};
      trades.forEach(t => {
        const v = t.pl ?? getPL(t);
        const b = t.broker || 'Unknown';
        agg[b] = (agg[b] || 0) + v;
      });
      const chart = new Chart(brokerCanvas, {
        type: 'pie',
        data: { labels: Object.keys(agg), datasets: [{ data: Object.values(agg), backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900', '#DFC57B'] }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1.5, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } } } }
      });
      brokerCanvas._chartInstance = chart;
    }
    // Dividend Yield Distribution
    const dividendYieldCanvas = $('#dividendYieldChart');
    if (dividendYieldCanvas) {
      destroyChartIfAny(dividendYieldCanvas);
      const etfTrades = trades.filter(t => t.type === 'etf' && t.exit == null);
      const grouped = {};
      etfTrades.forEach(t => {
        grouped[t.symbol] = grouped[t.symbol] || { qty: 0 };
        grouped[t.symbol].qty += asNumber(t.qty, 0);
      });
      const labels = [];
      const data = [];
      Object.entries(grouped).forEach(([sym, { qty }]) => {
        const info = dividendInfo[sym] || {};
        const yieldPct = asNumber(info.dividendYield, 0) * 100;
        labels.push(sym);
        data.push(yieldPct);
      });
      const chart = new Chart(dividendYieldCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Dividend Yield (%)',
            data: data,
            backgroundColor: '#5DE2E7'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) { return value + '%'; }
              }
            }
          }
        }
      });
      dividendYieldCanvas._chartInstance = chart;
    }
  }
  $('#chartType')?.addEventListener('change', () => renderCharts());
  // ========= Risk Analytics =========
  function renderRiskAnalytics() {
    const maxDrawdownEl = $('#maxDrawdown');
    const sharpeRatioEl = $('#sharpeRatio');
    const winRateEl = $('#winRate');
    if (!maxDrawdownEl || !sharpeRatioEl || !winRateEl) return;
    const closed = trades.filter(t => t.exit != null);
    const wins = closed.filter(t => (t.pl ?? getPL(t)) > 0).length;
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    winRateEl.textContent = `${winRate.toFixed(2)}%`;
    const pls = closed.map(t => t.pl ?? getPL(t));
    const mean = pls.length ? pls.reduce((a, b) => a + b, 0) / pls.length : 0;
    const std = pls.length > 1 ? Math.sqrt(pls.reduce((s, p) => s + (p - mean) ** 2, 0) / (pls.length - 1)) : 0;
    const sharpe = std > 0 ? mean / std : 0;
    sharpeRatioEl.textContent = sharpe.toFixed(2);
    const sorted = [...trades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
    const dates = [...new Set(sorted.map(t => t.entryDate))];
    const equity = dates.map(d => {
      const pts = sorted.filter(t => t.entryDate <= d);
      return pts.reduce((sum, t) => sum + (t.pl ?? getPL(t)), 0);
    });
    let peak = -Infinity, maxDD = 0;
    equity.forEach(eq => { if (eq > peak) peak = eq; const dd = peak ? (peak - eq) / peak * 100 : 0; if (dd > maxDD) maxDD = dd; });
    maxDrawdownEl.textContent = `-${maxDD.toFixed(2)}%`;
  }
  // ========= Form handling =========
  const tradeForm = $('#tradeForm');
  if (tradeForm) {
    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const symbol = String(tradeForm.symbol?.value || '').toUpperCase().trim();
      if (!isValidSymbol(symbol)) return alert(`Invalid symbol: ${symbol}`);
      const newTrade = {
        symbol,
        qty: asNumber(tradeForm.qty?.value, 0),
        entry: asNumber(tradeForm.entry?.value, 0),
        entryDate: tradeForm.date?.value || '',
        exit: tradeForm.exit?.value ? asNumber(tradeForm.exit.value, null) : null,
        exitDate: tradeForm.exitDate?.value || null,
        multiplier: tradeForm.multiplier?.value ? asNumber(tradeForm.multiplier.value, 1) : (tradeForm.type?.value === 'option' ? 100 : 1),
        type: tradeForm.type?.value || 'stock',
        broker: tradeForm.broker?.value || '',
        notes: tradeForm.notes?.value || '',
        tags: tradeForm.tags?.value ? tradeForm.tags.value.split(',').map(t => t.trim()) : []
      };
      const idx = tradeForm.dataset.editIndex;
      if (idx !== undefined && idx !== null) { trades[Number(idx)] = newTrade; delete tradeForm.dataset.editIndex; }
      else trades.push(newTrade);
      localStorage.setItem('trades', JSON.stringify(trades));
      tradeForm.reset();
      await fetchMarketPrices([newTrade.symbol], true);
      precomputePL();
      renderAll();
      restartPriceUpdates();
    });
  }
  // ========= Manual Dividend Form =========
  const manualDividendForm = $('#manualDividendForm');
  if (manualDividendForm) {
    manualDividendForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const symbol = String($('#divSymbol')?.value || '').toUpperCase().trim();
      if (!isValidSymbol(symbol)) {
        alert(`Invalid symbol: ${symbol}. Use capital letters, digits, dot, or hyphen.`);
        return;
      }
      const rate = asNumber($('#divRate')?.value, 0);
      const yieldPct = asNumber($('#divYield')?.value, 0);
      const exDate = $('#exDivDate')?.value || null;
      const payDate = $('#divPayDate')?.value || null;
      dividendInfo[symbol] = {
        dividendRate: rate,
        dividendYield: yieldPct,
        exDividendDate: exDate,
        dividendDate: payDate
      };
      manualSymbols.add(symbol);
      localStorage.setItem('dividendInfo', JSON.stringify(dividendInfo));
      localStorage.setItem('manualSymbols', JSON.stringify([...manualSymbols]));
      renderEtfDividendSummary();
      renderCharts();
      manualDividendForm.reset();
    });
  }
  // ========= Reset Prices =========
  $('#resetPrices')?.addEventListener('click', async () => {
    localStorage.removeItem('marketPrices');
    localStorage.removeItem('dividendInfo');
    localStorage.removeItem('lastPriceFetchTime');
    marketPrices = {};
    dividendInfo = {};
    lastPriceFetchTime = null;
    await fetchMarketPrices(trades.map(t => t.symbol), true);
    precomputePL();
    renderAll();
    restartPriceUpdates();
  });
  // ========= Service worker (optional) =========
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
    } catch (err) {
      console.warn('SW registration issue:', err);
    }
  }
  // ========= Initialize / updates =========
  async function renderAll() {
    precomputePL();
    renderTrades();
    renderCharts();
    renderTicker();
    renderPL();
    renderPortfolio();
    renderEtfDividendSummary();
    renderRiskAnalytics();
  }
  async function init() {
    // If we had invalid cached prices, force a refresh so we don’t display $0.00
    const symbols = trades.map(t => t.symbol);
    const force = hadInvalidCache || containsInvalidPrices(symbols);
    await fetchMarketPrices(symbols, force);
    precomputePL();
    renderAll();
  }
  function startPriceUpdates() {
    if (priceUpdateInterval) clearInterval(priceUpdateInterval);
    priceUpdateInterval = setInterval(async () => {
      if (trades.length && !rateLimitHit) {
        const ok = await fetchMarketPrices(trades.map(t => t.symbol));
        if (ok) { precomputePL(); renderAll(); }
        else if (rateLimitHit) { clearInterval(priceUpdateInterval); priceUpdateInterval = null; }
      }
    }, 75000);
  }
  function restartPriceUpdates() { startPriceUpdates(); }
  await init();
  startPriceUpdates();
  // ========= Navigation =========
  $all('.sidebar li').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      $all('.sidebar li').forEach(li => li.classList.remove('active'));
      item.classList.add('active');
      $all('main section').forEach(sec => {
        sec.style.display = sec.classList.contains('switchable') ? 'none' : 'block';
        sec.classList.remove('active-section');
      });
      if (targetId) {
        const target = $(`#${targetId}`);
        if (target) {
          target.style.display = 'block';
          target.classList.add('active-section');
        }
      }
    });
  });
  // ========= Greeks =========
  $('#greeksForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const S = parseFloat($('#spotPrice').value);
    const K = parseFloat($('#strikePrice').value);
    const T = parseFloat($('#timeToExpiration').value);
    const r = parseFloat($('#riskFreeRate').value);
    const sigma = parseFloat($('#volatility').value);
    const optionType = $('#optionType').value;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const normcdf = (x) => {
      let t = 1 / (1 + 0.2316419 * Math.abs(x));
      let d = 0.3989 * Math.exp(-x * x / 2);
      let prob = d * t * (0.3194 + t * (-0.3566 + t * (1.7815 + t * (-1.8213 + t * 1.3303))));
      if (x > 0) prob = 1 - prob;
      return prob;
    };
    let delta, gamma, theta, vega, rho;
    if (optionType === 'call') {
      delta = normcdf(d1);
      theta = - (S * sigma * Math.exp(-0.5 * d1 * d1) / (Math.sqrt(2 * Math.PI) * Math.sqrt(T))) - r * K * Math.exp(-r * T) * normcdf(d2);
      rho = K * T * Math.exp(-r * T) * normcdf(d2);
    } else {
      delta = normcdf(d1) - 1;
      theta = - (S * sigma * Math.exp(-0.5 * d1 * d1) / (Math.sqrt(2 * Math.PI) * Math.sqrt(T))) + r * K * Math.exp(-r * T) * (1 - normcdf(d2));
      rho = - K * T * Math.exp(-r * T) * (1 - normcdf(d2));
    }
    gamma = Math.exp(-0.5 * d1 * d1) / (S * sigma * Math.sqrt(2 * Math.PI * T));
    vega = S * Math.sqrt(T) * Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    const result = `
      Delta: ${delta.toFixed(4)}<br>
      Gamma: ${gamma.toFixed(4)}<br>
      Theta: ${theta.toFixed(4)}<br>
      Vega: ${vega.toFixed(4)}<br>
      Rho: ${rho.toFixed(4)}
    `;
    $('#greeksResult').innerHTML = result;
  });
  // Refresh Prices
  $('#refreshPrices')?.addEventListener('click', async () => {
    await fetchMarketPrices(trades.map(t => t.symbol), true);
    precomputePL();
    renderAll();
    restartPriceUpdates();
  });
});



































