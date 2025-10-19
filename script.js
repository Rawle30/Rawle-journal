document.addEventListener('DOMContentLoaded', () => {
  // 🌙 Dark Mode Toggle
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }

  document.getElementById('darkToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });

  // 📦 Compact Mode Toggle
  document.getElementById('compactToggle')?.addEventListener('change', function () {
    document.body.classList.toggle('compact', this.checked);
  });

  const trades = [];

  // 🧠 Load from localStorage
  const stored = localStorage.getItem('trades');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) trades.push(...parsed);
    } catch (e) {
      console.warn('Failed to load saved trades:', e);
    }
  }

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

  function saveTrades() {
    localStorage.setItem('trades', JSON.stringify(trades));
  }

  function renderTrades(brokerFilter = 'all', symbolFilter = '') {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    const tagFilter = document.getElementById('tagFilter')?.value.toLowerCase();

    const tbody = document.getElementById('tradeRows');
    tbody.innerHTML = '';

    const filteredTrades = trades.filter(trade => {
      const brokerMatch = brokerFilter === 'all' || trade.broker === brokerFilter;
      const symbolMatch = trade.symbol.toLowerCase().includes(symbolFilter.toLowerCase());
      const entryDate = new Date(trade.entryDate);
      const startMatch = !startDate || entryDate >= new Date(startDate);
      const endMatch = !endDate || entryDate <= new Date(endDate);
      const tagMatch = !tagFilter || (trade.tags || []).some(tag => tag.toLowerCase().includes(tagFilter));
      return brokerMatch && symbolMatch && startMatch && endMatch && tagMatch;
    });

    filteredTrades.forEach((trade, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${trade.symbol}</td>
        <td>${trade.qty}</td>
        <td>$${trade.entry}</td>
        <td>${trade.entryDate}</td>
        <td>${trade.exit ?? '-'}</td>
        <td>${trade.exitDate ?? '-'}</td>
        <td>${trade.multiplier ?? 100}</td>
        <td>${trade.type}</td>
        <td data-broker="${trade.broker}"></td>
        <td><button onclick="editTrade(${index})">Edit</button></td>
      `;
      tbody.appendChild(row);
    });

    document.getElementById('tradeCount').textContent = `${filteredTrades.length} trades shown`;

    const totalPL = filteredTrades.reduce((sum, t) => sum + getPL(t), 0);
    const avgPL = filteredTrades.length ? totalPL / filteredTrades.length : 0;
    document.getElementById('tradeSummary').innerHTML = `
      <p><strong>Total P/L:</strong> ${formatPL(totalPL)}</p>
      <p><strong>Average P/L:</strong> ${formatPL(avgPL)}</p>
    `;

    renderCharts(filteredTrades);
  }

  function renderCharts(filtered = trades) {
    const labels = filtered.map(t => t.symbol);
    const equityData = filtered.map(t => getPL(t));
    const chartType = document.getElementById('chartType')?.value || 'line';

    new Chart(document.getElementById('equityChart'), {
      type: chartType,
      data: {
        labels,
        datasets: [{
          label: 'Equity',
          data: equityData,
          backgroundColor: chartType === 'bar' ? '#7DDA58' : undefined,
          borderColor: chartType === 'line' ? '#7DDA58' : undefined,
          fill: false
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    const symbolCounts = {};
    filtered.forEach(t => {
      symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1;
    });

    new Chart(document.getElementById('symbolChart'), {
      type: 'pie',
      data: {
        labels: Object.keys(symbolCounts),
        datasets: [{
          data: Object.values(symbolCounts),
          backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900', '#DFC57B']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    const brokerCounts = {};
    filtered.forEach(t => {
      brokerCounts[t.broker] = (brokerCounts[t.broker] || 0) + 1;
    });

    new Chart(document.getElementById('brokerChart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(brokerCounts),
        datasets: [{
          data: Object.values(brokerCounts),
          backgroundColor: ['#5DE2E7', '#FFDE59', '#7DDA58', '#FE9900', '#DFC57B']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

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
    form.tags.value = (trade.tags || []).join(', ');
    form.dataset.editIndex = index.toString();
    form.scrollIntoView({ behavior: 'smooth' });
  };

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
      broker: form.broker.value,
      tags: form.tags.value.split(',').map(t => t.trim()).filter(Boolean)
    };

    const editIndex = form.dataset.editIndex;
    if (editIndex !== undefined && editIndex !== '') {
      trades[parseInt(editIndex)] = newTrade;
      delete form.dataset.editIndex;
    } else {
      trades.push(newTrade);
    }

    form.reset();
    saveTrades();
    renderTrades(document.getElementById('brokerFilter').value, document.getElementById('symbolSearch').value);
  });

  document.querySelectorAll('.sidebar li').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('main section').forEach(sec => {
        sec.classList.remove('active-section');
        sec.style.display = 'none';
      });
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.add('active-section');
        targetSection.style.display = 'block';
      }
    });
  });

  // 🧭 Swipe Navigation
  let touchStartX = 0;
  let touchEndX = 0;

  document.body.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  });

  document.body.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    const delta = touchEndX - touchStartX;
    if (Math.abs(delta) < 50) return;
    const tabs = Array.from(document.querySelectorAll('.sidebar li'));
    const activeIndex = tabs.findIndex(tab => tab.classList.contains('active'));
    const nextIndex = delta > 0 ? activeIndex - 1 : activeIndex + 1;
    if (nextIndex >= 0 && nextIndex < tabs.length) {
      tabs[nextIndex].click();
    }
  });

  // 🔍 Filter Listeners
  ['brokerFilter', 'symbolSearch', 'tagFilter', 'startDate', 'endDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const broker = document.getElementById('brokerFilter').value;
        const symbol = document.getElementById('symbolSearch').value;
        renderTrades(broker, symbol);
      });
    }
  });

  // 📤 Export Filtered Trades
  document.getElementById('exportFiltered')?.addEventListener('click', () => {
    const broker = document.getElementById('brokerFilter').value;
    const symbol = document.getElementById('symbolSearch').value;
    const tag = document.getElementById('tagFilter').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    const filtered = trades.filter(trade => {
      const entryDate = new Date(trade.entryDate);
      return (
        (broker === 'all' || trade.broker === broker) &&
        trade.symbol.toLowerCase().includes(symbol.toLowerCase()) &&
        (!startDate || entryDate >= new Date(startDate)) &&
        (!endDate || entryDate <= new Date(endDate)) &&
        (!tag || (trade.tags || []).some(t => t.toLowerCase().includes(tag.toLowerCase())))
      );
    });

    let csv = 'Symbol,Qty,Entry,Date,Exit,ExitDate,Multiplier,Type,Broker,Tags\n';
    filtered.forEach(trade => {
      csv += `${trade.symbol},${trade.qty},${trade.entry},${trade.entryDate},${trade.exit ?? ''},${trade.exitDate ?? ''},${trade.multiplier ?? 100},${trade.type},${trade.broker},"${(trade.tags || []).join(', ')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'filtered_trades.csv';
    link.click();
  });

  // 📥 CSV Import
  document.getElementById('importCSV')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      parseCSV(event.target.result);
    };
    reader.readAsText(file);
  });

  // 📂 Drag-and-Drop CSV Upload
  const dropZone = document.getElementById('dropZone');
  dropZone?.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = function (event) {
        parseCSV(event.target.result);
      };
      reader.readAsText(file);
    }
  });

  // 🧠 CSV Parser
  function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    const newTrades = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < 9) continue;

      const trade = {
        symbol: values[0],
        qty: parseFloat(values[1]),
        entry: parseFloat(values[2]),
        entryDate: values[3],
        exit: values[4] ? parseFloat(values[4]) : null,
        exitDate: values[5] || null,
        multiplier: values[6] ? parseInt(values[6]) : 100,
        type: values[7],
        broker: values[8],
        tags: values[9] ? values[9].split(',').map(t => t.trim()) : []
      };

      newTrades.push(trade);
    }

    trades.length = 0;
    trades.push(...newTrades);
    saveTrades();
    renderTrades(document.getElementById('brokerFilter').value, document.getElementById('symbolSearch').value);
  }

  // 📈 Profit / Loss Summary
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

  // 📊 Portfolio Overview
  function renderPortfolio() {
    const container = document.getElementById('portfolio-summary');
    const symbols = {};
    let invested = 0;
    let currentValue = 0;

    trades.forEach(trade => {
      const symbol = trade.symbol;
      const qty = trade.qty;
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

    container.innerHTML = `
      <p><strong>Total Positions:</strong> ${trades.length}</p>
      <p><strong>Total Invested:</strong> $${invested.toFixed(2)}</p>
      <p><strong>Current Value:</strong> $${currentValue.toFixed(2)}</p>
      <p><strong>Unrealized P/L:</strong> ${formatPL(netPL)}</p>
      <h3>Holdings by Symbol:</h3>
      <ul>
        ${Object.entries(symbols).map(([sym, data]) =>
          `<li>${sym}: ${data.qty} shares (${formatPL(data.value)})</li>`).join('')}
      </ul>
    `;
  }

  // 🟢 Ticker
  function renderTicker() {
    const ticker = document.getElementById('ticker-scroll');
    ticker.textContent = `AAPL: $${marketPrices.AAPL} | GOOG: $${marketPrices.GOOG} | MSFT: $${marketPrices.MSFT} | TSLA: $${marketPrices.TSLA}`;
  }

  // 🚀 Initialize
  renderTrades();
  renderCharts();
  renderTicker();
  renderPL();
  renderPortfolio();
});

