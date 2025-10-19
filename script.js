/* script.js — Hardened Trading Dashboard Module
   - Guards all .toFixed() via Number() + Number.isFinite()
   - Defensive DOM queries, safe event wiring
   - Idempotent Chart.js renders (destroy before recreate)
   - Robust parsing in getPL, portfolio/tables, and ticker
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

  // ========= 📊 Trade Data (sample) =========
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
  const asNumber = (val, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const fmtUSD = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
  };

  function formatPL(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return `<span class="gray">$0.00</span>`;
    const color = n >= 0 ? 'green' : 'red';
    return `<span class="${color}">${fmtUSD(n)}</span>`;
  }

  function getPL(trade) {
    const entry = asNumber(trade.entry, 0);
    const mkt = marketPrices?.[trade.symbol];
    const price = asNumber(trade.exit ?? mkt ?? entry, entry);
    const qty = asNumber(trade.qty, 0);
    const multiplier = trade.type === 'option' ? asNumber(trade.multiplier, 100) : 1;
    return (price - entry) * qty * multiplier;
  }

  // ========= 📋 Render Trades =========
  function renderTrades() {
    const tbody = document.getElementById('tradeRows');
    if (!tbody) return;

    tbody.innerHTML = '';
    trades.forEach((trade, index) => {
      const row = document.createElement('tr');
      const exitCell = trade.exit == null ? '-' : fmtUSD(asNumber(trade.exit, 0));

      row.innerHTML = `
        <td>${trade.symbol ?? ''}</td>
        <td>${asNumber(trade.qty, 0)}</td>
        <td>${fmtUSD(asNumber(trade.entry, 0))}</td>
        <td>${trade.entryDate ?? ''}</td>
        <td>${exitCell}</td>
        <td><button type="button" class="btn btn-sm btn-outline-primary">Edit</button></td>
      `;

      const btn = row.querySelector('button');
      if (btn) btn.addEventListener('click', () => window.editTrade(index));

      tbody.appendChild(row);
    });
  }

  // ========= 📈 Render Charts =========
  function destroyChartIfAny(canvas) {
    if (canvas && canvas._chartInstance && typeof canvas._chartInstance.destroy === 'function') {
      canvas._chartInstance.destroy();
      canvas._chartInstance = null;
    }
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // Equity chart
    const equityCanvas = document.getElementById('equityChart');
    if (equityCanvas) {
      destroyChartIfAny(equityCanvas);
      const data = [60000, 64000, 67000, 72000, 76000, 78000].map(v => asNumber(v, 0));
      const labels = ['Oct 1', 'Oct 5', 'Oct 10', 'Oct 15', 'Oct 20', 'Oct 24'];

      const chart = new Chart(equityCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Equity',
            data,
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
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                label: (ctx) => ` ${fmtUSD(ctx.parsed.y)}`
              }
            }
          },
          interaction: { mode: 'nearest', intersect: false },
          scales: {
            x: { grid: { display: false } },
            y: {
              ticks: {
                callback: (v) => fmtUSD(v)
              }
            }
          }
        }
      });
      equityCanvas._chartInstance = chart;
    }

    // Symbol allocation pie
    const symbolCanvas = document.getElementById('symbolChart');
    if (symbolCanvas) {
      destroyChartIfAny(symbolCanvas);
      const data = [1500, 4500, 9600, 3000].map(v => asNumber(v, 0));

      const chart = new Chart(symbolCanvas, {
        type: 'pie',
        data: {
          labels: ['AAPL', 'GOOG', 'MSFT', 'TSLA'],
          datasets: [{
            data,
            backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.5,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}`
              }
            }
          }
        }
      });
      symbolCanvas._chartInstance = chart;
    }
  }

  // ========= 📰 Render Ticker =========
  function renderTicker() {
    const el = document.getElementById('ticker-scroll');
    if (!el) return;

    const parts = [
      `AAPL: ${fmtUSD(marketPrices?.AAPL)}`,
      `GOOG: ${fmtUSD(marketPrices?.GOOG)}`,
      `MSFT: ${fmtUSD(marketPrices?.MSFT)}`,
      `TSLA: ${fmtUSD(marketPrices?.TSLA)}`
    ];
    el.textContent = parts.join(' | ');
  }

  // ========= 📊 Render P/L by Broker =========
  function renderPL() {
    const tbody = document.getElementById('plRows');
    const combined = document.getElementById('combinedPL');
    if (!tbody || !combined) return;

    const brokers = {};
    trades.forEach(trade => {
      const pl = asNumber(getPL(trade), 0);
      const broker = (trade.broker || 'Unknown').toString();
      if (!brokers[broker]) brokers[broker] = { realized: 0, unrealized: 0 };
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
    const container = document.getElementById('portfolio');
    if (!container) return;

    const summary = document.createElement('div');

    const symbols = {};
    let invested = 0;
    let currentValue = 0;

    trades.forEach(trade => {
      const sym = trade.symbol ?? '';
      const qty = asNumber(trade.qty, 0);
      const entry = asNumber(trade.entry, 0);
      const last = asNumber(marketPrices?.[sym], entry);
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

    summary.innerHTML = `
      <p><strong>Total Positions:</strong> ${trades.length}</p>
      <p><strong>Total Invested:</strong> ${fmtUSD(invested)}</p>
      <p><strong>Current Value:</strong> ${fmtUSD(currentValue)}</p>
      <p><strong>Unrealized P/L:</strong> ${formatPL(netPL)}</p>
      <h3>Holdings by Symbol:</h3>
      <ul>${holdings}</ul>
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
    if (form.qty) form.qty.value = asNumber(trade.qty, 0);
    if (form.entry) form.entry.value = asNumber(trade.entry, 0);
    if (form.date) form.date.value = trade.entryDate ?? '';
    if (form.exit) form.exit.value = trade.exit ?? '';
    if (form.exitDate) form.exitDate.value = trade.exitDate ?? '';
    if (form.multiplier) form.multiplier.value = trade.multiplier ?? (trade.type === 'option' ? 100 : 1);
    if (form.type) form.type.value = trade.type ?? 'stock';
    if (form.broker) form.broker.value = trade.broker ?? '';

    form.dataset.editIndex = String(index);
    if (form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth' });
  };

  // ========= 📝 Form Submission Handler =========
  const tradeForm = document.getElementById('tradeForm');
  if (tradeForm) {
    tradeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;

      const newTrade = {
        symbol: (form.symbol?.value || '').trim(),
        qty: asNumber(form.qty?.value, 0),
        entry: asNumber(form.entry?.value, 0),
        entryDate: form.date?.value || '',
        exit: form.exit?.value ? asNumber(form.exit.value, null) : null,
        exitDate: form.exitDate?.value || null,
        multiplier: form.multiplier?.value
          ? asNumber(form.multiplier.value, 1)
          : (form.type?.value === 'option' ? 100 : 1),
        type: form.type?.value || 'stock',
        broker: form.broker?.value || ''
      };

      const idx = form.dataset.editIndex;
      if (idx !== undefined && idx !== null) {
        trades[Number(idx)] = newTrade;
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

      const target = document.getElementById(targetId);
      if (target) target.style.display = 'block';
    });
  });

  // ========= 📤 Export Trades to CSV =========
  const exportBtn = document.getElementById('exportCSV');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      let csv = 'Symbol,Qty,Entry,Date,Exit\n';
      trades.forEach(trade => {
        csv += [
          trade.symbol ?? '',
          asNumber(trade.qty, 0),
          asNumber(trade.entry, 0),
          trade.entryDate ?? '',
          trade.exit == null ? '' : asNumber(trade.exit, 0)
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
