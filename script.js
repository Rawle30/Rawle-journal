document.addEventListener('DOMContentLoaded', () => {
  // 🌙 Dark Mode Toggle
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }

  document.getElementById('darkToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const mode = document.body.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', mode);
  });

  // 📊 Sample Trades
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

  // 📈 Profit/Loss Calculation
  function getPL(trade) {
    const price = trade.exit ?? marketPrices[trade.symbol] ?? trade.entry;
    const multiplier = trade.type === 'option' ? trade.multiplier || 100 : 1;
    return (price - trade.entry) * trade.qty * multiplier;
  }

  // 📋 Render Trades Table
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

  // 📊 Render Charts
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

  // 📰 Render Ticker
  function renderTicker() {
    const ticker = document.getElementById('ticker-scroll');
    ticker.textContent = `AAPL: $${marketPrices.AAPL} | GOOG: $${marketPrices.GOOG} | MSFT: $${marketPrices.MSFT} | TSLA: $${marketPrices.TSLA}`;
  }

  // 💰 Render Profit/Loss Summary
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
      const row = document.createElement('tr');
      const realized = brokers[broker].realized.toFixed(2);
      const unrealized = brokers[broker].unrealized.toFixed(2);
      row.innerHTML = `<td>${broker}</td><td>$${realized}</td><td>$${unrealized}</td>`;
      tbody.appendChild(row);
      totalRealized += brokers[broker].realized;
      totalUnrealized += brokers[broker].unrealized;
    }

    document.getElementById('combinedPL').textContent = `$${(totalRealized + totalUnrealized).toFixed(2)}`;
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
  document.getElementById('exportCSV')?.addEventListener('click', () => {
    const rows = document.querySelectorAll('#tradeRows tr');
    let csv = 'Symbol,Qty,Entry,Date,Exit\n';
    rows.forEach(row => {
      const cols = row.querySelectorAll('td');
      const data = Array.from(cols).slice(0, 5).map(td => td.textContent.trim());
      csv += data.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'trades.csv';
    link.click();
  });

  // 🚀 Initialize Dashboard
  renderTrades();
  renderCharts();
  renderTicker();
  renderPL();
});







