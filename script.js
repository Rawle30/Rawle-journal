/* script.js — Trading Dashboard Module
   - Fixes syntax error in form handler (duplicate/stray "exitDate: form")
   - Adds null-guards for missing DOM elements
   - Normalizes currency formatting and number parsing
   - Keeps global edit handler via window.editTrade
*/

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // ========= 🌙 Theme Toggle =========
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }

  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const mode = document.body.classList.contains('dark') ? 'dark' : 'light';
      localStorage.setItem('theme', mode);
    });
  }

  // ========= 📊 Trade Data =========
  const trades = [
    { symbol: 'AAPL', qty: 10, entry: 150, entryDate: '2025-10-12', broker: 'Etrade', type: 'stock' },
    { symbol: 'GOOG', qty: 5, entry: 2800, entryDate: '2025-10-11', broker: 'Schwab', type: 'stock' },
    { symbol: 'MSFT', qty: 12, entry: 300, entryDate: '2025-10-10', broker: 'Fidelity', type: 'stock' },
    { symbol: 'TSLA', qty: 10, entry: 1000, entryDate: '2025-10-14', broker: 'Robinhood', type: 'stock' }
  ];

  const marketPrices = {
    AAPL: 144.95,
    GOOG: 2900,
    MSFT: 310,
    TSLA: 950
  };

  // ========= 💰 Helpers =========
  const fmtUSD = (n) => {
    const v = Number(n);
    return isFinite(v) ? `$${v.toFixed(2)}` : '$0.00';
  };

  function formatPL(value) {
    const v = Number(value) || 0;
    const color = v >= 0 ? 'green' : 'red';
    return `<span class="${color}">${fmtUSD(v)}</span>`;
  }

  function getPL(trade) {
    const last = (trade.exit ?? marketPrices[trade.symbol] ?? trade.entry);
    const multiplier = trade.type === 'option' ? (trade.multiplier || 100) : 1;
    return (Number(last) - Number(trade.entry)) * Number(trade.qty) * Number(multiplier);
  }

  const asNumber = (val, fallback = null) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  // ========= 📋 Render Trades =========
  function renderTrades() {
    const tbody = document.getElementById('tradeRows');
    if (!tbody) return;

    tbody.innerHTML = '';
    trades.forEach((trade, index) => {
      const row = document.createElement('tr');
      const exitCell =
        trade.exit == null ? '-' : fmtUSD(asNumber(trade.exit, 0));

      row.innerHTML = `
        <td>${trade.symbol}</td>
        <td>${trade.qty}</td>
        <td>${fmtUSD(trade.entry)}</td>
        <td>${trade.entryDate}</td>
        <td>${exitCell}</td>
        <td><button type="button" class="btn btn-sm btn-outline-primary" data-index="${index}">Edit</button></td>
      `;
      // prefer addEventListener over inline onclick for robustness
      const btn = row.querySelector('button');
      if (btn) {
        btn.addEventListener('click', () => window.editTrade(index));
      }

      tbody.appendChild(row);
    });
  }

  // ========= 📈 Render Charts =========
  function renderCharts() {
    // Equity chart
    const equityCanvas = document.getElementById('equityChart');
    if (equityCanvas && typeof Chart !== 'undefined') {
      // Destroy existing chart if re-rendering
      if (equityCanvas._chartInstance) {
        equityCanvas._chartInstance.destroy();
      }
      const equityChart = new Chart(equityCanvas, {
        type: 'line',
        data: {
          labels: ['Oct 1', 'Oct 5', 'Oct 10', 'Oct 15', 'Oct 20', 'Oct 24'],
          datasets: [{
            label: 'Equity',
            data: [60000, 64000, 67000, 72000, 76000, 78000],
            borderColor: '#7DDA58',
            borderWidth: 2,
            pointRadius: 2,
            fill: false,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: { mode: 'index', intersect: false }
          },
          interaction: { mode: 'nearest', intersect: false },
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: (v) => `$${v}` } }
          }
        }
      });
      equityCanvas._chartInstance = equityChart;
    }

    // Symbol allocation pie
    const symbolCanvas = document.getElementById('symbolChart');
    if (symbolCanvas && typeof Chart !== 'undefined') {
      if (symbolCanvas._chartInstance) {
        symbolCanvas._chartInstance.destroy();
      }
      const symbolChart = new Chart(symbolCanvas, {
        type: 'pie',
        data: {
          labels: ['AAPL', 'GOOG', 'MSFT', 'TSLA'],
          datasets: [{
            data: [1500, 4500, 9600, 3000],
            backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.5,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
      symbolCanvas._chartInstance = symbolChart;
    }
  }

  // ========= 📰 Render Ticker =========
  function renderTicker() {
    const ticker = document.getElementById('ticker-scroll');
    if (!ticker) return;
    const parts = [
      `AAPL: ${fmtUSD(marketPrices.AAPL)}`,
      `GOOG: ${fmtUSD(marketPrices.GOOG)}`,
      `MSFT: ${fmtUSD(marketPrices.MSFT)}`,
      `TSLA: ${fmtUSD(marketPrices.TSLA)}`
    ];
    ticker.textContent = parts.join(' | ');
  }

  // ========= 📊 Render P/L by Broker =========
  function renderPL() {
    const tbody = document.getElementById('plRows');
    const combinedPL = document.getElementById('combinedPL');
    if (!tbody || !combinedPL) return;

    const brokers = {};
    trades.forEach(trade => {
      const pl = getPL(trade);
      const broker = trade.broker || 'Unknown';
      if (!brokers[broker]) {
        brokers[broker] = { realized: 0, unrealized: 0 };
      }
      if (trade.exit != null && trade.exit !== '') {
        brokers[broker].realized += pl;
      } else {
        brokers[broker].unrealized += pl;
      }
    });

    tbody.innerHTML = '';
    let totalRealized = 0;
    let totalUnrealized = 0;

    Object.keys(brokers).forEach(broker => {
      const realizedRaw = brokers[broker].realized;
      const unrealizedRaw = brokers[broker].unrealized;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${broker}</td>
        <td>${formatPL(realizedRaw)}</td>
        <td>${formatPL(unrealizedRaw)}</td>
      `;
      tbody.appendChild(row);

      totalRealized += realizedRaw;
      totalUnrealized += unrealizedRaw;
    });

    combinedPL.innerHTML = formatPL(totalRealized + totalUnrealized);
  }

  // ========= 🧮 Render Portfolio Summary =========
  function renderPortfolio() {
    const container = document.getElementById('portfolio');
    if (!container) return;

    const summary = document.createElement('div');

    const symbols = {};
    let invested = 0;
    let currentValue = 0;

    trades.forEach(trade => {
      const symbol = trade.symbol;
      const qty = Number(trade.qty) || 0;
      const entry = Number(trade.entry) || 0;
      const price = asNumber(marketPrices[symbol], entry);
      const value = price * qty;

      invested += entry * qty;
      currentValue += value;

      if (!symbols[symbol]) {
        symbols[symbol] = { qty: 0, value: 0 };
      }
      symbols[symbol].qty += qty;
      symbols[symbol].value += value;
    });

    const netPL = currentValue - invested;

    const holdingsList = Object.entries(symbols)
      .map(([sym, data]) => {
        // Using plain value display, and PL formatting for net figure only
        return `<li>${sym}: ${data.qty} shares (${fmtUSD(data.value)})</li>`;
      })
      .join('');

    summary.innerHTML = `
      <p><strong>Total Positions:</strong> ${trades.length}</p>
      <p><strong>Total Invested:</strong> ${fmtUSD(invested)}</p>
      <p><strong>Current Value:</strong> ${fmtUSD(currentValue)}</p>
      <p><strong>Unrealized P/L:</strong> ${formatPL(netPL)}</p>
      <h3>Holdings by Symbol:</h3>
      <ul>${holdingsList}</ul>
    `;

    container.innerHTML = '';
    container.appendChild(summary);
  }

  // ========= ✏️ Edit Trade Handler =========
  window.editTrade = function(index) {
    const trade = trades[index];
    const form = document.getElementById('tradeForm');
    if (!form || !trade) return;

    if (form.symbol) form.symbol.value = trade.symbol ?? '';
    if (form.qty) form.qty.value = trade.qty ?? '';
    if (form.entry) form.entry.value = trade.entry ?? '';
    if (form.date) form.date.value = trade.entryDate ?? '';
    if (form.exit) form.exit.value = trade.exit ?? '';
    if (form.exitDate) form.exitDate.value = trade.exitDate ?? '';
    if (form.multiplier) form.multiplier.value = trade.multiplier ?? (trade.type === 'option' ? 100 : 1);
    if (form.type) form.type.value = trade.type ?? 'stock';
    if (form.broker) form.broker.value = trade.broker ?? '';

    form.dataset.editIndex = String(index);
    if (form.scrollIntoView) {
      form.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // ========= 📝 Form Submission Handler =========
  const tradeForm = document.getElementById('tradeForm');
  if (tradeForm) {
    tradeForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const form = e.target;

      const newTrade = {
        symbol: (form.symbol?.value || '').trim(),
        qty: asNumber(form.qty?.value, 0),
        entry: asNumber(form.entry?.value, 0),
        entryDate: form.date?.value || '',
        exit: form.exit?.value ? asNumber(form.exit.value, null) : null,
        exitDate: form.exitDate?.value || null,
        multiplier: form.multiplier?.value ? parseInt(form.multiplier.value, 10) : (form.type?.value === 'option' ? 100 : 1),
        type: form.type?.value || 'stock',
        broker: form.broker?.value || ''
      };

      const editIndex = form.dataset.editIndex;
      if (editIndex !== undefined && editIndex !== null) {
        trades[Number(editIndex)] = newTrade;
        delete form.dataset.editIndex;
      } else {
        trades.push(newTrade);
      }

      if (form.reset) form.reset();
      renderTrades();
      renderPL();
      renderCharts();
      renderPortfolio();
    });
  }

  // ========= 🧭 Sidebar Navigation =========
  document.querySelectorAll('.sidebar li').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;

      document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('main section').forEach(sec => {
        sec.style.display = 'none';
      });

      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.style.display = 'block';
      }
    });
  });

  // ========= 📤 Export Trades to CSV =========
  const exportBtn = document.getElementById('exportCSV');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      let csv = 'Symbol,Qty,Entry,Date,Exit\n';
      trades.forEach(trade => {
        csv += [
          trade.symbol,
          trade.qty,
          trade.entry,
          trade.entryDate,
          (trade.exit ?? '')
        ].join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'trades.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  // ========= 🚀 Initialize Dashboard =========
  renderTrades();
  renderCharts();
  renderTicker();
  renderPL();
  renderPortfolio();
});





