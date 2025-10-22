'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  // ========= Load API Key and Cached Prices from localStorage =========
  let API_KEY = localStorage.getItem('apiKey') || '';
  let marketPrices = JSON.parse(localStorage.getItem('marketPrices') || '{}');
  let lastPriceFetchTime = localStorage.getItem('lastPriceFetchTime') ? new Date(localStorage.getItem('lastPriceFetchTime')) : null;
  let priceUpdateInterval = null;
  let rateLimitHit = false;
  const CORS_PROXY = 'https://api.allorigins.win/raw?url='; // Reliable CORS proxy

  // ========= Symbol Validation =========
  const isValidSymbol = (symbol) => /^[A-Z]{1,5}$/.test(symbol);

  // ========= 🌙 Theme Toggle =========
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }
  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
  }

  // ========= 🧱 Compact Mode Toggle =========
  const compactToggle = document.getElementById('compactToggle');
  if (compactToggle) {
    compactToggle.addEventListener('change', () => {
      document.body.classList.toggle('compact', compactToggle.checked);
      localStorage.setItem('compact', compactToggle.checked ? 'true' : 'false');
    });
    if (localStorage.getItem('compact') === 'true') {
      compactToggle.checked = true;
      document.body.classList.add('compact');
    }
  }

  // ========= API Key Input Handler =========
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  if (apiKeyInput && saveApiKeyBtn && apiKeyStatus) {
    apiKeyInput.value = API_KEY;
    saveApiKeyBtn.addEventListener('click', async () => {
      API_KEY = apiKeyInput.value.trim();
      localStorage.setItem('apiKey', API_KEY);
      rateLimitHit = false;
      console.log(`[${new Date().toISOString()}] API key saved: ${API_KEY ? 'Set' : 'Empty'}`);
      apiKeyStatus.textContent = API_KEY ? 'API key saved. Fetching prices...' : 'No API key provided (using Yahoo Finance).';
      await fetchMarketPrices(trades.map(t => t.symbol));
      precomputePL();
      renderAll();
      restartPriceUpdates();
    });
  }

  // ========= 📊 Trade Data =========
  let trades = localStorage.getItem('trades') ? JSON.parse(localStorage.getItem('trades')) : [
    { symbol: 'AAPL', qty: 10, entry: 150, entryDate: '2025-10-12', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Etrade', tags: ['swing'] },
    { symbol: 'GOOG', qty: 5, entry: 2800, entryDate: '2025-10-11', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Schwab', tags: ['long'] },
    { symbol: 'MSFT', qty: 12, entry: 300, entryDate: '2025-10-10', exit: 310, exitDate: '2025-10-15', multiplier: 1, type: 'stock', broker: 'Fidelity', tags: ['day'] },
    { symbol: 'TSLA', qty: 10, entry: 1000, entryDate: '2025-10-14', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Robinhood', tags: ['swing'] },
    { symbol: 'BABA', qty: 5, entry: 100, entryDate: '2025-10-13', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Schwab', tags: ['long'] }
  ];

  // ========= Fetch Yahoo Finance Price =========
  async function fetchYahooPrice(symbol) {
    if (!isValidSymbol(symbol)) {
      console.warn(`[${new Date().toISOString()}] Invalid symbol: ${symbol}`);
      return null;
    }
    try {
      const response = await fetch(`${CORS_PROXY}https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${symbol}`);
      }
      const data = await response.json();
      if (data.chart.error) {
        throw new Error(data.chart.error.description || 'Yahoo API error');
      }
      const price = data.chart.result[0].meta.regularMarketPrice;
      console.log(`[${new Date().toISOString()}] Yahoo fetched price for ${symbol}: ${price}`);
      return asNumber(price, 0);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Yahoo error for ${symbol}:`, error.message);
      return null;
    }
  }

  // ========= Fetch Alpha Vantage Price =========
  async function fetchAlphaVantagePrice(symbol) {
    if (!API_KEY) return null;
    if (!isValidSymbol(symbol)) {
      console.warn(`[${new Date().toISOString()}] Invalid symbol: ${symbol}`);
      return null;
    }
    try {
      const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${symbol}`);
      }
      const data = await response.json();
      if (data['Information'] && data['Information'].includes('call frequency')) {
        throw new Error('Rate limit exceeded');
      }
      if (data['Information']) {
        throw new Error('Invalid API key');
      }
      const quote = data['Global Quote'];
      if (quote && quote['05. price']) {
        const price = asNumber(quote['05. price'], 0);
        console.log(`[${new Date().toISOString()}] Alpha Vantage fetched price for ${symbol}: ${price}`);
        return price;
      }
      console.warn(`[${new Date().toISOString()}] No price data for ${symbol}:`, data);
      return null;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Alpha Vantage error for ${symbol}:`, error.message);
      if (error.message.includes('Rate limit')) {
        rateLimitHit = true;
      }
      return null;
    }
  }

  // ========= Fetch Real-Time Prices =========
  async function fetchMarketPrices(symbols) {
    // Check cached prices (valid for 5 minutes)
    const now = new Date();
    if (lastPriceFetchTime && (now - lastPriceFetchTime) < 5 * 60 * 1000 && Object.keys(marketPrices).length > 0) {
      console.log(`[${new Date().toISOString()}] Using cached prices from ${lastPriceFetchTime.toISOString()}`);
      document.getElementById('ticker-scroll').textContent = 'Using cached market data';
      if (apiKeyStatus) apiKeyStatus.textContent = 'Using cached prices (recent).';
      return true;
    }

    const uniqueSymbols = [...new Set(symbols)];
    let success = true;
    let invalidSymbols = [];
    const batchSize = 5; // Batch for Alpha Vantage rate limits
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      const promises = batch.map(async (symbol) => {
        if (!isValidSymbol(symbol)) {
          invalidSymbols.push(symbol);
          marketPrices[symbol] = marketPrices[symbol] || trades.find(t => t.symbol === symbol)?.entry || 0;
          success = false;
          return;
        }
        // Try Yahoo Finance first
        let price = await fetchYahooPrice(symbol);
        if (price === null) {
          // Fallback to Alpha Vantage
          price = await fetchAlphaVantagePrice(symbol);
        }
        if (price === null) {
          console.warn(`[${new Date().toISOString()}] No price data for ${symbol} from Yahoo or Alpha Vantage`);
          price = marketPrices[symbol] || trades.find(t => t.symbol === symbol)?.entry || 0;
          success = false;
        }
        marketPrices[symbol] = price;
      });
      try {
        await Promise.all(promises);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in fetchMarketPrices batch:`, error.message);
        success = false;
      }
      // Delay for Alpha Vantage rate limits
      if (i + batchSize < uniqueSymbols.length && API_KEY && !rateLimitHit) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    if (success) {
      localStorage.setItem('marketPrices', JSON.stringify(marketPrices));
      localStorage.setItem('lastPriceFetchTime', new Date().toISOString());
      if (apiKeyStatus) apiKeyStatus.textContent = 'Prices updated successfully.';
    } else {
      let message = rateLimitHit
        ? 'Alpha Vantage rate limit exceeded. Using Yahoo or cached prices.'
        : 'Failed to fetch some prices. Using cached or entry prices.';
      if (invalidSymbols.length > 0) {
        message = `Invalid symbols: ${invalidSymbols.join(', ')}. ${message}`;
      }
      document.getElementById('ticker-scroll').textContent = message;
      if (apiKeyStatus) apiKeyStatus.textContent = message;
    }
    return success;
  }

  // ========= Real-Time Price Updates =========
  function startPriceUpdates() {
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval);
    }
    priceUpdateInterval = setInterval(async () => {
      if (trades.length > 0) {
        try {
          const success = await fetchMarketPrices(trades.map(t => t.symbol));
          if (success) {
            precomputePL();
            renderAll();
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Price update error:`, error.message);
          document.getElementById('ticker-scroll').textContent = 'Price update failed. Retrying...';
          if (apiKeyStatus) apiKeyStatus.textContent = 'Price update failed. Retrying...';
        }
      }
    }, 75000); // Update every 75 seconds
  }

  function restartPriceUpdates() {
    rateLimitHit = false; // Reset rate limit flag to allow retries
    startPriceUpdates();
  }

  // ========= 💰 Helpers =========
  const asNumber = (val, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };
  const fmtUSD = (val) => {
    const n = asNumber(val);
    return `$${n.toFixed(2)}`;
  };
  const formatPL = (value) => {
    const n = asNumber(value);
    const color = n >= 0 ? 'green' : 'red';
    return `<span class="${color}">${fmtUSD(n)}</span>`;
  };
  const getPL = (trade) => {
    const entry = asNumber(trade.entry, 0);
    const mkt = marketPrices[trade.symbol] || entry;
    const price = asNumber(trade.exit ?? mkt, entry);
    const qty = asNumber(trade.qty, 0);
    const multiplier = trade.type === 'option' ? asNumber(trade.multiplier, 100) : 1;
    return (price - entry) * qty * multiplier;
  };

  // ========= Precompute P/L =========
  function precomputePL() {
    trades.forEach(trade => {
      trade.pl = getPL(trade);
    });
  }

  // ========= 📋 Render Trades =========
  function renderTrades(filteredTrades = trades) {
    const tbody = document.getElementById('tradeRows');
    const tradeCount = document.getElementById('tradeCount');
    if (!tbody || !tradeCount) return;
    tbody.innerHTML = '';
    filteredTrades.forEach((trade, index) => {
      const row = document.createElement('tr');
      const currentPrice = marketPrices[trade.symbol] ? fmtUSD(marketPrices[trade.symbol]) : '-';
      const pl = trade.pl || getPL(trade);
      const plHtml = formatPL(pl);
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
        <td class="current-price">${currentPrice}</td>
        <td class="pl">${plHtml}</td>
        <td>
          <button type="button" class="edit-btn">Edit</button>
          <button type="button" class="delete-btn">Delete</button>
        </td>
      `;
      const editBtn = row.querySelector('.edit-btn');
      const deleteBtn = row.querySelector('.delete-btn');
      editBtn.addEventListener('click', () => enableEditMode(row, index));
      deleteBtn.addEventListener('click', () => deleteTrade(index));
      tbody.appendChild(row);
    });
    tradeCount.textContent = `Total Trades: ${filteredTrades.length}`;
  }

  // ========= ✏️ Enable Edit Mode for Row =========
  function enableEditMode(row, index) {
    const trade = trades[index];
    const cells = row.querySelectorAll('td');
    const fields = ['symbol', 'qty', 'entry', 'entryDate', 'exit', 'exitDate', 'multiplier', 'type', 'broker'];
    fields.forEach((field, i) => {
      const value = trade[field] ?? (field === 'exit' || field === 'exitDate' ? '' : field === 'multiplier' && trade.type === 'option' ? 100 : '');
      cells[i].innerHTML = `<input type="${field === 'entryDate' || field === 'exitDate' ? 'date' : field === 'qty' || field === 'multiplier' || field === 'entry' || field === 'exit' ? 'number' : 'text'}" value="${value}" ${field === 'entry' || field === 'exit' ? 'step="0.01"' : field === 'symbol' ? 'pattern="[A-Z]{1,5}" title="Enter a valid stock symbol (1-5 uppercase letters)"' : ''}>`;
      if (field === 'type') {
        cells[i].innerHTML = `
          <select>
            <option value="stock" ${value === 'stock' ? 'selected' : ''}>Stock</option>
            <option value="option" ${value === 'option' ? 'selected' : ''}>Option</option>
            <option value="crypto" ${value === 'crypto' ? 'selected' : ''}>Crypto</option>
          </select>
        `;
      }
      if (field === 'broker') {
        cells[i].innerHTML = `
          <select>
            <option value="Etrade" ${value === 'Etrade' ? 'selected' : ''}>Etrade</option>
            <option value="Schwab" ${value === 'Schwab' ? 'selected' : ''}>Schwab</option>
            <option value="Fidelity" ${value === 'Fidelity' ? 'selected' : ''}>Fidelity</option>
            <option value="Webull" ${value === 'Webull' ? 'selected' : ''}>Webull</option>
            <option value="Robinhood" ${value === 'Robinhood' ? 'selected' : ''}>Robinhood</option>
          </select>
        `;
      }
    });
    const actionsCell = cells[cells.length - 1];
    actionsCell.innerHTML = `
      <button type="button" class="save-btn">Save</button>
      <button type="button" class="cancel-btn">Cancel</button>
    `;
    const saveBtn = actionsCell.querySelector('.save-btn');
    const cancelBtn = actionsCell.querySelector('.cancel-btn');
    saveBtn.addEventListener('click', () => saveEditedTrade(row, index));
    cancelBtn.addEventListener('click', () => renderTrades(filterTrades()));
  }

  // ========= 💾 Save Edited Trade =========
  async function saveEditedTrade(row, index) {
    const cells = row.querySelectorAll('td');
    const symbol = String(cells[0].querySelector('input')?.value || '');
    if (!isValidSymbol(symbol)) {
      alert(`Invalid symbol: ${symbol}. Use 1-5 uppercase letters (e.g., AAPL).`);
      return;
    }
    const updatedTrade = {
      symbol,
      qty: asNumber(cells[1].querySelector('input')?.value, 0),
      entry: asNumber(cells[2].querySelector('input')?.value, 0),
      entryDate: cells[3].querySelector('input')?.value || '',
      exit: cells[4].querySelector('input')?.value ? asNumber(cells[4].querySelector('input').value, null) : null,
      exitDate: cells[5].querySelector('input')?.value || null,
      multiplier: asNumber(cells[6].querySelector('input')?.value, 1),
      type: cells[7].querySelector('select')?.value || 'stock',
      broker: cells[8].querySelector('select')?.value || '',
      tags: trades[index].tags || []
    };
    trades[index] = updatedTrade;
    localStorage.setItem('trades', JSON.stringify(trades));
    await fetchMarketPrices([updatedTrade.symbol]);
    precomputePL();
    renderAll();
    restartPriceUpdates();
  }

  // ========= 🗑️ Delete Trade =========
  function deleteTrade(index) {
    if (confirm('Are you sure you want to delete this trade?')) {
      trades.splice(index, 1);
      localStorage.setItem('trades', JSON.stringify(trades));
      precomputePL();
      renderAll();
      restartPriceUpdates();
    }
  }

  // ========= 📈 Render Charts =========
  function destroyChartIfAny(canvas) {
    if (canvas?._chartInstance?.destroy) {
      canvas._chartInstance.destroy();
      canvas._chartInstance = null;
    }
  }
  function renderCharts() {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded');
      return;
    }
    const chartTypeSelect = document.getElementById('chartType');
    const chartType = chartTypeSelect?.value || 'line';

    // Equity chart
    const equityCanvas = document.getElementById('equityChart');
    if (equityCanvas) {
      destroyChartIfAny(equityCanvas);
      const sortedTrades = [...trades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
      const dates = [...new Set(sortedTrades.map(t => t.entryDate))];
      const equityData = dates.map(date => {
        const dailyTrades = sortedTrades.filter(t => t.entryDate <= date);
        return dailyTrades.reduce((sum, t) => sum + (t.pl || getPL(t)), 0);
      });
      const chart = new Chart(equityCanvas, {
        type: chartType,
        data: {
          labels: dates,
          datasets: [{
            label: 'Equity',
            data: equityData,
            borderColor: '#7DDA58',
            backgroundColor: chartType === 'bar' ? '#7DDA58' : 'transparent',
            borderWidth: 2,
            pointRadius: chartType === 'line' ? 2 : 0,
            fill: chartType === 'bar',
            tension: chartType === 'line' ? 0.25 : 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: { label: (ctx) => ` ${fmtUSD(ctx.parsed.y)}` }
            }
          },
          interaction: { mode: 'nearest', intersect: false },
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: (v) => fmtUSD(v) } }
          }
        }
      });
      equityCanvas._chartInstance = chart;
    }

    // Symbol pie
    const symbolCanvas = document.getElementById('symbolChart');
    if (symbolCanvas) {
      destroyChartIfAny(symbolCanvas);
      const symbols = {};
      trades.forEach(t => {
        const value = t.pl || getPL(t);
        symbols[t.symbol] = (symbols[t.symbol] || 0) + value;
      });
      const chart = new Chart(symbolCanvas, {
        type: 'pie',
        data: {
          labels: Object.keys(symbols),
          datasets: [{
            data: Object.values(symbols),
            backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.5,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
          }
        }
      });
      symbolCanvas._chartInstance = chart;
    }

    // Broker pie
    const brokerCanvas = document.getElementById('brokerChart');
    if (brokerCanvas) {
      destroyChartIfAny(brokerCanvas);
      const brokers = {};
      trades.forEach(t => {
        const value = t.pl || getPL(t);
        const broker = t.broker || 'Unknown';
        brokers[broker] = (brokers[broker] || 0) + value;
      });
      const chart = new Chart(brokerCanvas, {
        type: 'pie',
        data: {
          labels: Object.keys(brokers),
          datasets: [{
            data: Object.values(brokers),
            backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900', '#DFC57B']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.5,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
          }
        }
      });
      brokerCanvas._chartInstance = chart;
    }
  }

  // ========= 📰 Render Ticker =========
  function renderTicker() {
    const el = document.getElementById('ticker-scroll');
    if (!el) return;
    if (Object.keys(marketPrices).length === 0) {
      el.textContent = 'Market data unavailable';
      return;
    }
    const parts = Object.entries(marketPrices).map(([sym, price]) => `${sym}: ${fmtUSD(price)}`);
    el.textContent = parts.join(' | ');
  }

  // ========= 📊 Render P/L by Broker =========
  function renderPL() {
    const tbody = document.getElementById('plRows');
    const combined = document.getElementById('combinedPL');
    if (!tbody || !combined) return;
    const brokers = {};
    trades.forEach(trade => {
      const pl = trade.pl || asNumber(getPL(trade), 0);
      const broker = trade.broker || 'Unknown';
      if (!brokers[broker]) brokers[broker] = { realized: 0, unrealized: 0 };
      if (trade.exit != null) {
        brokers[broker].realized += pl;
      } else {
        brokers[broker].unrealized += pl;
      }
    });
    tbody.innerHTML = '';
    let totalRealized = 0;
    let totalUnrealized = 0;
    Object.keys(brokers).forEach(broker => {
      const realized = asNumber(brokers[broker].realized, 0);
      const unrealized = asNumber(brokers[broker].unrealized, 0);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${broker}</td>
        <td>${formatPL(realized)}</td>
        <td>${formatPL(unrealized)}</td>
      `;
      tbody.appendChild(row);
      totalRealized += realized;
      totalUnrealized += unrealized;
    });
    combined.innerHTML = formatPL(totalRealized + totalUnrealized);
  }

  // ========= 🧮 Render Portfolio Summary =========
  function renderPortfolio() {
    const container = document.getElementById('portfolio-summary');
    if (!container) return;
    const symbols = {};
    let invested = 0;
    let currentValue = 0;
    // Only include open trades (exit is null) for holdings
    const openTrades = trades.filter(trade => trade.exit == null);
    openTrades.forEach(trade => {
      const sym = trade.symbol ?? '';
      const qty = asNumber(trade.qty, 0);
      const entry = asNumber(trade.entry, 0);
      const last = asNumber(marketPrices[sym], entry);
      const value = last * qty;
      invested += entry * qty;
      currentValue += value;
      if (!symbols[sym]) symbols[sym] = { qty: 0, value: 0 };
      symbols[sym].qty += qty;
      symbols[sym].value += value;
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

  // ========= 📝 Form Submission Handler =========
  const tradeForm = document.getElementById('tradeForm');
  if (tradeForm) {
    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!tradeForm.symbol || !tradeForm.qty || !tradeForm.entry || !tradeForm.date) return;
      const symbol = String(tradeForm.symbol.value.trim());
      if (!isValidSymbol(symbol)) {
        alert(`Invalid symbol: ${symbol}. Use 1-5 uppercase letters (e.g., AAPL).`);
        return;
      }
      const newTrade = {
        symbol,
        qty: asNumber(tradeForm.qty.value, 0),
        entry: asNumber(tradeForm.entry.value, 0),
        entryDate: tradeForm.date.value || '',
        exit: tradeForm.exit.value ? asNumber(tradeForm.exit.value, null) : null,
        exitDate: tradeForm.exitDate.value || null,
        multiplier: tradeForm.multiplier.value ? asNumber(tradeForm.multiplier.value, 1) : (tradeForm.type.value === 'option' ? 100 : 1),
        type: tradeForm.type.value || 'stock',
        broker: tradeForm.broker.value || '',
        tags: tradeForm.tags.value ? tradeForm.tags.value.split(',').map(t => t.trim()) : []
      };
      const idx = tradeForm.dataset.editIndex;
      if (idx !== undefined && idx !== null) {
        trades[Number(idx)] = newTrade;
        delete tradeForm.dataset.editIndex;
      } else {
        trades.push(newTrade);
      }
      tradeForm.reset();
      localStorage.setItem('trades', JSON.stringify(trades));
      await fetchMarketPrices([newTrade.symbol]);
      precomputePL();
      renderAll();
      restartPriceUpdates();
    });
  }

  // ========= 📤 Export Trades to CSV =========
  const exportBtn = document.getElementById('exportCSV');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      let csv = 'Symbol,Qty,Entry,Entry Date,Exit,Exit Date,Multiplier,Type,Broker,Tags\n';
      trades.forEach(trade => {
        csv += [
          trade.symbol ?? '',
          asNumber(trade.qty, 0),
          asNumber(trade.entry, 0),
          trade.entryDate ?? '',
          trade.exit == null ? '' : asNumber(trade.exit, 0),
          trade.exitDate ?? '',
          trade.multiplier ?? (trade.type === 'option' ? 100 : 1),
          trade.type ?? 'stock',
          trade.broker ?? '',
          trade.tags?.join(';') ?? ''
        ].join(',') + '\n';
      });
      downloadCSV(csv, 'trades.csv');
    });
  }

  // ========= 📤 Export Filtered Trades =========
  const exportFilteredBtn = document.getElementById('exportFiltered');
  if (exportFilteredBtn) {
    exportFilteredBtn.addEventListener('click', () => {
      const filtered = filterTrades();
      let csv = 'Symbol,Qty,Entry,Entry Date,Exit,Exit Date,Multiplier,Type,Broker,Tags\n';
      filtered.forEach(trade => {
        csv += [
          trade.symbol ?? '',
          asNumber(trade.qty, 0),
          asNumber(trade.entry, 0),
          trade.entryDate ?? '',
          trade.exit == null ? '' : asNumber(trade.exit, 0),
          trade.exitDate ?? '',
          trade.multiplier ?? (trade.type === 'option' ? 100 : 1),
          trade.type ?? 'stock',
          trade.broker ?? '',
          trade.tags?.join(';') ?? ''
        ].join(',') + '\n';
      });
      downloadCSV(csv, 'filtered_trades.csv');
    });
  }

  // ========= 📥 Import CSV =========
  const importCSV = document.getElementById('importCSV');
  if (importCSV) {
    importCSV.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleCSVFile(file);
    });
  }
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'text/csv') handleCSVFile(file);
    });
  }
  async function handleCSVFile(file) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').slice(1).filter(line => line.trim());
      const newTrades = lines.map(line => {
        const [symbol, qty, entry, entryDate, exit, exitDate, multiplier, type, broker, tags] = line.split(',');
        if (!isValidSymbol(symbol)) {
          console.warn(`[${new Date().toISOString()}] Invalid symbol in CSV: ${symbol}`);
          return null;
        }
        return {
          symbol: String(symbol || ''),
          qty: asNumber(qty, 0),
          entry: asNumber(entry, 0),
          entryDate: entryDate || '',
          exit: exit ? asNumber(exit, null) : null,
          exitDate: exitDate || null,
          multiplier: asNumber(multiplier, type === 'option' ? 100 : 1),
          type: type || 'stock',
          broker: broker || '',
          tags: tags ? tags.split(';').map(t => t.trim()) : []
        };
      }).filter(trade => trade !== null);
      trades.push(...newTrades);
      localStorage.setItem('trades', JSON.stringify(trades));
      await fetchMarketPrices(newTrades.map(t => t.symbol));
      precomputePL();
      renderAll();
      restartPriceUpdates();
    };
    reader.readAsText(file);
  }

  // ========= 🔍 Filter Trades =========
  function filterTrades() {
    const brokerFilter = document.getElementById('brokerFilter')?.value || 'all';
    const symbolSearch = document.getElementById('symbolSearch')?.value.toUpperCase().trim() || '';
    const tagFilter = document.getElementById('tagFilter')?.value.toLowerCase().trim() || '';
    const startDate = document.getElementById('startDate')?.value || '';
    const endDate = document.getElementById('endDate')?.value || '';
    return trades.filter(trade => {
      const matchesBroker = brokerFilter === 'all' || trade.broker === brokerFilter;
      const matchesSymbol = !symbolSearch || trade.symbol.toUpperCase().includes(symbolSearch);
      const matchesTag = !tagFilter || trade.tags?.some(t => t.toLowerCase().includes(tagFilter));
      const matchesStart = !startDate || trade.entryDate >= startDate;
      const matchesEnd = !endDate || trade.entryDate <= endDate;
      return matchesBroker && matchesSymbol && matchesTag && matchesStart && matchesEnd;
    });
  }
  const filterInputs = ['brokerFilter', 'symbolSearch', 'tagFilter', 'startDate', 'endDate'];
  filterInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => renderTrades(filterTrades()));
    }
  });

  // ========= 📈 Chart Type Toggle =========
  const chartTypeSelect = document.getElementById('chartType');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', () => renderCharts());
  }

  // ========= 🧭 Sidebar Navigation =========
  document.querySelectorAll('.sidebar li').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('main section').forEach(sec => {
        sec.style.display = sec.classList.contains('switchable') ? 'none' : 'block';
        sec.classList.remove('active-section');
      });
      if (targetId) {
        const target = document.getElementById(targetId);
        if (target) {
          target.style.display = 'block';
          target.classList.add('active-section');
        }
      }
    });
  });

  // ========= 🛠️ Utility: Download CSV =========
  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ========= 🚀 Initialize Dashboard =========
  async function renderAll() {
    const symbols = trades.map(t => t.symbol);
    await fetchMarketPrices(symbols);
    precomputePL();
    renderTrades();
    renderCharts();
    renderTicker();
    renderPL();
    renderPortfolio();
  }

  // Initialize and start price updates
  try {
    await renderAll();
    startPriceUpdates();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Initialization error:`, error.message);
    document.getElementById('ticker-scroll').textContent = 'Initialization failed. Please refresh.';
    if (apiKeyStatus) apiKeyStatus.textContent = 'Initialization failed. Please refresh.';
  }

  // ========= 🌐 Service Worker Registration =========
  if ('serviceWorker' in navigator) {
    // Unregister old Service Workers to prevent conflicts
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister().then(() => console.log('Old Service Worker unregistered'));
      }
    }).catch(err => console.error('Error unregistering old Service Workers:', err));

    // Register new Service Worker
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('Service Worker registered');
        // Force update if a new version is waiting
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(err => console.error('Service Worker registration failed:', err));

    // Listen for Service Worker updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('Service Worker controller changed, reloading...');
      window.location.reload();
    });
  }
});















