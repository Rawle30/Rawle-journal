document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }

  document.getElementById('darkToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const mode = document.body.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', mode);
  });

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

  function formatPL(value) {
    const color = value >= 0 ? 'green' : 'red';
    return `<span class="${color}">$${value.toFixed(2)}</span>`;
  }

  function getPL(trade) {
    const price = trade.exit ?? marketPrices[trade.symbol] ?? trade.entry;
    const multiplier = trade.type === 'option' ? trade.multiplier || 100 : 1;
    return (price - trade.entry) * trade.qty * multiplier;
  }

  function renderTrades() {
    const tbody = document.getElementById('tradeRows');
    tbody.innerHTML = '';
    trades.forEach((trade, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${trade.symbol}</td>
        <td>${trade.qty}</td>
        <td>$${trade.entry}</td>
        <td>${trade.entryDate}</td>
        <td>${trade.exit ?? '-'}</td>
        <td><button onclick="editTrade(${index})">Edit</button></td>
      `;
      tbody.appendChild(row);
    });
  }

  function renderCharts() {
    new Chart(document.getElementById('equityChart'), {
      type: 'line',
      data: {
        labels: ['Oct 1', 'Oct 5', 'Oct 10', 'Oct 15', 'Oct 20', 'Oct 24'],
        datasets: [{
          label: 'Equity',
          data: [60000, 64000, 67000, 72000, 76000, 78000],
          borderColor: '#7DDA58',
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    new Chart(document.getElementById('symbolChart'), {
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
        maintainAspectRatio: false
      }
    });
  }

  function renderTicker() {
    const ticker = document.getElementById('ticker-scroll');
    ticker.textContent = `AAPL: $${marketPrices.AAPL} | GOOG: $${marketPrices.GOOG} | MSFT: $${marketPrices.MSFT} | TSLA: $${marketPrices.TSLA}`;
  }

  function renderPL() {
    const brokers = {};
    trades.forEach(trade => {
      const pl = getPL(trade);
      const broker = trade.broker || 'Unknown';
      if (!brokers[broker]) {
        brokers[broker] = { realized: 0, unrealized: 0 };
      }
      if (trade.exit) {
        brokers[broker].realized += pl;
      } else {
        brokers[broker].unrealized += pl;
      }
    });

    const tbody = document.getElementById('plRows');
    tbody.innerHTML = '';
    let totalRealized = 0;
    let totalUnrealized = 0;

    for (const broker in brokers) {
      const realized = formatPL(brokers[broker].realized);
      const unrealized = formatPL(brokers[broker].unrealized);
      const row = document.createElement('tr');
      row.innerHTML = `<td>${broker}</td><td>${realized}</td><td>${unrealized}</td>`;
      tbody.appendChild(row);
      totalRealized += brokers[broker].realized;
      totalUnrealized += brokers[broker].unrealized;
    }

    document.getElementById('combinedPL').innerHTML = formatPL(totalRealized + totalUnrealized);
  }

  function renderPortfolio() {
    const container = document.getElementById('portfolio');
    const summary = document.createElement('div');

    const symbols = {};
    let invested = 0;
    let currentValue = 0;

    trades.forEach(trade => {
      const symbol =
      const entry = trade.entry;
      const price = marketPrices[symbol] ?? entry;
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

    summary.innerHTML = `
      <p><strong>Total Positions:</strong> ${trades.length}</p>
      <p><strong>Total Invested:</strong> $${invested.toFixed(2)}</p>
      <p><strong>Current Value:</strong> $${currentValue.toFixed(2)}</p>
      <p><strong>Unrealized P/L:</strong> ${formatPL(netPL)}</p>
      <h3>Holdings by Symbol:</h3>
      <ul>
        ${Object.entries(symbols).map(([sym, data]) =>
          `<li>${sym}: ${data.qty} shares ($${formatPL(data.value)})</li>`).join('')}
      </ul>
    `;

    container.innerHTML = '';
    container.appendChild(summary);
  }

  // ✏️ Edit Trade Handler
  window.editTrade = function(index) {
    const trade = trades[index];
    const form = document.getElementById('tradeForm');

    form.symbol.value = trade.symbol;
    form.qty.value = trade.qty;
    form.entry.value = trade.entry;
    form.date.value = trade.entryDate;
    form.exit.value = trade.exit ?? '';
    form.exitDate.value = trade.exitDate ?? '';
    form.multiplier.value = trade.multiplier ?? 100;
    form.type.value = trade.type;
    form.broker.value = trade.broker;

    form.dataset.editIndex = index;
    form.scrollIntoView({ behavior: 'smooth' });
  };

  // 📝 Form Submission Handler
  document.getElementById('tradeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const form = e.target;

    const newTrade = {
      symbol: form.symbol.value.trim(),
      qty: parseFloat(form.qty.value),
      entry: parseFloat(form.entry.value),
      entryDate: form.date.value,
      exit: form.exit.value ? parseFloat(form.exit.value) : null,
      exitDate: form.exitDate.value || null,
      multiplier: form.multiplier.value ? parseInt(form.multiplier.value) : 100,
      type: form.type.value,
      broker: form.broker.value
    };

    const editIndex = form.dataset.editIndex;
    if (editIndex !== undefined) {
      trades[editIndex] = newTrade;
      delete form.dataset.editIndex;
    } else {
      trades.push(newTrade);
    }

    form.reset();
    renderTrades();
    renderPL();
    renderCharts();
    renderPortfolio();
  });

  // 🧭 Sidebar Tab Navigation
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
  // 📤 Export Trades Table to CSV
  const exportBtn = document.getElementById('exportCSV');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      let csv = 'Symbol,Qty,Entry,Date,Exit\n';
      trades.forEach(trade => {
        csv += `${trade.symbol},${trade.qty},${trade.entry},${trade.entryDate},${trade.exit ?? ''}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'trades.csv';
      link.click();
    });
  }

  // 🚀 Initialize Dashboard
  renderTrades();
  renderCharts();
  renderTicker();
  renderPL();
  renderPortfolio();
});






