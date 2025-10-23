'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  // ========= Load API Key and Cached Prices from localStorage =========
  let API_KEY = localStorage.getItem('apiKey') || 'FTDRTP0955507PPC';
  let FINNHUB_TOKEN = 'd3f79jpr01qolknc02sgd3f79jpr01qolknc02t0';
  let marketPrices = JSON.parse(localStorage.getItem('marketPrices') || '{}');
  let dividendInfo = JSON.parse(localStorage.getItem('dividendInfo') || '{}');
  let lastPriceFetchTime = localStorage.getItem('lastPriceFetchTime') ? new Date(localStorage.getItem('lastPriceFetchTime')) : null;
  let priceUpdateInterval = null;
  let rateLimitHit = false;
  const CORS_PROXY = 'https://proxy.corsfix.com/?'; // Updated reliable CORS proxy

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

  // ========= Manual Price Refresh Button =========
  const refreshBtn = document.getElementById('refreshPrices');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      localStorage.removeItem('lastPriceFetchTime'); // Force fresh fetch
      const symbols = trades.map(t => t.symbol);
      const success = await fetchMarketPrices(symbols);
      precomputePL();
      renderAll();
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Prices';
      if (apiKeyStatus) {
        apiKeyStatus.textContent = success ? 'Prices refreshed successfully.' : 'Some prices failed to refresh.';
      }
    });
  }

  // ========= 📊 Trade Data =========
  let trades = localStorage.getItem('trades') ? JSON.parse(localStorage.getItem('trades')) : [
    { symbol: 'AAPL', qty: 10, entry: 150, entryDate: '2025-10-12', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Etrade', tags: ['swing'], notes: '' },
    { symbol: 'GOOG', qty: 5, entry: 2800, entryDate: '2025-10-11', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Schwab', tags: ['long'], notes: '' },
    { symbol: 'MSFT', qty: 12, entry: 300, entryDate: '2025-10-10', exit: 310, exitDate: '2025-10-15', multiplier: 1, type: 'stock', broker: 'Fidelity', tags: ['day'], notes: '' },
    { symbol: 'TSLA', qty: 10, entry: 1000, entryDate: '2025-10-14', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Robinhood', tags: ['swing'], notes: '' },
    { symbol: 'BABA', qty: 5, entry: 100, entryDate: '2025-10-13', exit: null, exitDate: null, multiplier: 1, type: 'stock', broker: 'Schwab', tags: ['long'], notes: '' }
  ];

  // ========= Fetch Finnhub Data =========
  async function fetchFinnhubData(symbol) {
    try {
      const token = FINNHUB_TOKEN;
      const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`;
      const quoteResponse = await fetch(quoteUrl);
      if (!quoteResponse.ok) throw new Error(`Finnhub quote HTTP ${quoteResponse.status}`);
      const quoteData = await quoteResponse.json();
      const price = quoteData.c || 0;

      const from = new Date();
      from.setFullYear(from.getFullYear() - 1);
      const fromStr = from.toISOString().split('T')[0];
      const toStr = new Date().toISOString().split('T')[0];
      const dividendUrl = `https://finnhub.io/api/v1/stock/dividend2?symbol=${symbol}&from=${fromStr}&to=${toStr}&token=${token}`;
      const dividendResponse = await fetch(dividendUrl);
      if (!dividendResponse.ok) throw new Error(`Finnhub dividend HTTP ${dividendResponse.status}`);
      const dividendData = await dividendResponse.json();
      let dividendRate = 0;
      dividendData.data.forEach(d => dividendRate += d.amount);
      const dividendYield = price > 0 ? dividendRate / price : 0;
      const lastDiv = dividendData.data[0] || {};
      const exDividendDate = lastDiv.exDate || null;
      const dividendDate = lastDiv.payDate || null;

      console.log(`[${new Date().toISOString()}] Finnhub fetched data for ${symbol}: price ${price}, dividendRate ${dividendRate}, dividendYield ${dividendYield}, exDividendDate ${exDividendDate}, dividendDate ${dividendDate}`);
      return { price, dividendRate, dividendYield, exDividendDate, dividendDate };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Finnhub error for ${symbol}:`, error.message);
      return null;
    }
  }

  // ========= Fetch Alpha Vantage Data =========
  async function fetchAlphaVantageData(symbol) {
    if (!API_KEY) return null;
    if (!isValidSymbol(symbol)) {
      console.warn(`[${new Date().toISOString()}] Invalid symbol: ${symbol}`);
      return null;
    }
    try {
      const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEY}`;
      const overviewResponse = await fetch(overviewUrl);
      if (!overviewResponse.ok) throw new Error(`Alpha Overview HTTP ${overviewResponse.status}`);
      const overviewData = await overviewResponse.json();
      const dividendYield = asNumber(overviewData.DividendYield, 0);
      const dividendPerShare = asNumber(overviewData.DividendPerShare, 0);
      const exDividendDate = overviewData.ExDividendDate || null;
      const dividendDate = overviewData.DividendDate || null;

      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
      const quoteResponse = await fetch(quoteUrl);
      if (!quoteResponse.ok) throw new Error(`Alpha Quote HTTP ${quoteResponse.status}`);
      const quoteData = await quoteResponse.json();
      const price = asNumber(quoteData['Global Quote']['05. price'], 0);

      console.log(`[${new Date().toISOString()}] Alpha Vantage fetched data for ${symbol}: price ${price}, dividendRate ${dividendPerShare}, dividendYield ${dividendYield}, exDividendDate ${exDividendDate}, dividendDate ${dividendDate}`);
      return { price, dividendRate: dividendPerShare, dividendYield, exDividendDate, dividendDate };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Alpha Vantage error for ${symbol}:`, error.message);
      if (error.message.includes('Rate limit')) rateLimitHit = true;
      return null;
    }
  }

  // ========= Fetch Yahoo Finance Data (Scrape as fallback) =========
  async function fetchYahooData(symbol) {
    if (!isValidSymbol(symbol)) {
      console.warn(`[${new Date().toISOString()}] Invalid symbol: ${symbol}`);
      return null;
    }
    try {
      const quoteUrl = `${CORS_PROXY}https://finance.yahoo.com/quote/${symbol}`;
      const quoteResponse = await fetch(quoteUrl);
      if (!quoteResponse.ok) throw new Error(`HTTP ${quoteResponse.status} for quote page of ${symbol}`);
      const quoteText = await quoteResponse.text();
      const parser = new DOMParser();
      const quoteDoc = parser.parseFromString(quoteText, 'text/html');
      const priceEl = quoteDoc.querySelector('fin-streamer[data-field="regularMarketPrice"]');
      const price = priceEl ? asNumber(priceEl.textContent.trim(), 0) : 0;

      const statsUrl = `${CORS_PROXY}https://finance.yahoo.com/quote/${symbol}/key-statistics`;
      const statsResponse = await fetch(statsUrl);
      if (!statsResponse.ok) throw new Error(`HTTP ${statsResponse.status} for key-statistics page of ${symbol}`);
      const statsText = await statsResponse.text();
      const statsDoc = parser.parseFromString(statsText, 'text/html');
      const tds = statsDoc.querySelectorAll('td');

      let trailingDividendRate = 0;
      let trailingDividendYield = 0;
      let exDividendDate = null;
      let dividendDate = null;

      for (let i = 0; i < tds.length - 1; i++) {
        let label = tds[i].textContent.trim();
        let value = tds[i + 1].textContent.trim();

        if (label.includes('Trailing Annual Dividend Rate')) {
          trailingDividendRate = asNumber(value, 0);
        } else if (label.includes('Trailing Annual Dividend Yield')) {
          trailingDividendYield = asNumber(value.replace('%', ''), 0) / 100;
        } else if (label.includes('Ex-Dividend Date')) {
          exDividendDate = value || null;
        } else if (label.includes('Dividend Date')) {
          dividendDate = value || null;
        }
      }

      console.log(`[${new Date().toISOString()}] Yahoo scraped data for ${symbol}: price ${price}, dividendRate ${trailingDividendRate}, dividendYield ${trailingDividendYield}, exDividendDate ${exDividendDate}, dividendDate ${dividendDate}`);
      return {
        price,
        dividendRate: trailingDividendRate,
        dividendYield: trailingDividendYield,
        exDividendDate,
        dividendDate
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Yahoo scrape error for ${symbol}:`, error.message);
      return null;
    }
  }

  // ========= Fetch Real-Time Prices and Dividend Info =========
  async function fetchMarketPrices(symbols, force = false) {
    // Optional force refresh ignores cache
    const now = new Date();
    if (!force && lastPriceFetchTime && (now - lastPriceFetchTime) < 5 * 60 * 1000 && Object.keys(marketPrices).length > 0) {
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
        // Try Finnhub first
        let data = await fetchFinnhubData(symbol);
        // If failed, try Alpha Vantage
        if (data === null) {
          data = await fetchAlphaVantageData(symbol);
        }
        // If still failed, try Yahoo scrape
        if (data === null) {
          data = await fetchYahooData(symbol);
        }
        if (data === null) {
          console.warn(`[${new Date().toISOString()}] No data for ${symbol} from Finnhub, Alpha Vantage, or Yahoo`);
          marketPrices[symbol] = marketPrices[symbol] || trades.find(t => t.symbol === symbol)?.entry || 0;
          success = false;
        } else {
          marketPrices[symbol] = data.price;
          dividendInfo[symbol] = {
            dividendRate: data.dividendRate,
            dividendYield: data.dividendYield,
            exDividendDate: data.exDividendDate,
            dividendDate: data.dividendDate
          };
        }
      });
      await Promise.all(promises);
      // Delay for Alpha Vantage rate limits if needed
      if (i + batchSize < uniqueSymbols.length && API_KEY && !rateLimitHit) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    if (success) {
      localStorage.setItem('marketPrices', JSON.stringify(marketPrices));
      localStorage.setItem('dividendInfo', JSON.stringify(dividendInfo));
      localStorage.setItem('lastPriceFetchTime', new Date().toISOString());
      if (apiKeyStatus) apiKeyStatus.textContent = 'Prices and dividends updated successfully.';
    } else {
      let message = rateLimitHit
        ? 'Alpha Vantage rate limit exceeded. Using Yahoo or cached prices.'
        : 'Failed to fetch some prices/dividends. Using cached or entry prices.';
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
      if (trades.length > 0 && !rateLimitHit) {
        const success = await fetchMarketPrices(trades.map(t => t.symbol));
        if (success) {
          precomputePL();
          renderAll();
        } else if (rateLimitHit) {
          clearInterval(priceUpdateInterval);
          priceUpdateInterval = null;
        }
      }
    }, 75000); // Update every 75 seconds
  }

  function restartPriceUpdates() {
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
  const fmtPercent = (val) => {
    const n = asNumber(val);
    return `${(n * 100).toFixed(2)}%`;
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
        <td>${trade.notes ?? '-'}</td>
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
            <option value="etf" ${value === 'etf' ? 'selected' : ''}>ETF</option>
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
    // Notes (index 11)
    cells[11].innerHTML = `<input type="text" value="${trade.notes ?? ''}">`;
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
      notes: cells[11].querySelector('input')?.value || '',
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

  // ========= Render ETF Dividend Summary =========
  function renderEtfDividendSummary() {
    const tbody = document.getElementById('etfDividendRows');
    const totalGainEl = document.getElementById('totalEtfDividendGain');
    const averageYieldEl = document.getElementById('averageEtfDividendYield');
    const nextExDivEl = document.getElementById('nextExDivDate');
    const nextPayEl = document.getElementById('nextPayDate');
    if (!tbody || !totalGainEl || !averageYieldEl || !nextExDivEl || !nextPayEl) return;
    tbody.innerHTML = '';
    let totalGain = 0;
    let totalYield = 0;
    let count = 0;
    let nextExDiv = null;
    let nextPay = null;
    const etfTrades = trades.filter(trade => trade.type === 'etf' && trade.exit == null);
    etfTrades.forEach(trade => {
      const sym = trade.symbol;
      const qty = asNumber(trade.qty, 0);
      const dividendRate = dividendInfo[sym]?.dividendRate || 0;
      const dividendYield = dividendInfo[sym]?.dividendYield || 0;
      const exDividendDate = dividendInfo[sym]?.exDividendDate || '-';
      const dividendDate = dividendInfo[sym]?.dividendDate || '-';
      const gain = dividendRate * qty;
      totalGain += gain;
      totalYield += dividendYield;
      count++;
      if (exDividendDate !== '-' && (!nextExDiv || new Date(exDividendDate) < new Date(nextExDiv))) {
        nextExDiv = exDividendDate;
      }
      if (dividendDate !== '-' && (!nextPay || new Date(dividendDate) < new Date(nextPay))) {
        nextPay = dividendDate;
      }
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${sym}</td>
        <td>${fmtUSD(dividendRate)}</td>
        <td>${dividendDate}</td>
        <td>${formatPL(gain)}</td>
        <td>${fmtPercent(dividendYield)}</td>
        <td>${qty}</td>
        <td>${exDividendDate}</td>
      `;
      tbody.appendChild(row);
    });
    totalGainEl.innerHTML = formatPL(totalGain);
    averageYieldEl.innerHTML = count > 0 ? fmtPercent(totalYield / count) : '0%';
    nextExDivEl.innerHTML = nextExDiv || 'N/A';
    nextPayEl.innerHTML = nextPay || 'N/A';

    // Add sorting functionality
    const headers = document.querySelectorAll('#etfDividendTable th.sortable');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const sortKey = header.dataset.sort;
        const isAsc = header.classList.contains('sorted-asc');
        headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
        header.classList.add(isAsc ? 'sorted-desc' : 'sorted-asc');
        sortTable('#etfDividendTable', sortKey, !isAsc);
      });
    });
  }

  // ========= Sort Table Function =========
  function sortTable(tableId, key, asc = true) {
    const table = document.querySelector(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      let aVal = a.querySelector(`td:nth-child(${getEtfColumnIndex(key)}`)?.textContent.trim() || '';
      let bVal = b.querySelector(`td:nth-child(${getEtfColumnIndex(key)}`)?.textContent.trim() || '';
      if (key === 'gain' || key === 'dividendRate') {
        aVal = parseFloat(aVal.replace('$', '')) || 0;
        bVal = parseFloat(bVal.replace('$', '')) || 0;
      } else if (key === 'dividendYield') {
        aVal = parseFloat(aVal.replace('%', '')) || 0;
        bVal = parseFloat(bVal.replace('%', '')) || 0;
      } else if (key === 'exDividendDate' || key === 'dividendDate') {
        aVal = aVal === '-' ? 0 : new Date(aVal).getTime();
        bVal = bVal === '-' ? 0 : new Date(bVal).getTime();
      } else if (key === 'qty') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }
      return asc ? aVal - bVal : bVal - aVal;
    });
    rows.forEach(row => tbody.appendChild(row));
  }

  // ========= Get Column Index for Sorting (ETF Table) =========
  function getEtfColumnIndex(key) {
    const headers = {
      symbol: 1,
      dividendRate: 2,
      dividendDate: 3,
      gain: 4,
      dividendYield: 5,
      qty: 6,
      exDividendDate: 7
    };
    return headers[key];
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
        notes: tradeForm.notes.value || '',
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
      let csv = 'Symbol,Qty,Entry,Entry Date,Exit,Exit Date,Multiplier,Type,Broker,Notes,Tags\n';
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
          trade.notes ?? '',
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
      let csv = 'Symbol,Qty,Entry,Entry Date,Exit,Exit Date,Multiplier,Type,Broker,Notes,Tags\n';
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
          trade.notes ?? '',
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
        const [symbol, qty, entry, entryDate, exit, exitDate, multiplier, type, broker, notes, tags] = line.split(',');
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
          notes: notes || '',
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
    renderEtfDividendSummary();
    renderRiskAnalytics();
  }

  // Initialize and start price updates
  await renderAll();
  startPriceUpdates();

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

  // ========= Greeks Calculator =========
  const greeksForm = document.getElementById('greeksForm');
  if (greeksForm) {
    greeksForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const S = parseFloat(document.getElementById('spotPrice').value);
      const K = parseFloat(document.getElementById('strikePrice').value);
      const T = parseFloat(document.getElementById('timeToExpiration').value);
      const r = parseFloat(document.getElementById('riskFreeRate').value);
      const sigma = parseFloat(document.getElementById('volatility').value);
      const optionType = document.getElementById('optionType').value;

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
      document.getElementById('greeksResult').innerHTML = result;
    });
  }

  // ========= Render Risk Analytics =========
  function renderRiskAnalytics() {
    const maxDrawdownEl = document.getElementById('maxDrawdown');
    const sharpeRatioEl = document.getElementById('sharpeRatio');
    const winRateEl = document.getElementById('winRate');
    if (!maxDrawdownEl || !sharpeRatioEl || !winRateEl) return;

    // Win Rate
    const closedTrades = trades.filter(trade => trade.exit != null);
    const wins = closedTrades.filter(trade => trade.pl > 0).length;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
    winRateEl.textContent = `${winRate.toFixed(2)}%`;

    // Sharpe Ratio (simplified, assume risk free 0, annualize if needed)
    const pls = closedTrades.map(t => t.pl);
    const meanPL = pls.length > 0 ? pls.reduce((sum, p) => sum + p, 0) / pls.length : 0;
    const stdPL = pls.length > 1 ? Math.sqrt(pls.reduce((sum, p) => sum + (p - meanPL) ** 2, 0) / (pls.length - 1)) : 0;
    const sharpe = stdPL > 0 ? meanPL / stdPL : 0;
    sharpeRatioEl.textContent = sharpe.toFixed(2);

    // Max Drawdown from equity curve
    const sortedTrades = [...trades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
    const dates = [...new Set(sortedTrades.map(t => t.entryDate))];
    const equity = dates.map(date => {
      const dailyTrades = sortedTrades.filter(t => t.entryDate <= date);
      return dailyTrades.reduce((sum, t) => sum + (t.pl || getPL(t)), 0);
    });
    let peak = -Infinity;
    let maxDD = 0;
    equity.forEach(eq => {
      if (eq > peak) peak = eq;
      const dd = (peak - eq) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    });
    maxDrawdownEl.textContent = `-${maxDD.toFixed(2)}%`;
  }
});





























